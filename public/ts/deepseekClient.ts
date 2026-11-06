import type { AIUsage } from "./aiUsage";
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export type DeepSeekOptions = { maxTokens?: number; jsonObject?: boolean };
export class AIResponseError extends Error {
  constructor(message: string, readonly finishReason: string, readonly partialContent = "") { super(message); }
}
type Request = { key: string; system: string; userMessage: string; signal?: AbortSignal; options?: DeepSeekOptions };
type Dependencies = { fetch: (url: string, init: RequestInit) => Promise<Response>; usage: Pick<AIUsage, "begin" | "record"> };

/** Transport is DOM-free so budgets, failures and accounting can be tested without paid calls. */
export async function requestDeepSeek(request: Request, dependencies: Dependencies): Promise<string> {
  const { key, system, userMessage, signal, options = {} } = request;
  const maxTokens = options.maxTokens ?? 4096;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) throw new Error("Invalid AI output budget.");
  signal?.throwIfAborted();
  dependencies.usage.begin();
  // Call fetch as a bare function: window.fetch brand-checks `this`, and using
  // `dependencies.fetch(...)` would pass the dependency object as Window.
  const fetchImpl = dependencies.fetch;
  const res = await fetchImpl(DEEPSEEK_URL, {
    method: "POST", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: system }, { role: "user", content: userMessage }],
      temperature: 0.3, thinking: { type: "disabled" }, stream: false, max_tokens: maxTokens,
      ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "DeepSeek rejected this key. Check your API key."
    : res.status === 429 ? "DeepSeek is busy or your quota is exhausted. Please try later."
    : `DeepSeek request failed (${res.status}). Please try again.`);
  const data: unknown = await res.json();
  if (!data || typeof data !== "object") throw new Error("Unexpected DeepSeek response.");
  if ("usage" in data) dependencies.usage.record(data.usage);
  if (!("choices" in data) || !Array.isArray(data.choices)) throw new Error("Unexpected DeepSeek response.");
  const choice: unknown = data.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object") throw new Error("Unexpected DeepSeek response.");
  const text = "content" in choice.message ? choice.message.content : undefined;
  const reason = "finish_reason" in choice ? choice.finish_reason : undefined;
  if (reason === "length") throw new AIResponseError("AI output reached its token limit. No automatic retry was sent.", "length", typeof text === "string" ? text : "");
  if (typeof reason === "string" && reason !== "stop") throw new AIResponseError("AI did not complete this response. Please try again later.", reason);
  if (typeof text !== "string" || !text.trim()) throw new Error("DeepSeek returned an empty response. No automatic retry was sent.");
  return text.trim();
}
