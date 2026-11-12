import { describe, expect, test } from "bun:test";
import { lookupDefinitions } from "../public/ts/ai/dictionaryLookup";
import { AIResponseError } from "../public/ts/ai/deepseekClient";
import type { BilingualMeaning } from "../public/ts/ai/dictionary";
const meaning = { english: "a financial institution", chinese: "银行" };
function cache() {
  const values = new Map<string, BilingualMeaning>();
  return { values, get: (term: string) => values.get(term), set: (term: string, value: BilingualMeaning) => { values.set(term, value); } };
}
const response = (terms: string[]) => JSON.stringify({ definitions: terms.map(term => ({ term, ...meaning })) });
describe("economical bilingual dictionary resolution", () => {
  test("three identical targets result in one entry in one paid request, applied at all offsets", async () => {
    const saved = cache(), calls: string[][] = [];
    const result = await lookupDefinitions([10, 20, 30].map(offset => ({ term: "bank", offset })), saved, async terms => { calls.push(terms); return response(terms); });
    expect(calls).toEqual([["bank"]]); expect(result.requested).toBe(1);
    expect(result.definitions.map(item => item.offset)).toEqual([10, 20, 30]);
    expect(result.definitions.every(item => item.chinese === "银行")).toBe(true);
  });
  test("existing notes and query hits need no API key or remote call", async () => {
    const saved = cache(); saved.set("bank", meaning);
    const result = await lookupDefinitions([{ term: "bank", offset: 1 }, { term: "bank", offset: 2, existing: meaning }], saved,
      async () => { throw new Error("No remote request should be made"); });
    expect(result.cached).toBe(1); expect(result.kept).toBe(1); expect(result.requested).toBe(0);
    expect(result.definitions).toHaveLength(1);
  });
  test("only known target identities seed reuse; a legacy note is kept without guessing its phrase", async () => {
    const saved = cache();
    await lookupDefinitions([{ term: "bank", offset: 1, existing: meaning }], saved, async () => { throw new Error("Unexpected request"); });
    expect(saved.get("bank")).toBeUndefined();
    const result = await lookupDefinitions([{ term: "bank", offset: 1, existing: meaning, cacheExisting: true }, { term: "bank", offset: 2 }], saved,
      async () => { throw new Error("Unexpected request"); });
    expect(result.kept).toBe(1); expect(result.cached).toBe(1);
  });
  test("refresh explicitly bypasses existing notes and cached results, while still deduplicating", async () => {
    const saved = cache(); saved.set("bank", meaning);
    const changed = { english: "the land beside a river", chinese: "河岸" }, calls: string[][] = [];
    const result = await lookupDefinitions([{ term: "bank", offset: 1, existing: meaning }, { term: "bank", offset: 2 }], saved,
      async terms => { calls.push(terms); return JSON.stringify({ definitions: [{ term: "bank", ...changed }] }); }, { refresh: true });
    expect(calls).toEqual([["bank"]]); expect(result.kept).toBe(0); expect(result.cached).toBe(0);
    expect(result.definitions.map(item => item.chinese)).toEqual(["河岸", "河岸"]);
    expect(saved.get("bank")).toEqual(changed);
  });
  test("case-sensitive keys keep US and us separate; unsolicited output is neither applied nor cached", async () => {
    const saved = cache(), calls: string[][] = [];
    const result = await lookupDefinitions([{ term: "US", offset: 1 }, { term: "us", offset: 2 }], saved, async terms => {
      calls.push(terms); return response([...terms, "unasked"]);
    });
    expect(calls).toEqual([["US", "us"]]); expect(result.definitions).toHaveLength(2);
    expect(saved.get("unasked")).toBeUndefined();
  });
  test("large selections are bounded batches rather than unbounded completions", async () => {
    const saved = cache(), calls: string[][] = [];
    const targets = Array.from({ length: 25 }, (_, offset) => ({ term: `word${offset}`, offset }));
    const result = await lookupDefinitions(targets, saved, async terms => { calls.push(terms); return response(terms); });
    expect(calls.map(terms => terms.length)).toEqual([12, 12, 1]); expect(result.definitions).toHaveLength(25);
  });
  test("partial valid responses are retained and a later retry requests only missing entries", async () => {
    const saved = cache(), targets = [{ term: "bank", offset: 1 }, { term: "fox", offset: 2 }];
    const first = await lookupDefinitions(targets, saved, async () => response(["bank"]));
    expect(first.definitions).toHaveLength(1);
    const calls: string[][] = [];
    const retried = await lookupDefinitions(targets, saved, async terms => { calls.push(terms); return response(terms); });
    expect(calls).toEqual([["fox"]]); expect(retried.cached).toBe(1); expect(retried.definitions).toHaveLength(2);
  });
  test("length truncation salvages complete entries with no automatic repair request", async () => {
    const saved = cache(); let calls = 0;
    const result = await lookupDefinitions([{ term: "bank", offset: 1 }, { term: "fox", offset: 2 }], saved, async () => {
      calls++; throw new AIResponseError("Truncated", "length", '{"definitions":[{"term":"bank","english":"a financial institution","chinese":"银行"},{"term":"fox"');
    });
    expect(calls).toBe(1); expect(result.definitions.map(item => item.term)).toEqual(["bank"]);
    expect(saved.get("bank")).toEqual(meaning); expect(saved.get("fox")).toBeUndefined();
    expect(result.error).toContain("missing terms");
  });
  test("a later network failure retains completed batches and stops further paid work", async () => {
    const saved = cache(); let calls = 0;
    const targets = Array.from({ length: 30 }, (_, offset) => ({ term: `word${offset}`, offset }));
    const result = await lookupDefinitions(targets, saved, async terms => { if (++calls === 2) throw new Error("Unavailable"); return response(terms); });
    expect(calls).toBe(2); expect(result.definitions).toHaveLength(12); expect(result.error).toBe("Unavailable");
  });
  test("invalid JSON is not silently repaired or automatically retried", async () => {
    let calls = 0;
    const result = await lookupDefinitions([{ term: "bank", offset: 1 }], cache(), async () => { calls++; return "{"; });
    expect(calls).toBe(1); expect(result.definitions).toHaveLength(0); expect(result.error).toContain("invalid");
  });
  test("a valid but empty response is reported as unusable without another request", async () => {
    let calls = 0;
    const result = await lookupDefinitions([{ term: "bank", offset: 1 }], cache(), async () => { calls++; return response([]); });
    expect(calls).toBe(1); expect(result.definitions).toHaveLength(0);
    expect(result.error).toContain("no usable bilingual definitions");
  });
  test("cancellation prevents late results from entering either the article or query cache", async () => {
    const saved = cache(), controller = new AbortController();
    const result = lookupDefinitions([{ term: "bank", offset: 1 }], saved, async terms => { controller.abort(); return response(terms); }, { signal: controller.signal });
    await expect(result).rejects.toThrow(); expect(saved.get("bank")).toBeUndefined();
    let called = false;
    await expect(lookupDefinitions([{ term: "fox", offset: 1 }], saved, async terms => { called = true; return response(terms); }, { signal: controller.signal })).rejects.toThrow();
    expect(called).toBe(false);
  });
});
