import { describe, expect, test } from "bun:test";
import { parseArticleDraft } from "../public/ts/articleDraft";
import { DOCUMENT_LIMIT, paginate, ReadingDocument } from "../public/ts/pagination";

const entry = { id: 42, title: "A quiet morning", savedText: "A fox『an animal』 reads." };
const draft = { version: 2 as const, text: `${entry.savedText}\n\nAn unsaved thought.`, index: 1, entry };

describe("working article snapshots", () => {
  test("retains saved identity, baseline, definitions and unsaved edits without storing permissions", () => {
    const restored = parseArticleDraft(JSON.stringify({ ...draft, entry: { ...entry, can_edit: true, owner_email: "other@example.test" } }));
    expect(restored).toEqual(draft);
    expect(restored!.entry).not.toHaveProperty("can_edit");
    expect(restored!.entry).not.toHaveProperty("owner_email");
  });
  test("restores the selected page without losing article content", () => {
    const text = `${entry.savedText}\n\n`.repeat(550);
    const restored = parseArticleDraft(JSON.stringify({ ...draft, text, index: 2 }))!;
    const document = new ReadingDocument();
    document.setText(restored.text, restored.index);
    expect(document.index).toBe(2);
    expect(document.pages.map(page => page.text).join("")).toBe(text);
    expect(restored.entry).toEqual(entry);
  });
  test("preserves reading offsets across new and legacy pagination", () => {
    const text = "a".repeat(14000);
    const legacy = parseArticleDraft(JSON.stringify({ ...draft, text, index: 2 }))!;
    const oldOffset = paginate(legacy.text, 3000)[legacy.index]!.start;
    const document = new ReadingDocument(); document.setText(text); document.select(document.locate(oldOffset));
    expect(document.index).toBe(1);
    const current = parseArticleDraft(JSON.stringify({ ...draft, text, index: 2, offset: 10000 }))!;
    document.select(document.locate(current.offset!)); expect(document.index).toBe(2);
    expect(parseArticleDraft(JSON.stringify({ ...current, offset: -1 }))).not.toHaveProperty("offset");
  });
  test("keeps new, guest and legacy drafts unsaved rather than guessing an article ID", () => {
    expect(parseArticleDraft(JSON.stringify({ ...draft, entry: null }))!.entry).toBeNull();
    expect(parseArticleDraft(JSON.stringify({ version: 1, text: draft.text, index: 1, entry }))!).toEqual({ ...draft, entry: null });
  });
  test("discards invalid article references without throwing away valid working text", () => {
    for (const invalid of [null, [], {}, { ...entry, id: 0 }, { ...entry, id: 1.5 }, { ...entry, id: Number.MAX_SAFE_INTEGER + 1 },
      { ...entry, title: "" }, { ...entry, title: "x".repeat(21) }, { ...entry, savedText: 1 }, { ...entry, savedText: "" },
      { ...entry, savedText: "x".repeat(DOCUMENT_LIMIT + 1) }]) {
      expect(parseArticleDraft(JSON.stringify({ ...draft, entry: invalid }))).toEqual({ ...draft, entry: null });
    }
  });
  test("rejects malformed, unsupported or oversized snapshots", () => {
    for (const invalid of ["{", "null", "[]", "false", JSON.stringify({ ...draft, version: 3 }), JSON.stringify({ ...draft, text: 1 }),
      JSON.stringify({ ...draft, text: "x".repeat(DOCUMENT_LIMIT + 1) }), JSON.stringify({ ...draft, index: 1.2 })]) {
      expect(parseArticleDraft(invalid)).toBeNull();
    }
  });
});
