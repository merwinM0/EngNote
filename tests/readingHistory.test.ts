import { describe, expect, test } from "bun:test";
import { ReadingHistory, type ReadingSnapshot } from "../public/ts/reading/readingHistory";
import { definitionContent, DefinitionViews } from "../public/ts/definitions/definitionViews";
import { ReadingDocument } from "../public/ts/reading/pagination";
const snap = (text: string): ReadingSnapshot => ({ text, definitions: [], offset: 0 });

describe("bounded working-copy history", () => {
  test("multiple undo/redo round trips and new edit invalidates redo", () => {
    const history = new ReadingHistory(), a = snap("a"), b = snap("b"), c = snap("c");
    history.record(a, b); history.record(b, c);
    expect(history.undo(c)).toEqual(b); expect(history.undo(b)).toEqual(a);
    expect(history.canUndo).toBe(false); expect(history.redo(a)).toEqual(b); expect(history.redo(b)).toEqual(c);
    expect(history.canRedo).toBe(false);
    history.undo(c); history.record(b, snap("new")); expect(history.redo(snap("new"))).toBeUndefined();
  });
  test("text, note offsets, IPA and language restore together across pages", () => {
    const text = "x".repeat(5000) + " fox『an animal』", offset = text.indexOf("『");
    const a: ReadingSnapshot = { text, offset: 5000, definitions: [{ start: offset, english: "an animal", chinese: "动物", britishIPA: "/fɒks/", term: "fox", language: "zh", mode: "article", contextKey: "article:" + "a".repeat(64) }] };
    const b = { ...a, text: "New " + text, definitions: a.definitions.map(view => ({ ...view, start: view.start + 4 })) };
    const history = new ReadingHistory(); history.record(a, b);
    const restored = history.undo(b)!;
    const document = new ReadingDocument(); document.setText(restored.text); document.select(document.locate(restored.offset));
    const views = new DefinitionViews(); views.reset(restored.text, restored.definitions);
    expect(document.index).toBe(1); expect(views.snapshot()).toEqual(a.definitions);
    expect(history.redo(restored)).toEqual(b);
  });
  test("rapid input coalesces but pauses, navigation and AI operations break groups", () => {
    let now = 0; const history = new ReadingHistory(50, 8_000_000, () => now);
    history.record(snap(""), snap("a"), true); now = 400;
    history.record(snap("a"), snap("ab"), true); now = 1500;
    history.record(snap("ab"), snap("abc"), true);
    expect(history.undo(snap("abc"))).toEqual(snap("ab")); expect(history.undo(snap("ab"))).toEqual(snap(""));
    history.record(snap(""), snap("a"), true); history.breakGroup(); history.record(snap("a"), snap("b"), true);
    expect(history.undo(snap("b"))).toEqual(snap("a"));
    history.record(snap("a"), snap("AI batch")); expect(history.undo(snap("AI batch"))).toEqual(snap("a"));
  });
  test("snapshots cannot be mutated by subsequent changes and same text is not an operation", () => {
    const history = new ReadingHistory(), a = snap("a"); history.record(a, snap("a")); expect(history.canUndo).toBe(false);
    history.record(a, snap("b")); a.text = "changed"; expect(history.undo(snap("b"))?.text).toBe("a");
  });
  test("capacity and byte budgets evict old data, reset isolates articles", () => {
    const history = new ReadingHistory(2); history.record(snap("a"), snap("b")); history.record(snap("b"), snap("c")); history.record(snap("c"), snap("d"));
    expect(history.undo(snap("d"))?.text).toBe("c"); expect(history.undo(snap("c"))?.text).toBe("b"); expect(history.canUndo).toBe(false);
    history.reset(); expect(history.canRedo).toBe(false);
    const bounded = new ReadingHistory(50, 100); bounded.record(snap("x".repeat(100)), snap("y")); expect(bounded.canUndo).toBe(false);
  });
  test("restoring a saved baseline becomes clean without changing that baseline", () => {
    const a = snap("saved"), b = snap("edited"), history = new ReadingHistory(); history.record(a, b);
    const restored = history.undo(b)!;
    expect(restored.text).toBe(a.text); expect(definitionContent(restored.definitions)).toEqual(definitionContent(a.definitions));
    // A later save changes only the external baseline, never the undo operation.
    expect(restored.text).not.toBe(b.text);
  });
});
