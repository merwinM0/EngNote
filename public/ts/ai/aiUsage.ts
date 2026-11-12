export const AI_USAGE_STORAGE = "er_ai_usage_v1";
export type AIUsageSnapshot = { requests: number; reportedRequests: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheReportedRequests: number };
const empty = (): AIUsageSnapshot => ({ requests: 0, reportedRequests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheReportedRequests: 0 });
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
type UsageStorage = Pick<Storage, "getItem" | "setItem">;

/** Provider-reported counts only. Unknown/aborted requests are not counted as free. */
export class AIUsage {
  private totals = empty();
  private listeners = new Set<() => void>();
  constructor(private readonly storage: () => UsageStorage) {}
  snapshot(): AIUsageSnapshot { return { ...this.totals }; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  restore() {
    this.totals = empty();
    try {
      const value: unknown = JSON.parse(this.storage().getItem(AI_USAGE_STORAGE) ?? "null");
      if (value && typeof value === "object" && Object.keys(empty()).every(key => key in value && count(Reflect.get(value, key)))) {
        const saved = Object.fromEntries(Object.keys(empty()).map(key => [key, Reflect.get(value, key)])) as AIUsageSnapshot;
        if (saved.reportedRequests <= saved.requests && saved.cacheReportedRequests <= saved.reportedRequests && saved.cachedInputTokens <= saved.inputTokens) this.totals = saved;
      }
    } catch { /* Optional tab storage. */ }
    this.notify();
  }
  begin() { this.totals.requests++; this.notify(); }
  record(value: unknown) {
    if (!value || typeof value !== "object" || !("prompt_tokens" in value) || !("completion_tokens" in value)
      || !count(value.prompt_tokens) || !count(value.completion_tokens)) return;
    this.totals.reportedRequests++;
    this.totals.inputTokens += value.prompt_tokens;
    this.totals.outputTokens += value.completion_tokens;
    const details = "prompt_tokens_details" in value ? value.prompt_tokens_details : null;
    const cached = "prompt_cache_hit_tokens" in value ? value.prompt_cache_hit_tokens
      : details && typeof details === "object" && "cached_tokens" in details ? details.cached_tokens : undefined;
    if (count(cached) && cached <= value.prompt_tokens) {
      this.totals.cacheReportedRequests++;
      this.totals.cachedInputTokens += cached;
    }
    this.notify();
  }
  private notify() {
    try { this.storage().setItem(AI_USAGE_STORAGE, JSON.stringify(this.totals)); } catch { /* Keep counts in memory. */ }
    for (const listener of this.listeners) listener();
  }
}
export const aiUsage = new AIUsage(() => sessionStorage);

export function describeAIUsage(usage: AIUsageSnapshot): string {
  if (!usage.requests) return "No AI requests in this tab yet.";
  const unknown = usage.requests - usage.reportedRequests;
  return `${usage.requests.toLocaleString()} request(s) · reported input ${usage.inputTokens.toLocaleString()} / output ${usage.outputTokens.toLocaleString()} tokens. `
    + (usage.cacheReportedRequests ? `Provider-cached input: ${usage.cachedInputTokens.toLocaleString()} tokens (${usage.cacheReportedRequests}/${usage.reportedRequests} usage reports). ` : "Provider cache usage was not reported. ")
    + (unknown ? `${unknown} request(s) have unknown token usage, including interrupted or failed requests. ` : "")
    + "Counts are not a bill; check your provider for charges.";
}
