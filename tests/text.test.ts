import { describe, expect, test } from "bun:test";
import { parseParagraphs, sanitizeEnglish, sanitizeTitle, splitParagraph, WORD_PATTERN } from "../public/ts/text";

describe("English article rules", () => {
  test("keeps numbers, currency, punctuation and typography", () => {
    expect(sanitizeEnglish('In 2025, it cost $12.50 — a 20% rise. “Why?”').clean).toBe('In 2025, it cost $12.50 — a 20% rise. “Why?”');
    expect(sanitizeEnglish("Hello 你好 world!").clean).toBe("Hello  world!");
  });
  test("repeated invalid-character checks are deterministic", () => {
    for (let i = 0; i < 5; i++) expect(sanitizeEnglish("Hi你好").hadBad).toBe(true);
  });
  test("accepts CRLF, whitespace-only blank lines and broken lines", () => {
    expect(parseParagraphs("One\r\nline.\r\n  \r\nTwo\nlines.")).toEqual(["One line.", "Two lines."]);
    expect(parseParagraphs(" \n\n ")).toEqual([]);
  });
  test("keeps serialized definitions distinct from the article", () => {
    expect(splitParagraph("fox『an animal』 jumps")).toEqual([{ type: "plain", text: "fox" }, { type: "note", text: "an animal" }, { type: "plain", text: " jumps" }]);
  });
  test("only words are selectable, including contractions and hyphens", () => {
    expect(Array.from("It's 2025: a well-known idea!".matchAll(WORD_PATTERN), match => match[0])).toEqual(["It's", "a", "well-known", "idea"]);
  });
  test("titles reject Han characters without losing other text", () => {
    expect(sanitizeTitle(" My 阅读 ")).toEqual({ clean: "My", hadBad: true });
  });
});
