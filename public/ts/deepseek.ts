export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const KEY_STORAGE = "er_deepseek_tab_key";
export function getStoredApiKey(): string {
  return (document.getElementById("apiKey") as HTMLInputElement).value.trim();
}
export async function callDeepSeek(system: string, userMessage: string): Promise<string> {
  const key = getStoredApiKey();
  if (!key) throw new Error("Open AI tools and enter your DeepSeek API key first.");
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST", signal: AbortSignal.timeout(90000),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: system }, { role: "user", content: userMessage }], temperature: 0.3, stream: false }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "DeepSeek rejected this key. Check your API key."
    : res.status === 429 ? "DeepSeek is busy or your quota is exhausted. Please try later."
    : `DeepSeek request failed (${res.status}). Please try again.`);
  const data: unknown = await res.json();
  if (typeof data !== "object" || data === null || !("choices" in data) || !Array.isArray(data.choices)) throw new Error("Unexpected DeepSeek response.");
  const text: unknown = data.choices[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("DeepSeek returned an empty response.");
  return text.trim();
}
