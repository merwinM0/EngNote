import { describe, expect, test } from "bun:test";
import { AIUsage } from "../public/ts/ai/aiUsage";
import { AIResponseError, DEEPSEEK_URL, requestDeepSeek } from "../public/ts/ai/deepseekClient";
const request = { key: "fake-test-key", system: "Return JSON only.", userMessage: '["bank"]', options: { maxTokens: 300, jsonObject: true } };
const reply = (content = '{"definitions":[]}', finish_reason = "stop") => ({ choices: [{ message: { content }, finish_reason }], usage: { prompt_tokens: 100, completion_tokens: 30, prompt_cache_hit_tokens: 60 } });
const usage = () => new AIUsage(() => ({ getItem: () => null, setItem: () => {} }));
describe("DeepSeek request budgets and accounting", () => {
  test("sends bounded non-thinking JSON requests without history or keys in accounting", async () => {
    const stats = usage(); let calls = 0;
    const result = await requestDeepSeek(request, { usage: stats, fetch: async (url, init) => {
      calls++; expect(url).toBe(DEEPSEEK_URL);
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("deepseek-chat"); expect(body.max_tokens).toBe(300);
      expect(body.response_format).toEqual({ type: "json_object" }); expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.messages).toHaveLength(2); expect(body.stream).toBe(false);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer fake-test-key");
      return Response.json(reply());
    } });
    expect(result).toBe('{"definitions":[]}'); expect(calls).toBe(1);
    expect(stats.snapshot().outputTokens).toBe(30);
    expect(JSON.stringify(stats.snapshot())).not.toContain("fake-test-key");
  });
  test("calls fetch without binding the dependency object as Window", async () => {
    const stats = usage();
    const fetchImpl = function (this: { usage?: unknown } | undefined, _url: string, _init: RequestInit) {
      if (this && "usage" in this) throw new TypeError("'fetch' called on an object that does not implement interface Window.");
      return Promise.resolve(Response.json(reply()));
    };
    await expect(requestDeepSeek(request, { usage: stats, fetch: fetchImpl })).resolves.toBe('{"definitions":[]}');
  });
  test("formatting and title callers can use different budgets and output formats", async () => {
    const bodies: Array<Record<string, unknown>> = [], stats = usage();
    for (const options of [{ maxTokens: 2048 }, { maxTokens: 128, jsonObject: true }]) {
      await requestDeepSeek({ ...request, options }, { usage: stats, fetch: async (_, init) => { bodies.push(JSON.parse(String(init.body))); return Response.json(reply()); } });
    }
    expect(bodies[0]?.max_tokens).toBe(2048); expect(bodies[0]).not.toHaveProperty("response_format");
    expect(bodies[1]?.max_tokens).toBe(128); expect(bodies[1]).toHaveProperty("response_format");
  });
  test("length errors preserve partial content and record paid usage before throwing", async () => {
    const stats = usage(), partial = '{"definitions":[{"term":"bank"'; let calls = 0;
    try {
      await requestDeepSeek(request, { usage: stats, fetch: async () => { calls++; return Response.json(reply(partial, "length")); } });
      throw new Error("Expected truncation");
    } catch (error) {
      expect(error).toBeInstanceOf(AIResponseError);
      expect((error as AIResponseError).finishReason).toBe("length");
      expect((error as AIResponseError).partialContent).toBe(partial);
    }
    expect(calls).toBe(1); expect(stats.snapshot().reportedRequests).toBe(1);
  });
  test("HTTP errors, blank output, content filtering and missing usage never trigger automatic retries", async () => {
    for (const response of [() => new Response("Rejected", { status: 401 }), () => new Response("Busy", { status: 429 }),
      () => Response.json(reply("   ")), () => Response.json(reply("", "content_filter")), () => Response.json({ unexpected: true })]) {
      let calls = 0; const stats = usage();
      await expect(requestDeepSeek(request, { usage: stats, fetch: async () => { calls++; return response(); } })).rejects.toThrow();
      expect(calls).toBe(1); expect(stats.snapshot().requests).toBe(1);
    }
    const stats = usage();
    await requestDeepSeek(request, { usage: stats, fetch: async () => Response.json({ choices: [{ message: { content: "Valid" }, finish_reason: "stop" }] }) });
    expect(stats.snapshot().reportedRequests).toBe(0);
  });
  test("invalid budgets and already canceled requests do not send or count requests", async () => {
    const stats = usage(); let calls = 0;
    const dependencies = { usage: stats, fetch: async () => { calls++; return Response.json(reply()); } };
    for (const maxTokens of [0, -1, 8193, NaN]) await expect(requestDeepSeek({ ...request, options: { maxTokens } }, dependencies)).rejects.toThrow("budget");
    const controller = new AbortController(); controller.abort();
    await expect(requestDeepSeek({ ...request, signal: controller.signal }, dependencies)).rejects.toThrow();
    expect(calls).toBe(0); expect(stats.snapshot().requests).toBe(0);
  });
});
