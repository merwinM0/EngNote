import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MESSAGES, UI_LANGUAGE_STORAGE, UILanguagePreference, describeAIUsageLocalized, interpolate, isMessageKey, localizeError, msg, setUIText, t, textOf, uiLanguagePreference } from "../public/ts/i18n";

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(UI_LANGUAGE_STORAGE, initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

afterEach(() => { uiLanguagePreference.set("en"); });

describe("interface language preference", () => {
  test("defaults to English and only restores supported values", () => {
    for (const value of [null, "", "EN", "fr", "中文"]) {
      const preference = new UILanguagePreference(() => storage(value));
      expect(preference.restore()).toBe(true);
      expect(preference.language).toBe("en");
    }
    const chinese = new UILanguagePreference(() => storage("zh"));
    chinese.restore();
    expect(chinese.language).toBe("zh");
  });
  test("toggles and remembers the choice without touching other preferences", () => {
    const saved = storage();
    saved.values.set("er_deepseek_tab_key", "unrelated-placeholder");
    const preference = new UILanguagePreference(() => saved);
    preference.restore();
    expect(preference.toggle()).toBe(true);
    expect(preference.language).toBe("zh");
    expect(saved.values.get(UI_LANGUAGE_STORAGE)).toBe("zh");
    const restored = new UILanguagePreference(() => saved);
    restored.restore();
    expect(restored.language).toBe("zh");
    expect(saved.values.get("er_deepseek_tab_key")).toBe("unrelated-placeholder");
  });
  test("blocked storage keeps the choice usable for the current page", () => {
    const preference = new UILanguagePreference(() => { throw new Error("Blocked"); });
    expect(preference.restore()).toBe(false);
    expect(preference.language).toBe("en");
    expect(preference.set("zh")).toBe(false);
    expect(preference.language).toBe("zh");
  });
});

describe("interface translations", () => {
  test("keeps English and Chinese keys in sync and supports interpolation", () => {
    expect(Object.keys(MESSAGES.zh).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    expect(isMessageKey("reader.savedArticles")).toBe(true);
    expect(isMessageKey("missing.key")).toBe(false);
    expect(interpolate("Hello {name}, {count} pages", { name: "Mo", count: 3 })).toBe("Hello Mo, 3 pages");
    expect(interpolate("Keep {missing}", {})).toBe("Keep {missing}");
    expect(interpolate("Keep {toString}", {})).toBe("Keep {toString}");
  });
  test("both languages have matching placeholders, including dynamic summaries", () => {
    for (const key of Object.keys(MESSAGES.en) as Array<keyof typeof MESSAGES.en>) {
      const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      expect(placeholders(MESSAGES.zh[key])).toEqual(placeholders(MESSAGES.en[key]));
      expect(MESSAGES.zh[key].trim().length).toBeGreaterThan(0);
    }
  });
  test("lazy messages retain parameters but resolve in the current interface language", () => {
    const message = msg("reader.defineSelected", { count: 2 });
    expect(textOf(message)).toBe("Define selected (2)");
    uiLanguagePreference.set("zh");
    expect(textOf(message)).toBe("为所选词释义（2）");
    expect(textOf("US and us remain article data")).toBe("US and us remain article data");
    const element = { textContent: "" } as HTMLElement;
    expect(setUIText(element, message)).toBe("为所选词释义（2）");
    expect(element.textContent).toBe("为所选词释义（2）");
    setUIText(element, "");
    expect(element.textContent).toBe("");
  });
  test("switches strings immediately, with English as the default", () => {
    expect(t("reader.savedArticles")).toBe("Saved articles");
    uiLanguagePreference.set("zh");
    expect(t("reader.savedArticles")).toBe("已保存文章");
    expect(t("status.batch", { index: 1, total: 2 })).toContain("第 1/2 批");
  });
  test("keeps search page-number descriptions available to assistive technology in both languages", () => {
    expect(t("search.pageNumber", { page: 12 })).toBe("Page 12");
    uiLanguagePreference.set("zh");
    expect(t("search.pageNumber", { page: 12 })).toBe("第 12 页");
    expect(isMessageKey("search.rank")).toBe(false);
    expect(isMessageKey("search.keys")).toBe(false);
    expect(isMessageKey("search.order")).toBe(false);
  });
  test("localizes known runtime errors only in Chinese mode", () => {
    const message = "DeepSeek request failed (503). Please try again.";
    expect(localizeError(message)).toBe(message);
    uiLanguagePreference.set("zh");
    expect(localizeError(message)).toContain("DeepSeek 请求失败（503）");
    expect(localizeError("An unknown new failure.")).toBe("An unknown new failure.");
    expect(localizeError("AI output reached its token limit. No automatic retry was sent. Completed definitions were kept; retry only missing terms.")).toContain("已保留完整释义");
    expect(localizeError("Title must contain 1–20 characters.")).toBe("标题需为 1–20 个字符。");
    expect(localizeError("Failed to fetch")).toContain("网络请求失败");
  });
  test("localizes AI usage without pretending unknown usage is free", () => {
    const usage = { requests: 2, reportedRequests: 1, inputTokens: 10, outputTokens: 5, cachedInputTokens: 2, cacheReportedRequests: 1 };
    uiLanguagePreference.set("zh");
    const text = describeAIUsageLocalized(usage);
    expect(text).toContain("2 次请求");
    expect(text).toContain("1 次请求的用量未知");
    expect(text).toContain("不是账单");
  });
});

describe("static page translation keys", () => {
  for (const file of ["public/home.html", "public/index.html"]) {
    test(`${file} only references defined keys`, () => {
      const html = readFileSync(file, "utf8");
      const keys = [...html.matchAll(/data-i18n(?:-html|-aria-label|-title|-placeholder|-data-placeholder|-content)?="([^"]+)"/g)].map(match => match[1]!);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(isMessageKey(key)).toBe(true);
    });
  }
  test("both pages expose the language toggle and default to English", () => {
    for (const file of ["public/home.html", "public/index.html"]) {
      const html = readFileSync(file, "utf8");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('id="uiLangBtn"');
    }
  });
});
