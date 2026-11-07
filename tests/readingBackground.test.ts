import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isReadingBackground, READING_BACKGROUNDS, READING_BACKGROUND_STORAGE, ReadingBackgroundPreference } from "../public/ts/readingBackgroundPreference";
import { MESSAGES } from "../public/ts/i18n";

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(READING_BACKGROUND_STORAGE, initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("reading paper preference", () => {
  test("offers the untouched original followed by the eight recreated reference finishes", () => {
    expect(READING_BACKGROUNDS.map(background => background.id)).toEqual(["original", "linen", "art", "elegant", "leather", "earth", "kraft", "yunlong", "cotton"]);
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

function luminance(channels: number[]) {
  const [r, g, b] = channels.map(value => {
    const c = value / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return .2126 * r! + .7152 * g! + .0722 * b!;
}

describe("recreated water-grey reading finishes", () => {
  const css = readFileSync(new URL("../public/css/readingBackground.css", import.meta.url), "utf8");
  const tokens = readFileSync(new URL("../public/css/tokens.css", import.meta.url), "utf8");

  test("keeps the original untextured and assigns one neutral surface to the new finishes", () => {
    const original = css.match(/\.paper-surface\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(original).toContain("--reading-paper-color: var(--panel)");
    expect(original).toContain("--reading-paper-image: none");
    expect(css).not.toMatch(/\.content\.paper-surface\[data-paper="original"\]\s*\{/);
    const shared = css.match(/\.paper-surface:is\(([^}]+)\{([^}]+)\}/);
    expect(shared).not.toBeNull();
    for (const { id } of READING_BACKGROUNDS.slice(1)) expect(shared![1]).toContain(`[data-paper="${id}"]`);
    expect(shared![2]).toContain("--reading-paper-color: var(--bg)");
    expect(shared![2]).toContain("--reading-paper-size: 512px 512px");
    expect(css).not.toMatch(/--(?:reading-paper-color|muted):\s*#/);
  });

  test("clips texture paint to the body, while blank-page guide lines stay above the selected paper", () => {
    const content = readFileSync(new URL("../public/css/content.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.content\.paper-surface\s*\{\s*background-clip:\s*content-box;/);
    const empty = content.match(/\.content:empty\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(empty).toMatch(/background-image:\s*repeating-linear-gradient\([^;]+\), var\(--reading-paper-image, none\)/);
    expect(empty).toContain("background-size: auto, var(--reading-paper-size, auto)");
    expect(empty).not.toMatch(/background:\s/);
    expect(css).toContain(".paper-surface, .content.paper-surface:empty { background: Canvas; color: CanvasText; }");
  });

  test("gives only textured body sheets an inset border and padding inside the background", () => {
    const sheet = css.match(/\.content\.paper-surface:not\(\[data-paper="original"\]\)\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(sheet).toContain("margin: 28px 32px 40px 44px");
    expect(sheet).toContain("padding: 24px");
    expect(sheet).toContain("border: 1px solid var(--border)");
    expect(sheet).toContain("background-clip: padding-box");
    expect(sheet).toContain("min-height: calc(420px - 28px - 40px)");
    const mobile = css.match(/@media \(max-width: 700px\)\s*\{([\s\S]+?)\n\}/)?.[1] ?? "";
    expect(mobile).toContain("margin: 24px 20px 32px 28px");
    expect(mobile).toContain("padding: 20px 16px");
    expect(mobile).toContain("min-height: calc(360px - 24px - 32px)");
    expect(css).toContain('border-color: CanvasText');
  });

  test("each recreated finish is bundled from a local, text-free embossed texture", () => {
    const resources = new Set<string>();
    for (const { id } of READING_BACKGROUNDS.slice(1)) {
      expect(css).toContain(`--reading-paper-image: url("../textures/${id}.svg")`);
      const svg = readFileSync(new URL(`../public/textures/${id}.svg`, import.meta.url), "utf8");
      expect(svg).toContain('color-interpolation-filters="sRGB"');
      expect(svg).toContain("<feDiffuseLighting");
      expect(svg).toContain('stitchTiles="stitch"');
      expect(svg).not.toMatch(/<(?:text|image|script|foreignObject|pattern)\b|\bhref\s*=/i);
      resources.add(svg);
    }
    expect(resources.size).toBe(READING_BACKGROUNDS.length - 1);
  });

  test("all finishes use the same bounded water-grey tone and retain readable ink even in the darkest relief", () => {
    let palette: string | undefined;
    for (const { id } of READING_BACKGROUNDS.slice(1)) {
      const svg = readFileSync(new URL(`../public/textures/${id}.svg`, import.meta.url), "utf8");
      const channels = ["R", "G", "B"].map(channel => {
        const tag = svg.match(new RegExp(`<feFunc${channel}\\b[^>]+>`))?.[0] ?? "";
        expect(tag).toContain('type="linear"');
        const slope = Number(tag.match(/slope="([^"]+)"/)?.[1]);
        const intercept = Number(tag.match(/intercept="([^"]+)"/)?.[1]);
        expect(slope).toBeGreaterThan(0);
        expect(intercept + slope).toBeLessThanOrEqual(1);
        return { slope, intercept };
      });
      const current = JSON.stringify(channels);
      if (palette === undefined) palette = current;
      expect(current).toBe(palette);
      const darkest = channels.map(channel => Math.floor(channel.intercept * 255));
      for (const token of ["text", "muted", "accent", "accent-2"]) {
        const hex = tokens.match(new RegExp(`--${token}: #([a-f0-9]{6})`))![1]!;
        const ink = hex.match(/../g)!.map(value => parseInt(value, 16));
        expect((luminance(darkest) + .05) / (luminance(ink) + .05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("provides accurate bilingual names and material descriptions without the old warm palette", () => {
    for (const { id } of READING_BACKGROUNDS) {
      for (const language of ["en", "zh"] as const) {
        expect(MESSAGES[language][`background.${id}.name`].trim()).not.toBe("");
        expect(MESSAGES[language][`background.${id}.description`].trim()).not.toBe("");
      }
    }
    expect(MESSAGES.zh["background.original.name"]).toBe("原版");
    expect(MESSAGES.zh["background.cotton.name"]).toBe("棉纸");
    expect(MESSAGES.en["background.kraft.description"]).not.toMatch(/warm|brown|unbleached/i);
    expect(MESSAGES.zh["reader.backgroundDescription"]).toContain("水灰色");
  });
});
