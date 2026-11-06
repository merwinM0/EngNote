import { getApiKey, openAISettings } from "./aiSettings";
import { aiUsage } from "./aiUsage";
import { requestDeepSeek } from "./deepseekClient";
import type { DeepSeekOptions } from "./deepseekClient";
export { DEEPSEEK_URL } from "./deepseekClient";

export const getStoredApiKey = getApiKey;
export async function callDeepSeek(system: string, userMessage: string, signal?: AbortSignal, options?: DeepSeekOptions): Promise<string> {
  const key = getStoredApiKey();
  if (!key) {
    openAISettings();
    throw new Error("Use AI setup to add your DeepSeek API key first.");
  }
  return requestDeepSeek({ key, system, userMessage, signal, options }, { fetch, usage: aiUsage });
}
