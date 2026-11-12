import { describe, expect, test } from "bun:test";
import { AIUsage, AI_USAGE_STORAGE, describeAIUsage } from "../public/ts/ai/aiUsage";
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe("provider-reported AI usage", () => {
  test("counts input/output/cache hits without double-counting cached input", () => {
    const saved = storage(), usage = new AIUsage(() => saved);
    usage.begin(); usage.record({ prompt_tokens: 100, completion_tokens: 30, prompt_cache_hit_tokens: 60, total_tokens: 130 });
    expect(usage.snapshot()).toEqual({ requests: 1, reportedRequests: 1, inputTokens: 100, outputTokens: 30, cachedInputTokens: 60, cacheReportedRequests: 1 });
    usage.begin(); usage.record({ prompt_tokens: 20, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 10 } });
    expect(usage.snapshot().inputTokens).toBe(120); expect(usage.snapshot().cachedInputTokens).toBe(70);
    const restored = new AIUsage(() => saved); restored.restore(); expect(restored.snapshot()).toEqual(usage.snapshot());
  });
  test("missing and invalid usage remains unknown, not zero-cost", () => {
    const usage = new AIUsage(() => storage());
    usage.begin(); usage.record(null);
    usage.begin(); usage.record({ prompt_tokens: -1, completion_tokens: 10 });
    usage.begin(); usage.record({ prompt_tokens: 10, completion_tokens: "20" });
    expect(usage.snapshot().reportedRequests).toBe(0);
    expect(describeAIUsage(usage.snapshot())).toContain("3 request(s) have unknown token usage");
    usage.begin(); usage.record({ prompt_tokens: 10, completion_tokens: 20 });
    expect(describeAIUsage(usage.snapshot())).toContain("Provider cache usage was not reported");
  });
  test("corrupt tab storage and blocked storage do not break requests or expose payloads", () => {
    const saved = storage();
    for (const raw of ["{", "null", JSON.stringify({ requests: 0, reportedRequests: 1, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheReportedRequests: 0 })]) {
      saved.values.set(AI_USAGE_STORAGE, raw);
      const usage = new AIUsage(() => saved); usage.restore(); expect(usage.snapshot().requests).toBe(0);
    }
    const usage = new AIUsage(() => { throw new Error("Blocked"); });
    usage.restore(); usage.begin(); usage.record({ prompt_tokens: 5, completion_tokens: 6 });
    expect(usage.snapshot().outputTokens).toBe(6);
    const normal = new AIUsage(() => saved); normal.begin();
    expect(Object.keys(JSON.parse(saved.values.get(AI_USAGE_STORAGE)!)).sort()).toEqual(Object.keys(normal.snapshot()).sort());
  });
  test("subscribers can observe and stop observing updates", () => {
    const usage = new AIUsage(() => storage()); let events = 0;
    const stop = usage.subscribe(() => { events++; });
    usage.begin(); expect(events).toBe(1); stop(); usage.begin(); expect(events).toBe(1);
  });
});
