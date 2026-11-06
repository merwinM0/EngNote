import { describe, expect, test } from "bun:test";
import { DEFINITION_LANGUAGE_STORAGE, DefinitionLanguagePreference } from "../public/ts/definitionPreference";

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(DEFINITION_LANGUAGE_STORAGE, initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("default language for new AI definitions", () => {
  test("starts in English and safely handles absent or invalid preferences", () => {
    for (const value of [null, "", "en", "ZH", "Chinese", '{"language":"zh"}']) {
      const preference = new DefinitionLanguagePreference(() => storage(value));
      expect(preference.language).toBe("en");
      expect(preference.restore()).toBe(true);
      expect(preference.language).toBe("en");
    }
  });
  test("toggles Zh/Eng immediately and remembers the choice across new page instances", () => {
    const saved = storage(), preference = new DefinitionLanguagePreference(() => saved);
    expect(preference.toggle()).toBe(true);
    expect(preference.language).toBe("zh");
    expect(saved.values.get(DEFINITION_LANGUAGE_STORAGE)).toBe("zh");
    const restored = new DefinitionLanguagePreference(() => saved);
    expect(restored.restore()).toBe(true);
    expect(restored.language).toBe("zh");
    expect(restored.toggle()).toBe(true);
    expect(restored.language).toBe("en");
    expect(saved.values.get(DEFINITION_LANGUAGE_STORAGE)).toBe("en");
  });
  test("blocked storage leaves the toggle usable in memory without throwing", () => {
    const preference = new DefinitionLanguagePreference(() => { throw new Error("Storage blocked"); });
    expect(preference.restore()).toBe(false);
    expect(preference.language).toBe("en");
    expect(preference.toggle()).toBe(false);
    expect(preference.language).toBe("zh");
    expect(preference.toggle()).toBe(false);
    expect(preference.language).toBe("en");
  });
  test("a failed write keeps the selected language and does not touch API-key storage", () => {
    const saved = storage("zh");
    saved.values.set("er_deepseek_tab_key", "unrelated-placeholder");
    const preference = new DefinitionLanguagePreference(() => ({ ...saved, setItem: () => { throw new Error("Quota exceeded"); } }));
    expect(preference.restore()).toBe(true);
    expect(preference.language).toBe("zh");
    expect(preference.toggle()).toBe(false);
    expect(preference.language).toBe("en");
    expect(saved.values.get("er_deepseek_tab_key")).toBe("unrelated-placeholder");
    expect(saved.values.get(DEFINITION_LANGUAGE_STORAGE)).toBe("zh");
  });
});
