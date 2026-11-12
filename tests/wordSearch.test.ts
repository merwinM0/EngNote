import { describe, expect, test } from "bun:test";
import { indexSearchWords, searchExcerpt, searchWords } from "../public/ts/search/wordSearch";
import { characterCount, paginate, type Page } from "../public/ts/reading/pagination";
import type { DefinitionView } from "../public/ts/definitions/definitionViews";

function pagesOf(...parts: string[]): Page[] {
  let start = 0;
  return parts.map(text => { const page = { text, start, end: start + text.length, count: characterCount(text) }; start = page.end; return page; });
}

describe("local word search", () => {
  test("finds case-insensitive substrings, small typos and adjacent transpositions", () => {
    const text = "Water waterfall WATERS cat elephant don't don’t well-being.";
    const pages = paginate(text), index = indexSearchWords(text, pages);
    const find = (query: string) => searchWords(index, query, pages, 0, "article");
    expect(find("WAT").filter(result => result.match !== "fuzzy").map(result => result.text)).toEqual(["Water", "waterfall", "WATERS"]);
    expect(find("WAT").find(result => result.text === "cat")?.match).toBe("fuzzy");
    expect(find("waetr").find(result => result.text === "Water")?.match).toBe("fuzzy");
    expect(find("elefant").find(result => result.text === "elephant")?.match).toBe("fuzzy");
    expect(find("ct").some(result => result.text === "cat")).toBe(false); // No broad typo matching on short queries.
    expect(find("don't").map(result => result.text)).toEqual(["don't", "don’t"]);
    expect(find("well-be").find(result => result.text === "well-being")?.match).toBe("partial");
  });
  test("keeps duplicate occurrences separate and excludes definition text, including legacy notes", () => {
    const text = "water『a clear liquid with water』. water. fox『a wild animal』.";
    const pages = paginate(text), index = indexSearchWords(text, pages);
    const water = searchWords(index, "water", pages, 0, "article");
    expect(water).toHaveLength(2);
    expect(water.map(result => result.start)).toEqual([0, text.lastIndexOf("water")]);
    expect(water[0]!.noteStart).toBe(5); expect(water[1]!.noteStart).toBeUndefined();
    expect(searchWords(index, "liquid", pages, 0, "article")).toEqual([]);
    expect(searchWords(index, "animal", pages, 0, "article")).toEqual([]);
    expect(searchExcerpt(index, water[0]!)).not.toContain("clear liquid");
  });
  test("associates every word in a defined phrase with only that occurrence's note", () => {
    const text = "take off. take off『leave the ground』. off. take-off『departure』.";
    const note = text.indexOf("『"), pages = paginate(text);
    const metadata = [{ start: note, term: "take off" }];
    const index = indexSearchWords(text, pages, metadata);
    const take = searchWords(index, "take", pages, 0, "article");
    expect(take[0]!.noteStart).toBeUndefined(); expect(take[1]!.noteStart).toBe(note);
    const off = searchWords(index, "off", pages, 0, "article");
    expect(off[0]!.noteStart).toBeUndefined(); expect(off[1]!.noteStart).toBe(note);
    expect(off[2]!.noteStart).toBeUndefined(); expect(off[3]!.noteStart).toBe(text.lastIndexOf("『"));
    const mismatch = indexSearchWords(text, pages, [{ start: note, term: "wrong phrase" }]);
    expect(mismatch.words.find(word => word.start === text.indexOf("take", 1))!.noteStart).toBeUndefined();
  });
  test("prioritizes the current page and sorts before/after the reading anchor by character distance", () => {
    const parts = ["fox. ", "fox xx fox yy fox. ", "fox."];
    const text = parts.join(""), pages = pagesOf(...parts), index = indexSearchWords(text, pages);
    const anchor = text.indexOf("fox", parts[0]!.length + 1);
    const results = searchWords(index, "fox", pages, 1, "article", anchor);
    expect(results.slice(0, 3).map(result => result.current)).toEqual([true, true, true]);
    expect(results[0]!.start).toBe(anchor); expect(results[0]!.direction).toBe("here");
    expect(results[1]!.direction).toBe("before"); expect(results[1]!.distance).toBe(4);
    expect(results[2]!.direction).toBe("after"); expect(results[2]!.distance).toBe(7);
    expect(results.slice(3).map(result => result.direction)).toEqual(["after", "before"]);
    expect(results.map(result => result.priority)).toEqual([1, 2, 3, 4, 5]);
  });
  test("other pages use the nearest page edge, not page number or the current-page anchor", () => {
    const parts = ["fox" + ".".repeat(30), ".".repeat(10), ".".repeat(4) + "fox."];
    const text = parts.join(""), pages = pagesOf(...parts), index = indexSearchWords(text, pages);
    const result = searchWords(index, "fox", pages, 1, "article", pages[1]!.end);
    expect(result.map(word => [word.page, word.distance])).toEqual([[2, 4], [0, 30]]);
    expect(searchWords(index, "fox", pages, 1, "page")).toEqual([]);
  });
  test("counts Unicode body characters rather than UTF-16 units or annotation text", () => {
    const parts = ["fox『" + "a long definition ".repeat(100) + "』😀 ", "😀 fox."];
    const text = parts.join(""), pages = pagesOf(...parts), index = indexSearchWords(text, pages);
    const result = searchWords(index, "fox", pages, 1, "article");
    expect(result[0]!.start).toBe(pages[1]!.start + 3); // Canonical UTF-16 navigation offset.
    expect(result[0]!.distance).toBe(2);
    expect(result[1]!.distance).toBe(2); // Neither the note nor the surrogate's second unit counts.
    expect(index.body.join("")).toBe("fox😀 😀 fox.");
  });
  test("page filtering follows real pagination and returns global offsets", () => {
    const text = "fox. ".repeat(2500), pages = paginate(text), index = indexSearchWords(text, pages);
    const current = searchWords(index, "fox", pages, 1, "page");
    expect(current.length).toBeGreaterThan(0);
    expect(current.every(word => word.page === 1 && word.start >= pages[1]!.start && word.start < pages[1]!.end)).toBe(true);
    expect(searchWords(index, "fox", pages, 1, "article")).toHaveLength(2500);
  });
  test("a word spanning a hard page cut can still be found on the current page", () => {
    const text = "water".repeat(1200), pages = paginate(text), index = indexSearchWords(text, pages);
    const results = searchWords(index, "water", pages, 1, "page");
    expect(results).toHaveLength(1);
    expect(results[0]!.start).toBe(0); expect(results[0]!.end).toBe(text.length);
    expect(results[0]!.page).toBe(1); expect(results[0]!.current).toBe(true);
    expect(results[0]!.distance).toBe(0);
    expect(searchExcerpt(index, results[0]!).length).toBeLessThan(120);
  });
  test("keeps every repeated result at the article limit and does not mutate source data", () => {
    const text = "a ".repeat(50000), pages = paginate(text), index = indexSearchWords(text, pages);
    const result = searchWords(index, "a", pages, 0, "article");
    expect(result).toHaveLength(50000);
    expect(new Set(result.map(word => word.start)).size).toBe(50000);
    expect(pages.map(page => page.text).join("")).toBe(text);
    expect(index.words[0]).not.toHaveProperty("priority");
  });
  test("empty, invalid, oversized and regexp-like queries are safe literal searches", () => {
    const text = "cat. dog.", pages = paginate(text), index = indexSearchWords(text, pages);
    for (const query of ["", "  ", ".*", "cat|dog", "[cat", "<img>", "two words", "中文", "-", "a".repeat(65)]) {
      expect(searchWords(index, query, pages, 0, "article")).toEqual([]);
    }
    expect(searchWords(index, "cat", pages, 99, "article")).toEqual([]);
    expect(searchWords(indexSearchWords("", paginate("")), "cat", paginate(""), 0, "article")).toEqual([]);
  });
  test("indexing is independent of bilingual display language and ignores unrelated saved metadata", () => {
    const text = "fox『animal』. fox.", pages = paginate(text);
    const note: DefinitionView = { start: 3, english: "animal", chinese: "动物", language: "zh", term: "fox" };
    const first = searchWords(indexSearchWords(text, pages, [note]), "fox", pages, 0, "article");
    const english: DefinitionView = { ...note, language: "en" };
    const second = searchWords(indexSearchWords(text, pages, [english]), "fox", pages, 0, "article");
    expect(first).toEqual(second);
    expect(first.map(word => word.noteStart)).toEqual([3, undefined]);
  });
});
