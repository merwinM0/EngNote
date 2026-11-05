import { describe, expect, test } from "bun:test";
import { parseArticleTitle, summarizeArticleTitle, TITLE_PROMPT } from "../public/ts/articleTitle";

describe("AI article titles", () => {
  test("accepts a short English title and removes surrounding quotes", () => {
    expect(parseArticleTitle("  A Quiet Morning  ")).toBe("A Quiet Morning");
    expect(parseArticleTitle('“Learning to Read”')).toBe("Learning to Read");
    expect(parseArticleTitle("'A fox's story'")).toBe("A fox's story");
    expect(parseArticleTitle("a".repeat(20))).toHaveLength(20);
  });
  test("rejects empty, non-English, multiline and overlong output rather than truncating it", () => {
    for (const title of ["", "  ", "中文 Title", "123", "First\nSecond", "Short\tTitle", "a".repeat(21), "Here is your title: A quiet morning"]) {
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
  test("propagates connection failures for manual-title recovery", async () => {
    await expect(summarizeArticleTitle("An article.", async () => { throw new Error("Connection failed"); })).rejects.toThrow("Connection failed");
    await expect(summarizeArticleTitle("An article.", async () => "中文")).rejects.toThrow("valid short English title");
  });
  test("rejects late AI results after cancellation, even if the transport ignores abort", async () => {
    const controller = new AbortController();
    await expect(summarizeArticleTitle("An article.", async () => {
      controller.abort();
      return "Late Title";
    }, controller.signal)).rejects.toThrow();
  });
});
