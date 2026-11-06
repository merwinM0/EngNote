import { describe, expect, test } from "bun:test";
import { DICTIONARY_PROMPT, dictionaryBatches, dictionaryKey, dictionaryTokenBudget, parseDictionaryResponse } from "../public/ts/dictionary";

const pair = { term: "fox", english: "a wild animal", chinese: "一种野生动物" };
describe("one-response bilingual dictionary", () => {
  test("requests both languages in the same response", () => {
    expect(DICTIONARY_PROMPT).toContain('"definitions":[{"term":"fox"');
    expect(DICTIONARY_PROMPT).toContain("at most 20 words");
    expect(DICTIONARY_PROMPT).toContain("at most 20 characters");
    expect(DICTIONARY_PROMPT).toContain("Both languages are required in this single response");
  });
  test("parses complete English/Chinese pairs and Markdown JSON wrappers", () => {
    const raw = "```json\n" + JSON.stringify([pair, { term: "take off", english: "to leave the ground", chinese: "离开地面起飞" }]) + "\n```";
    const meanings = parseDictionaryResponse(raw);
    expect(meanings.get("fox")).toEqual({ english: pair.english, chinese: pair.chinese });
    expect(meanings.get("take off")).toEqual({ english: "to leave the ground", chinese: "离开地面起飞" });
  });
  test("normalizes whitespace but preserves term case and trims meanings without truncation", () => {
    expect(parseDictionaryResponse(JSON.stringify([{ ...pair, term: " Fox ", english: " a wild animal ", chinese: " 一种野生动物 " }])).get("Fox"))
      .toEqual({ english: pair.english, chinese: pair.chinese });
  });
  test("skips incomplete or malformed pairs instead of creating English-only notes", () => {
    const invalid = [{ term: "fox", english: "a wild animal" }, { term: "fox", chinese: "动物" }, { ...pair, chinese: "" },
      { ...pair, english: "动物" }, { ...pair, english: "" }, { ...pair, chinese: "an animal" }, { ...pair, term: 123 },
      { ...pair, english: "a\nanimal" }, { ...pair, chinese: "动物\n解释" }, { ...pair, chinese: "动物『解释』" },
      { ...pair, english: "a".repeat(601) }, { ...pair, chinese: "中".repeat(601) }, null];
    expect(parseDictionaryResponse(JSON.stringify(invalid)).size).toBe(0);
    expect(parseDictionaryResponse(JSON.stringify([...invalid, pair])).size).toBe(1);
  });
  test("accepts structured JSON objects, Unicode English and separate case-sensitive entries", () => {
    const meanings = parseDictionaryResponse(JSON.stringify({ definitions: [pair,
      { term: "US", english: "the United States", chinese: "美国" }, { term: "us", english: "the speaker and others", chinese: "我们" },
      { term: "cafe", english: "a café serving drinks", chinese: "供应饮品的咖啡馆" }] }));
    expect(meanings.get("US")?.chinese).toBe("美国");
    expect(meanings.get("us")?.chinese).toBe("我们");
    expect(meanings.get("cafe")?.english).toContain("café");
    expect(dictionaryKey(" take   off ")).toBe("take off");
  });
  test("recovers closed items from truncated JSON only when explicitly allowed", () => {
    const raw = '{"definitions":[' + JSON.stringify({ ...pair, english: 'an animal with a "tail" and [ears]' }) + ',{"term":"bird","english":"a flying';
    expect(() => parseDictionaryResponse(raw)).toThrow();
    expect(parseDictionaryResponse(raw, true).get("fox")?.english).toContain('"tail"');
    expect(parseDictionaryResponse(raw, true).has("bird")).toBe(false);
    expect(parseDictionaryResponse('{"definitions":[{"term":"fox"', true).size).toBe(0);
  });
  test("bounds batches and scales the output budget without changing the input terms", () => {
    const terms = Array.from({ length: 25 }, (_, index) => `word${index}`);
    const batches = dictionaryBatches(terms);
    expect(batches.map(batch => batch.length)).toEqual([12, 12, 1]);
    expect(batches.flat()).toEqual(terms);
    expect(dictionaryBatches(["a".repeat(1000), "b".repeat(1000)]).length).toBe(2);
    expect(dictionaryTokenBudget(["fox"])).toBeGreaterThan(128);
    expect(dictionaryTokenBudget(terms.slice(0, 12))).toBeLessThanOrEqual(4096);
    expect(dictionaryTokenBudget(["a".repeat(3000)])).toBeLessThanOrEqual(4096);
  });
  test("rejects invalid JSON and non-array responses", () => {
    for (const raw of ["", "{", "null", "中文", JSON.stringify(pair), '"definitions"']) expect(() => parseDictionaryResponse(raw)).toThrow("bilingual dictionary");
  });
});
