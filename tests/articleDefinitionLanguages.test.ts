import { describe, expect, test } from "bun:test";
import { ARTICLE_DEFINITION_LANGUAGES_KEY, ArticleDefinitionLanguages } from "../public/ts/articleDefinitionLanguages";
import { DefinitionViews, type DefinitionView } from "../public/ts/definitionViews";
import { DefinitionLanguagePreference } from "../public/ts/definitionPreference";

const text = "😀 A fox『an animal』 meets a dog『an animal』 and a bird『a flying animal』.";
const saved: DefinitionView[] = [
  { start: text.indexOf("『"), english: "an animal", chinese: "狐狸", term: "fox", language: "zh", britishIPA: "/fɒks/" },
  { start: text.indexOf("『", text.indexOf("『") + 1), english: "an animal", chinese: "狗", term: "dog", language: "en" },
  { start: text.lastIndexOf("『"), english: "a flying animal", chinese: "鸟", term: "bird", language: "zh" },
];
const languages = (views: DefinitionView[]) => views.map(view => view.language);
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("article-specific definition language recovery", () => {
  test("first open keeps mixed saved languages, independent of the default for new notes", () => {
    const store = storage(), preferences = new ArticleDefinitionLanguages(() => store);
    const defaults = new DefinitionLanguagePreference(() => store);
    for (let i = 0; i < 2; i++) {
      expect(preferences.apply(1, text, saved)).toEqual(saved);
      defaults.toggle();
    }
    expect(preferences.apply(1, text, undefined)).toEqual([]);
    expect(preferences.apply(1, text, [])).toEqual([]);
  });
  test("A → B → A restores each occurrence, even when both articles and English meanings are identical", () => {
    const preferences = new ArticleDefinitionLanguages(storage);
    const english = saved.map(view => ({ ...view, language: "en" as const }));
    preferences.remember(1, text, saved);
    preferences.remember(2, text, english);
    expect(preferences.apply(1, text, english)).toEqual(saved);
    expect(preferences.apply(2, text, saved)).toEqual(english);
    const restored = new DefinitionViews(); restored.reset(text, preferences.apply(1, text, english));
    expect(languages(restored.snapshot())).toEqual(["zh", "en", "zh"]);
  });
  test("round-trips mixed, all-Chinese and all-English choices across tab reloads without mutating server data", () => {
    const store = storage(), first = new ArticleDefinitionLanguages(() => store);
    const combinations: DefinitionView["language"][][] = [["zh", "en", "zh"], ["zh", "zh", "zh"], ["en", "en", "en"]];
    for (const [index, choices] of combinations.entries()) {
      const views = saved.map((view, i) => ({ ...view, language: choices[i]! }));
      expect(first.remember(index + 1, text, [...views].reverse())).toBe(true);
      const restored = new ArticleDefinitionLanguages(() => store);
      expect(restored.restore()).toBe(true);
      expect(languages(restored.apply(index + 1, text, saved))).toEqual(choices);
    }
    expect(languages(saved)).toEqual(["zh", "en", "zh"]);
    const raw = store.getItem(ARTICLE_DEFINITION_LANGUAGES_KEY)!;
    for (const value of [text, "an animal", "狐狸", "fɒks", "apiKey", "er_session"]) expect(raw).not.toContain(value);
    expect([...store.values.keys()]).toEqual([ARTICLE_DEFINITION_LANGUAGES_KEY]);
  });
  test("a changed article or definition never receives stale positional choices", () => {
    const preferences = new ArticleDefinitionLanguages(storage);
    preferences.remember(1, text, saved.map(view => ({ ...view, language: "en" })));
    for (const nextText of [text + " More.", text.replace("fox", "cat")]) expect(preferences.apply(1, nextText, saved)).toEqual(saved);
    for (const change of [{ chinese: "狐狸的新释义" }, { britishIPA: "/fɒks ɪz/" }, { term: "cat" }, { mode: "article" as const, contextKey: "article:" + "a".repeat(64) }]) {
      const changed = saved.map((view, i) => i === 0 ? { ...view, ...change } : view);
      expect(preferences.apply(1, text, changed)).toEqual(changed);
    }
  });
  test("malformed, excessive or mismatched storage falls back to saved languages", () => {
    const store = storage();
    for (const raw of ["not JSON", "{}", "[null,{},[0,{}]]", " ".repeat(256 * 1024 + 1)]) {
      store.setItem(ARTICLE_DEFINITION_LANGUAGES_KEY, raw);
      const preferences = new ArticleDefinitionLanguages(() => store); preferences.restore();
      expect(preferences.apply(1, text, saved)).toEqual(saved);
    }
    const preferences = new ArticleDefinitionLanguages(() => store);
    preferences.remember(1, text, saved);
    const record = JSON.parse(store.getItem(ARTICLE_DEFINITION_LANGUAGES_KEY)!);
    for (const invalid of [["fr", "en", "zh"], ["en"], null, "en"]) {
      record[0][1].languages = invalid;
      store.setItem(ARTICLE_DEFINITION_LANGUAGES_KEY, JSON.stringify(record));
      const restored = new ArticleDefinitionLanguages(() => store); restored.restore();
      expect(restored.apply(1, text, saved)).toEqual(saved);
    }
  });
  test("blocked storage keeps memory choices, and forgetting a deleted article removes them", () => {
    const preferences = new ArticleDefinitionLanguages(() => { throw new Error("blocked"); });
    expect(preferences.restore()).toBe(false);
    expect(preferences.remember(1, text, saved.map(view => ({ ...view, language: "en" })))).toBe(false);
    expect(languages(preferences.apply(1, text, saved))).toEqual(["en", "en", "en"]);
    expect(preferences.forget(1)).toBe(false);
    expect(preferences.apply(1, text, saved)).toEqual(saved);
  });
  test("enforces the byte budget even with large articles below the count limit", () => {
    const store = storage(), preferences = new ArticleDefinitionLanguages(() => store);
    const text = "a『x』 ".repeat(15000);
    const views: DefinitionView[] = Array.from(text.matchAll(/『x』/g), match => ({ start: match.index, english: "x", chinese: "中", language: "zh" }));
    for (let id = 1; id <= 4; id++) preferences.remember(id, text, views);
    const raw = store.getItem(ARTICLE_DEFINITION_LANGUAGES_KEY)!;
    expect(raw.length).toBeLessThanOrEqual(256 * 1024);
    expect(JSON.parse(raw)).toHaveLength(3);
    expect(languages(preferences.apply(4, text, views))).toEqual(languages(views));
  });
  test("bounds storage and evicts the least recently used article", () => {
    const store = storage(), preferences = new ArticleDefinitionLanguages(() => store);
    for (let id = 1; id <= 100; id++) preferences.remember(id, text, saved.map(view => ({ ...view, language: "en" })));
    preferences.apply(1, text, saved); preferences.remember(101, text, saved);
    expect(languages(preferences.apply(1, text, saved))).toEqual(["en", "en", "en"]);
    expect(preferences.apply(2, text, saved)).toEqual(saved);
    expect(JSON.parse(store.getItem(ARTICLE_DEFINITION_LANGUAGES_KEY)!)).toHaveLength(100);
    expect(store.getItem(ARTICLE_DEFINITION_LANGUAGES_KEY)!.length).toBeLessThanOrEqual(256 * 1024);
  });
});
