import { describe, expect, test } from "bun:test";
import { DictionaryCache, DICTIONARY_CACHE_LIMIT, DICTIONARY_CACHE_STORAGE, DICTIONARY_CACHE_TTL } from "../public/ts/ai/dictionaryCache";
import { DICTIONARY_VERSION } from "../public/ts/ai/dictionary";
const meaning = { english: "a financial institution", chinese: "银行" };
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("bounded local dictionary cache", () => {
  test("restores exact terms across instances, without merging case or retaining extra note metadata", () => {
    const saved = storage(), cache = new DictionaryCache(() => saved);
    cache.set(" bank ", { ...meaning, start: 100, term: "bank" } as typeof meaning);
    cache.set("Bank", { english: "a raised area of land", chinese: "岸" });
    const restored = new DictionaryCache(() => saved); restored.restore();
    expect(restored.get("bank")).toEqual(meaning);
    expect(restored.get("Bank")?.chinese).toBe("岸");
    expect(restored.get("BANK")).toBeUndefined();
    expect(saved.values.get(DICTIONARY_CACHE_STORAGE)).not.toContain('"start"');
    const copy = restored.get("bank")!; copy.chinese = "changed";
    expect(restored.get("bank")).toEqual(meaning);
  });
  test("expires entries instead of indefinitely using an old definition", () => {
    let time = 1000;
    const saved = storage(), cache = new DictionaryCache(() => saved, () => time);
    cache.set("bank", meaning);
    time += DICTIONARY_CACHE_TTL;
    expect(cache.get("bank")).toBeUndefined();
    const restored = new DictionaryCache(() => saved, () => time); restored.restore();
    expect(restored.get("bank")).toBeUndefined();
  });
  test("evicts least recently used entries when the bounded capacity is exceeded", () => {
    const saved = storage(), cache = new DictionaryCache(() => saved);
    for (let i = 0; i < DICTIONARY_CACHE_LIMIT; i++) cache.set(`term${i}`, meaning);
    cache.get("term0"); cache.set("last", meaning);
    expect(cache.get("term0")).toEqual(meaning);
    expect(cache.get("term1")).toBeUndefined();
    expect(JSON.parse(saved.values.get(DICTIONARY_CACHE_STORAGE)!).entries.length).toBe(DICTIONARY_CACHE_LIMIT);
  });
  test("persists recency so a recently used entry survives eviction after reload", () => {
    const saved = storage(), cache = new DictionaryCache(() => saved);
    for (let i = 0; i < DICTIONARY_CACHE_LIMIT; i++) cache.set(`term${i}`, meaning);
    cache.get("term0");
    const restored = new DictionaryCache(() => saved); restored.restore();
    restored.set("new", meaning);
    expect(restored.get("term0")).toEqual(meaning);
    expect(restored.get("term1")).toBeUndefined();
  });
  test("rejects corrupt, obsolete, oversized and malformed stored entries", () => {
    const saved = storage(), now = 1000;
    for (const raw of ["{", "null", '{"version":"old","entries":[]}', JSON.stringify({ version: DICTIONARY_VERSION, entries: [
      null, { term: "bank", meaning: { english: "bad" }, expiresAt: now + 100 },
      { term: "bank", meaning, expiresAt: now + DICTIONARY_CACHE_TTL + 1 },
      { term: "a".repeat(3001), meaning, expiresAt: now + 100 },
    ] })]) {
      saved.values.set(DICTIONARY_CACHE_STORAGE, raw);
      const cache = new DictionaryCache(() => saved, () => now); cache.restore();
      expect(cache.get("bank")).toBeUndefined();
    }
  });
  test("blocked storage still permits in-memory use and clearing without touching unrelated keys", () => {
    const cache = new DictionaryCache(() => { throw new Error("Blocked"); });
    cache.restore(); cache.set("bank", meaning);
    expect(cache.get("bank")).toEqual(meaning);
    expect(cache.clear()).toBe(false);
    expect(cache.get("bank")).toBeUndefined();
    const saved = storage(), persistent = new DictionaryCache(() => saved);
    saved.values.set("er_deepseek_tab_key", "unrelated-placeholder");
    persistent.set("bank", meaning); expect(persistent.clear()).toBe(true);
    expect(saved.values.get("er_deepseek_tab_key")).toBe("unrelated-placeholder");
    expect(saved.values.has(DICTIONARY_CACHE_STORAGE)).toBe(false);
  });
});
