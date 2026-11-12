import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ImmersiveReading } from "../public/ts/reading/immersiveReading";
import { DefinitionViews } from "../public/ts/definitions/definitionViews";
import { ReadingHistory } from "../public/ts/reading/readingHistory";
import { wordExportText } from "../public/ts/word/wordExport";

function fixture() {
  const text = "fox『an animal』 and fox『an animal』; legacy『old note』.";
  const views = new DefinitionViews();
  views.reset(text, [
    { start: 3, english: "an animal", chinese: "狐狸", language: "zh", britishIPA: "/fɒks/", term: "fox" },
    { start: text.indexOf("『", 4), english: "an animal", chinese: "狐狸", language: "en", term: "fox" },
  ]);
  return { text, views, first: views.at(3)!, second: views.at(text.indexOf("『", 4))!, legacy: views.at(text.lastIndexOf("『"))! };
}

describe("article-local immersive reading", () => {
  test("conceals all initially, reveals only the clicked occurrence, and remembers across exit/re-entry", () => {
    const mode = new ImmersiveReading(), { first, second } = fixture();
    expect(mode.concealed(first)).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(true);
    expect(mode.concealed(second)).toBe(true);
    mode.reveal(first);
    expect(mode.concealed(first)).toBe(false);
    expect(mode.concealed(second)).toBe(true);
    mode.active = false;
    expect(mode.concealed(second)).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(false);
    expect(mode.concealed(second)).toBe(true);
  });
  test("revealing mixed Chinese/English and legacy notes never changes language, IPA, canonical text or export", () => {
    const mode = new ImmersiveReading(), { text, views, first, second, legacy } = fixture();
    const before = views.snapshot(), exported = wordExportText(text, before);
    mode.active = true;
    for (const note of [first, second, legacy]) {
      expect(mode.concealed(note)).toBe(true);
      mode.reveal(note); mode.reveal(note);
      expect(mode.concealed(note)).toBe(false);
    }
    expect(first.language).toBe("zh"); expect(second.language).toBe("en");
    expect(first.britishIPA).toBe("/fɒks/");
    expect(legacy.chinese).toBeUndefined();
    expect(views.snapshot()).toEqual(before);
    expect(wordExportText(text, views.snapshot())).toBe(exported);
  });
  test("ordinary offset edits retain revealed identity while other notes stay concealed", () => {
    const mode = new ImmersiveReading(), { text, views, first } = fixture();
    mode.active = true; mode.reveal(first);
    views.sync("A " + text);
    expect(mode.concealed(views.at(5)!)).toBe(false);
    expect(mode.concealed(views.at(text.indexOf("『", 4) + 2)!)).toBe(true);
  });
  test("undo/redo recreates note IDs without undoing immersion or previously revealed notes", () => {
    const mode = new ImmersiveReading(), { text, views, first, second } = fixture();
    const history = new ReadingHistory(), before = { text, definitions: views.snapshot(), offset: 0 };
    mode.active = true; mode.reveal(first);
    const nextText = "A " + text;
    views.sync(nextText);
    expect(mode.concealed(views.at(first.start + 2)!)).toBe(false);
    const after = { text: nextText, definitions: views.snapshot(), offset: 0 };
    history.record(before, after);
    const undo = history.undo(after)!;
    views.reset(undo.text, undo.definitions);
    expect(mode.concealed(views.at(first.start)!)).toBe(false);
    expect(mode.concealed(views.at(second.start)!)).toBe(true);
    const redo = history.redo(undo)!;
    views.reset(redo.text, redo.definitions);
    expect(mode.active).toBe(true);
    expect(mode.concealed(views.at(first.start + 2)!)).toBe(false);
    expect(mode.concealed(views.at(second.start + 2)!)).toBe(true);
    expect(history.canRedo).toBe(false);
  });
  test("language choice is independent, but rewritten meanings do not inherit revelation", () => {
    const mode = new ImmersiveReading(), { first } = fixture();
    mode.active = true; mode.reveal(first);
    expect(mode.concealed({ ...first, language: "en" })).toBe(false);
    expect(mode.concealed({ ...first, id: 999, chinese: "新释义" })).toBe(true);
  });
  test("article/workspace replacement clears both the active mode and remembered revelation", () => {
    const mode = new ImmersiveReading(), { first } = fixture();
    mode.active = true; mode.reveal(first); mode.reset();
    expect(mode.active).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(true);
    expect(mode.concealed({ ...first, id: 999 })).toBe(true);
  });
  test("concealed note text keeps layout but is hidden, and clear is aligned to the row's right edge", () => {
    const css = readFileSync("public/css/content.css", "utf8");
    expect(css).toContain(".content .note.is-concealed .note-text { visibility: hidden; }");
    expect(readFileSync("public/css/layout.css", "utf8")).toContain(".toolbar #clearBtn { margin-inline-start: auto; }");
  });
});
