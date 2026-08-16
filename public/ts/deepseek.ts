/**
 * deepseek.ts - DeepSeek API wrapper
 */
import { setStatus } from "./util";

export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-chat";
export const COOKIE_KEY = "deepseek_api_key";

// ---------------- API Key (cookie) ----------------
export function getStoredApiKey(): string {
  const input = document.getElementById("apiKey") as HTMLInputElement | null;
  return input?.value.trim() ?? "";
}

export async function callDeepSeek(
  system: string,
  userMessage: string
): Promise<string> {
  const key = getStoredApiKey();
  if (!key) {
    setStatus("⚠ Please enter and save a DeepSeek API Key", "error");
    throw new Error("NO_API_KEY");
  }
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      stream: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    setStatus(`❌ DeepSeek request failed (${res.status}) ${detail.slice(0, 200)}`, "error");
    throw new Error("API_ERROR");
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    setStatus("❌ DeepSeek returned empty content", "error");
    throw new Error("EMPTY_RESPONSE");
  }
  return text.trim();
}
