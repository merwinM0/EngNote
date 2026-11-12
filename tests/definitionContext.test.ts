import { createHash } from "node:crypto";
import { sha256Hex, contextDigest } from "../public/ts/definitions/contextFingerprint";
import { describe, expect, test } from "bun:test";
import { contextQuery, contextPayload, plainBody, ARTICLE_CONTEXT_LIMIT, CONTEXT_PROMPT } from "../public/ts/definitions/definitionContext";
import { DefinitionModePreference, DEFINITION_MODE_KEY } from "../public/ts/definitions/definitionMode";
import { DictionaryCache } from "../public/ts/ai/dictionaryCache";
import { lookupDefinitions } from "../public/ts/ai/dictionaryLookup";
import { paginate } from "../public/ts/reading/pagination";

const meaning = { english: "land beside water", chinese: "河岸", britishIPA: "/bæŋk/" };
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  return { values, storage };
}
describe("definition modes and private context fingerprints", () => {
  test("LAN HTTP fingerprint fallback matches standard SHA-256 including padding boundaries", async () => {
    for (const text of ["", "abc", "中文😀", ...[55, 56, 63, 64, 65, 120, 24000].map(length => "a".repeat(length))]) {
      const expected = createHash("sha256").update(text).digest("hex");
      expect(sha256Hex(text)).toBe(expected); expect(await contextDigest(text)).toBe(expected);
    }
  });
  test("defaults to local context before restore and for absent or invalid saved choices", () => {
    for (const value of [null, "", "unknown", "CONTEXT"]) {
      const { storage, values } = fixture();
      if (value !== null) values.set(DEFINITION_MODE_KEY, value);
      const before = [...values.entries()], preference = new DefinitionModePreference(() => storage);
      expect(preference.mode).toBe("context");
      expect(preference.restore()).toBe(true);
      expect(preference.mode).toBe("context");
      expect([...values.entries()]).toEqual(before); // Restoration never writes a preference or key.
    }
  });
  test("preserves every explicit saved mode, including the former simple default", () => {
    for (const mode of ["general", "context", "article"] as const) {
      const { storage, values } = fixture(), preference = new DefinitionModePreference(() => storage);
      preference.set(mode);
      const restored = new DefinitionModePreference(() => storage);
      expect(restored.restore()).toBe(true); expect(restored.mode).toBe(mode);
      expect([...values.keys()]).toEqual([DEFINITION_MODE_KEY]);
    }
  });
  test("blocked storage starts with local context and retains later in-memory choices", () => {
    const blocked = new DefinitionModePreference(() => { throw new Error("blocked"); });
    expect(blocked.restore()).toBe(false); expect(blocked.mode).toBe("context");
    expect(blocked.set("general")).toBe(false); expect(blocked.mode).toBe("general");
    expect(blocked.restore()).toBe(false); expect(blocked.mode).toBe("general");
  });
  test("cycles all three modes on one control and persists each selection", () => {
    const { storage } = fixture(), preference = new DefinitionModePreference(() => storage);
    for (const mode of ["article", "general", "context", "article"] as const) {
      expect(preference.cycle()).toBe(true); expect(preference.mode).toBe(mode);
      const restored = new DefinitionModePreference(() => storage); restored.restore(); expect(restored.mode).toBe(mode);
    }
    const blocked = new DefinitionModePreference(() => { throw new Error("blocked"); });
    expect(blocked.cycle()).toBe(false); expect(blocked.mode).toBe("article");
  });
  test("uses plain body and precise UTF-16 positions, never existing notes", async () => {
    const text = "A fox『animal』 saw a bank『land』 by water.";
    const start = text.indexOf("bank");
    expect(plainBody(text, start)).toEqual({ body: "A fox saw a bank by water.", position: 12 });
    const query = await contextQuery(text, start, "bank", "context");
    expect(query.context).toBe("A fox saw a bank by water."); expect(query.position).toBe(12);
    expect((await contextQuery(text.replace("『animal』", "『other note』"), text.replace("『animal』", "『other note』").indexOf("bank"), "bank", "context")).key).toBe(query.key);
  });
  test("isolates same-spelling occurrences, changed context and all modes", async () => {
    const text = "A bank lent money. The bank beside water was muddy.";
    const a = await contextQuery(text, text.indexOf("bank"), "bank", "context"), b = await contextQuery(text, text.lastIndexOf("bank"), "bank", "context");
    expect(a.key).not.toBe(b.key);
    expect((await contextQuery(text + " Different.", text.indexOf("bank"), "bank", "context")).key).not.toBe(a.key);
    expect((await contextQuery(text, text.indexOf("bank"), "bank", "article")).key).not.toBe(a.key);
    expect((await contextQuery(text, 2, "bank", "general")).key).toBe("bank");
  });
  test("local windows count Unicode code points, not halves of surrogate pairs", async () => {
    const text = "😀".repeat(800) + "bank" + "😀".repeat(800);
    const query = await contextQuery(text, 1600, "bank", "context");
    expect(Array.from(query.context!).length).toBe(1204); expect(query.context).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
  test("identifies the exact selected occurrence inside a clipped snippet and preserves phrase spacing", async () => {
    const text = "prefix ".repeat(200) + "bank   account next to a bank";
    const start = text.indexOf("bank");
    const query = await contextQuery(text, start, "bank account", "context", start + "bank   account".length);
    const payload = JSON.parse(contextPayload([query], "context"));
    const selected = payload.terms[0];
    expect(selected.contextStart).toBeGreaterThan(0);
    expect(selected.context.slice(selected.position - selected.contextStart, selected.position - selected.contextStart + selected.length)).toBe("bank   account");
  });
  test("full context contains all pages, sent once per batch, not once per term", async () => {
    const text = "Start bank. " + "body ".repeat(2000) + "End bank.";
    expect(paginate(text).length).toBeGreaterThan(1);
    const queries = await Promise.all([text.indexOf("bank"), text.lastIndexOf("bank")].map(start => contextQuery(text, start, "bank", "article")));
    const payload = JSON.parse(contextPayload(queries, "article"));
    expect(payload.article).toBe(text); expect(payload.terms).toHaveLength(2); expect(payload.terms[0].context).toBeUndefined();
    expect(payload.terms[0].term).not.toBe(payload.terms[1].term);
    expect(CONTEXT_PROMPT).toContain("British English IPA");
  });
  test("length limits reject rather than silently truncating or switching modes", async () => {
    const text = "a".repeat(ARTICLE_CONTEXT_LIMIT);
    expect((await contextQuery(text, 0, "a", "article")).context).toBe(text);
    await expect(contextQuery(text + "a", 0, "a", "article")).rejects.toThrow("24,000");
    expect(() => contextPayload([{ key: "key", term: "term", position: 0, context: "x".repeat(32000) }], "context")).toThrow("32,000");
    await expect(contextQuery("a".repeat(5000), 0, "a".repeat(3001), "general")).rejects.toThrow("3,000");
  });
  test("cache isolates positions/modes and persists hashes, never article context", async () => {
    const { storage, values } = fixture(), cache = new DictionaryCache(() => storage);
    const text = "A bank lent money. A bank beside water.";
    const a = await contextQuery(text, text.indexOf("bank"), "bank", "context"), b = await contextQuery(text, text.lastIndexOf("bank"), "bank", "context");
    let calls = 0;
    const request = async (terms: string[]) => { calls++; return JSON.stringify({ definitions: terms.map(term => ({ term, ...meaning })) }); };
    const targets = [a, b].map((query, index) => ({ term: query.key, offset: index }));
    const first = await lookupDefinitions(targets, cache, request); expect(first.requested).toBe(2); expect(first.definitions).toHaveLength(2);
    expect((await lookupDefinitions(targets, cache, request)).cached).toBe(2); expect(calls).toBe(1);
    expect(cache.get("bank")).toBeUndefined();
    const saved = [...values.values()].join(""); expect(saved).not.toContain(text); expect(saved).not.toContain("lent money");
    const restored = new DictionaryCache(() => storage); restored.restore(); expect(restored.get(a.key)).toEqual(meaning);
    await lookupDefinitions(targets, cache, request, { refresh: true }); expect(calls).toBe(2);
  });
});
