import { describe, expect, test } from "bun:test";
import { parseArticleTitle, summarizeArticleTitle, TITLE_PROMPT, TITLE_RETRY_PROMPT } from "../public/ts/articles/articleTitle";

describe("AI article titles", () => {
  test("accepts a short English title and removes surrounding quotes", () => {
    expect(parseArticleTitle("  A Quiet Morning  ")).toBe("A Quiet Morning");
    expect(parseArticleTitle('“Learning to Read”')).toBe("Learning to Read");
    expect(parseArticleTitle("'A fox's story'")).toBe("A fox's story");
    expect(parseArticleTitle("a".repeat(20))).toHaveLength(20);
  });
  test("accepts common JSON, prefix and markdown wrappers without changing the title", () => {
    for (const response of ['{"title":"Quiet Reading"}', '```json\n{"title":"Quiet Reading"}\n```', 'Title: Quiet Reading', 'Here is your title: "Quiet Reading"', '**Quiet Reading**', '# Quiet Reading', 'Title: **"Quiet Reading"**', '{"title":"**Quiet Reading**"}']) {
      expect(parseArticleTitle(response)).toBe("Quiet Reading");
    }
  });
  test("rejects empty, non-English, multiline and overlong output rather than truncating it", () => {
    for (const title of ["", "  ", "中文 Title", "123", "First\nSecond", "Short\tTitle", "a".repeat(21), '{"title":123}', '{"other":"Fox"}', '{bad json}', '```invalid```']) {
      expect(() => parseArticleTitle(title)).toThrow();
    }
  });
  test("summarizes the entire article, excluding definitions only from the AI input", async () => {
    const article = "First page. ".repeat(350) + "Last page『a definition』 matters most.";
    let sentText = "";
    const controller = new AbortController();
    const title = await summarizeArticleTitle(article, async (system, text, signal) => {
      expect(system).toBe(TITLE_PROMPT);
      expect(signal).toBe(controller.signal);
      sentText = text;
      return "A Complete Story";
    }, controller.signal);
    expect(title).toBe("A Complete Story");
    expect(sentText.length).toBeGreaterThan(3000);
    expect(sentText.endsWith("Last page matters most.")).toBe(true);
    expect(sentText).not.toContain("a definition");
    expect(article).toContain("『a definition』");
  });
  test("repairs an overlong successful AI response with exactly one shorter-title request", async () => {
    const prompts: string[] = [], sources: string[] = [];
    const title = await summarizeArticleTitle("A full article『a definition』.", async (prompt, text) => {
      prompts.push(prompt); sources.push(text);
      return prompts.length === 1 ? "Learning English Through Familiar Context" : '{"title":"English in Context"}';
    });
    expect(title).toBe("English in Context");
    expect(prompts).toEqual([TITLE_PROMPT, TITLE_RETRY_PROMPT]);
    expect(sources).toEqual(["A full article.", "A full article."]);
  });
  test("does not retry connection/authentication failures or silently invent a title", async () => {
    let calls = 0;
    await expect(summarizeArticleTitle("An article.", async () => { calls++; throw new Error("Connection failed"); })).rejects.toThrow("Connection failed");
    expect(calls).toBe(1);
    calls = 0;
    await expect(summarizeArticleTitle("An article.", async () => { calls++; return "中文"; })).rejects.toThrow("valid short English title");
    expect(calls).toBe(2);
    await expect(summarizeArticleTitle("An article.", async () => "a".repeat(30))).rejects.toThrow("30-character title");
  });
  test("does not retry or save a canceled malformed response", async () => {
    const controller = new AbortController(); let calls = 0;
    await expect(summarizeArticleTitle("An article.", async () => { calls++; controller.abort(); return "invalid ".repeat(10); }, controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
  test("rejects late AI results after cancellation, even if the transport ignores abort", async () => {
    const controller = new AbortController();
    await expect(summarizeArticleTitle("An article.", async () => {
      controller.abort();
      return "Late Title";
    }, controller.signal)).rejects.toThrow();
  });
});
