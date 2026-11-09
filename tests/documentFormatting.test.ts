import { describe, expect, test } from "bun:test";
import { editFormatting, formattingSegments, formattedPageParagraphs, paragraphRanges, readFormatting, rebaseFormatting, validateFormatting, type DocumentFormatting } from "../public/ts/documentFormatting";
import { paragraphTidying, PARAGRAPH_PROMPT } from "../public/ts/paragraphTidying";
import { ReadingHistory } from "../public/ts/readingHistory";
import { parseArticleDraft } from "../public/ts/articleDraft";
const text = "Hello world.\n\nNext line.";
const format: DocumentFormatting = { version: 1, runs: [
  { start: 0, end: 5, style: { font: "Georgia", size: 18, bold: true, color: "#123456" } },
  { start: 5, end: text.length, style: { font: "Arial", size: 11, italic: true } },
], paragraphs: paragraphRanges(text).map((range, index) => ({ ...range, style: index ? { align: "right" } : { align: "center", after: 12 } })) };

describe("bounded safe Word formatting", () => {
  test("round-trips only validated style fields against exact paragraph and Unicode ranges", () => {
    expect(validateFormatting(format, text)).toEqual(format);
    expect(readFormatting(null, text)).toBeNull();
    expect(readFormatting({ ...format, version: 2 }, text)).toBeNull();
    expect(readFormatting(format, text + "\n\nExtra")).toBeNull();
    expect(readFormatting({ ...format, runs: [{ start: 0, end: 1, style: {} }] }, "😀")).toBeNull();
  });
  test("rejects external CSS, invalid values, overlapping ranges and oversized metadata", () => {
    for (const style of [{ font: "url(https://example.com/font)" }, { font: "x;position:fixed" }, { color: "red;display:none" }, { size: Infinity }, { size: -1 }, { italic: "yes" }, { vertical: "fixed" }]) {
      expect(() => validateFormatting({ ...format, runs: [{ start: 0, end: text.length, style }] }, text)).toThrow();
    }
    expect(() => validateFormatting({ ...format, runs: [format.runs[1], format.runs[0]] }, text)).toThrow();
    expect(() => validateFormatting({ ...format, extra: "x".repeat(256001) }, text)).toThrow("limit");
  });
  test("rejects overlapping, disjoint and excessive sparse table structures before rendering", () => {
    const source = "A\n\nB", make = (row: number, column: number, rowSpan = 1) => ({ table: 0, row, column, colSpan: 1, rowSpan });
    const meta = (cells: Array<ReturnType<typeof make>>) => ({ version: 1, runs: [], paragraphs: paragraphRanges(source).map((range, index) => ({ ...range, style: {}, cell: cells[index] })) });
    expect(() => validateFormatting(meta([make(0, 0, 2), make(1, 0)]), source)).toThrow("Overlapping");
    expect(() => validateFormatting(meta([make(3000, 0, 3000), make(3000, 1, 3000)]), source)).not.toThrow();
    const excessive = { version: 1, runs: [], paragraphs: paragraphRanges("A\n\nB\n\nC").map((range, table) => ({ ...range, style: {}, cell: { ...make(3000, 0, 3000), table } })) };
    expect(() => validateFormatting(excessive, "A\n\nB\n\nC")).toThrow("budget");
    const disjoint = { version: 1, runs: [], paragraphs: paragraphRanges("A\n\nB\n\nC").map((range, index) => ({ ...range, style: {}, ...(index !== 1 ? { cell: make(0, index) } : {}) })) };
    expect(() => validateFormatting(disjoint, "A\n\nB\n\nC")).toThrow("consecutive");
  });
  test("applies note insertion/removal without losing later fonts, paragraphs or offsets", () => {
    const value = "『greeting』", start = 5, annotated = text.slice(0, start) + value + text.slice(start);
    const changed = editFormatting(format, text, { start, end: start, value })!;
    expect(changed.paragraphs[1]!.start).toBe(format.paragraphs[1]!.start + value.length);
    expect(changed.paragraphs[0]!.style).toEqual(format.paragraphs[0]!.style);
    expect(editFormatting(changed, annotated, { start, end: start + value.length, value: "" })).toEqual(format);
    expect(format.runs[0]!.end).toBe(5); // Input is immutable.
  });
  test("manual edits preserve untouched format and never split supplementary characters", () => {
    const edited = rebaseFormatting(format, text, text.replace("world", "reader"))!;
    expect(edited.runs[0]).toEqual(format.runs[0]);
    expect(edited.paragraphs[1]!.style.align).toBe("right");
    const emoji = { version: 1 as const, runs: [{ start: 0, end: 2, style: { bold: true } }], paragraphs: [{ start: 0, end: 2, style: {} }] };
    expect(rebaseFormatting(emoji, "😀", "😁")!.runs).toEqual(emoji.runs);
    expect(formattingSegments(format, 2, 8).map(part => [part.start, part.end])).toEqual([[2, 5], [5, 8]]);
  });
  test("page slices never duplicate ended paragraphs, list markers or first-line indents", () => {
    const source = "A".repeat(5000) + "\n\nB";
    const meta: DocumentFormatting = { version: 1, runs: [], paragraphs: paragraphRanges(source).map(range => ({ ...range, style: {}, marker: "1." })) };
    expect(formattedPageParagraphs(meta, source, 5000, source.length).map(block => block.text)).toEqual(["B"]);
    const long: DocumentFormatting = { version: 1, runs: [], paragraphs: [{ start: 0, end: 6000, marker: "1.", style: { before: 12, after: 10, firstLine: 24 } }] };
    const continuation = formattedPageParagraphs(long, "A".repeat(6000), 5000, 6000)[0]!;
    expect(continuation.format.marker).toBeUndefined(); expect(continuation.format.style).toMatchObject({ before: 0, firstLine: 0, after: 10 });
    expect(long.paragraphs[0]!.marker).toBe("1.");
  });
  test("formatting survives draft round-trips and history includes format-only changes", () => {
    const parsed = parseArticleDraft(JSON.stringify({ version: 2, text, index: 0, entry: null, formatting: format }));
    expect(parsed?.formatting).toEqual(format);
    const history = new ReadingHistory(), before = { text, definitions: [], offset: 0, formatting: null }, after = { ...before, formatting: format };
    history.record(before, after); expect(history.undo(after)?.formatting).toBeNull(); expect(history.redo(before)?.formatting).toEqual(format);
  });
});

describe("paragraph-only AI tidying", () => {
  test("requests no rewriting or font changes and accepts only line-break whitespace edits", () => {
    expect(PARAGRAPH_PROMPT).toContain("Only tidy paragraph breaks");
    const before = "  A fox\njumps. A bird flies.\n\n";
    const result = paragraphTidying(before, "A fox jumps.\n\nA bird flies.");
    expect(result.text).toBe("  A fox jumps.\n\nA bird flies.\n\n");
    expect(result.edits).toHaveLength(2);
  });
  test("rejects changed punctuation, words, casing, hallucinations, spacing and tabs", () => {
    for (const output of ["Hello World.", "Hello, world.", "Hello earth.", "Hello world. Extra", "Hello  world.", "Hello\tworld.", "Helloworld.", "```Hello world.```", ""]) {
      expect(() => paragraphTidying("Hello world.", output)).toThrow("original article");
    }
    expect(() => paragraphTidying("A\tB", "A\nB")).toThrow();
    expect(() => paragraphTidying("A\u00A0\nB", "A B")).toThrow();
    expect(() => paragraphTidying("A B", "A\n\vB")).toThrow();
  });
  test("edits whitespace independently so all original font runs survive", () => {
    const source = "Hello\nworld.", meta: DocumentFormatting = { version: 1, runs: [{ start: 0, end: 5, style: { bold: true } }, { start: 6, end: 12, style: { italic: true } }], paragraphs: [{ start: 0, end: 12, style: { align: "center" } }] };
    meta.paragraphs[0]!.marker = "1.";
    const result = paragraphTidying(source, "Hello\n\nworld.");
    const next = editFormatting(meta, source, result.edits[0]!)!;
    expect(next.runs[0]!.style.bold).toBe(true); expect(next.runs.at(-1)!.style.italic).toBe(true);
    expect(next.paragraphs.map(p => p.style.align)).toEqual(["center", "center"]);
    expect(next.paragraphs.map(p => p.marker)).toEqual(["1.", undefined]);
  });
  test("does not merge table cells through paragraph whitespace", () => {
    const source = "A\n\nB", meta: DocumentFormatting = { version: 1, runs: [], paragraphs: paragraphRanges(source).map((range, column) => ({ ...range, style: {}, cell: { table: 0, row: 0, column, colSpan: 1, rowSpan: 1 } })) };
    expect(() => editFormatting(meta, source, paragraphTidying(source, "A B").edits[0]!)).toThrow("table cells");
    expect(validateFormatting(meta, source)).toEqual(meta);
  });
});
