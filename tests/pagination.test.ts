import { describe, expect, test } from "bun:test";
import { characterCount, DOCUMENT_LIMIT, PAGE_LIMIT, paginate, ReadingDocument } from "../public/ts/pagination";
import { reflowText } from "../public/ts/text";

function checkPages(text: string) {
  const pages = paginate(text);
  expect(pages.map(page => page.text).join("")).toBe(text);
  for (const page of pages) {
    expect(page.count).toBe(characterCount(page.text));
    expect(page.count).toBeLessThanOrEqual(PAGE_LIMIT);
    expect(text.slice(page.start, page.end)).toBe(page.text);
    expect(page.text).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
  }
  return pages;
}
describe("lossless 3,000-character pages", () => {
  test("empty, exact limit, overflow and very long words", () => {
    expect(checkPages("")).toHaveLength(1);
    expect(checkPages("a".repeat(3000))).toHaveLength(1);
    expect(checkPages("a".repeat(3001))).toHaveLength(2);
    expect(checkPages("a".repeat(9001))).toHaveLength(4);
  });
  test("counts punctuation, numbers, whitespace, line breaks and definition markers", () => {
    const text = "A 1!\n\nfox『an animal』\t".repeat(500);
    const pages = checkPages(text);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.reduce((count, page) => count + page.count, 0)).toBe(characterCount(text));
  });
  test("does not split surrogate pairs or discard Unicode punctuation", () => {
    const text = "😀…£ 你好! ".repeat(1200);
    checkPages(text);
    expect(characterCount("a😀! ")).toBe(4);
  });
  test("prefers paragraph boundaries and keeps ordinary definitions intact", () => {
    const text = "First paragraph. ".repeat(150) + "\n\n" + "fox『" + "a small animal ".repeat(40) + "』 walks away.";
    const pages = checkPages(text);
    expect(pages[0]!.text.endsWith("\n\n")).toBe(true);
    expect(pages.some(page => page.text.includes("fox『") && page.text.includes("』"))).toBe(true);
  });
  test("even oversized malformed definitions still respect the hard limit", () => {
    checkPages("『" + "x".repeat(10000) + "』");
  });
  test("randomized boundary cases keep every character in order", () => {
    let seed = 7;
    const alphabet = ["word ", "…", "\n\n", "12!", "😀", " ", "fox『animal』"];
    for (let run = 0; run < 20; run++) {
      let text = "";
      for (let i = 0; i < 1500; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        text += alphabet[seed % alphabet.length];
      }
      checkPages(text);
    }
  });
});

describe("page editing", () => {
  test("overflow creates pages and follows the insertion cursor", () => {
    const document = new ReadingDocument();
    document.setText("a".repeat(3000) + "TAIL");
    const value = "b".repeat(6500);
    const result = document.editPage(value, value.length);
    expect(document.text).toBe(value + "TAIL");
    expect(document.index).toBe(2);
    expect(result).toEqual({ cursor: 500, changedPage: true });
    checkPages(document.text);
  });
  test("edits to a middle page preserve previous and following text", () => {
    const document = new ReadingDocument();
    document.setText("a".repeat(3000) + "b".repeat(3000) + "c".repeat(100));
    document.select(1);
    document.editPage("replacement", 5);
    expect(document.text).toBe("a".repeat(3000) + "replacement" + "c".repeat(100));
    expect(document.index).toBe(1);
  });
  test("deletion repaginates without empty trailing pages", () => {
    const document = new ReadingDocument();
    document.setText("a".repeat(6000));
    document.select(1);
    document.editPage("", 0);
    expect(document.pages).toHaveLength(1);
    expect(document.index).toBe(0);
    expect(document.text).toBe("a".repeat(3000));
  });
  test("document limits fail atomically instead of truncating content", () => {
    const document = new ReadingDocument();
    document.setText("Keep me.");
    expect(() => document.editPage("a".repeat(DOCUMENT_LIMIT + 1), 0)).toThrow("100,000");
    expect(document.text).toBe("Keep me.");
  });
  test("local reflow preserves all punctuation and joins broken lines", () => {
    expect(reflowText("Price: £12.50…\r\nisn't bad!\r\n\r\n你好 — 2026. ")).toBe("Price: £12.50… isn't bad!\n\n你好 — 2026.");
  });
});
