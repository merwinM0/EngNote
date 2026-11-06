import { describe, expect, test } from "bun:test";
import { isReadingBackground, READING_BACKGROUNDS, READING_BACKGROUND_STORAGE, ReadingBackgroundPreference } from "../public/ts/readingBackgroundPreference";

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(READING_BACKGROUND_STORAGE, initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("reading paper preference", () => {
  test("offers the original and all eight requested paper textures", () => {
    expect(READING_BACKGROUNDS.map(background => background.id)).toEqual(["original", "yunlong", "cotton", "earth", "kraft", "linen", "art", "elegant", "leather"]);
    expect(new Set(READING_BACKGROUNDS.map(background => background.id)).size).toBe(9);
  });
  test("starts with the unchanged original and rejects unknown stored values", () => {
    for (const value of [null, "", "ORIGINAL", "unknown", "__proto__", "constructor", '{"id":"kraft"}']) {
      const preference = new ReadingBackgroundPreference(() => storage(value));
      expect(preference.background).toBe("original");
      expect(preference.restore()).toBe(true);
      expect(preference.background).toBe("original");
    }
    for (const value of [undefined, null, {}, 1, "__proto__"]) expect(isReadingBackground(value)).toBe(false);
  });
  test("each choice, including returning to original, survives a new page instance", () => {
    const saved = storage(), preference = new ReadingBackgroundPreference(() => saved);
    for (const { id } of [...READING_BACKGROUNDS.slice(1), READING_BACKGROUNDS[0]]) {
      expect(isReadingBackground(id)).toBe(true);
      expect(preference.select(id)).toBe(true);
      expect(preference.background).toBe(id);
      expect(saved.values.get(READING_BACKGROUND_STORAGE)).toBe(id);
      const restored = new ReadingBackgroundPreference(() => saved);
      expect(restored.restore()).toBe(true);
      expect(restored.background).toBe(id);
    }
  });
  test("blocked storage keeps paper selection usable for the current page", () => {
    const preference = new ReadingBackgroundPreference(() => { throw new Error("Storage blocked"); });
    expect(preference.restore()).toBe(false);
    expect(preference.background).toBe("original");
    expect(preference.select("yunlong")).toBe(false);
    expect(preference.background).toBe("yunlong");
    expect(preference.select("original")).toBe(false);
    expect(preference.background).toBe("original");
  });
  test("a failed write still applies the paper without changing unrelated browser preferences", () => {
    const saved = storage("cotton");
    saved.values.set("er_default_definition_language", "zh");
    saved.values.set("er_deepseek_tab_key", "unrelated-placeholder");
    const preference = new ReadingBackgroundPreference(() => ({ ...saved, setItem: () => { throw new Error("Quota exceeded"); } }));
    expect(preference.restore()).toBe(true);
    expect(preference.background).toBe("cotton");
    expect(preference.select("leather")).toBe(false);
    expect(preference.background).toBe("leather");
    expect(saved.values.get(READING_BACKGROUND_STORAGE)).toBe("cotton");
    expect(saved.values.get("er_default_definition_language")).toBe("zh");
    expect(saved.values.get("er_deepseek_tab_key")).toBe("unrelated-placeholder");
  });
});
