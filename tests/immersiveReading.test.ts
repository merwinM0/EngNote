import { describe, expect, test } from "bun:test";
import { definitionSourceWords } from "../public/ts/definitions/definitionSource";
import { WORD_PATTERN } from "../public/ts/reading/text";
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
  test("shows and hides single occurrences, and resets all visibility on re-entry", () => {
    const mode = new ImmersiveReading(), { first, second } = fixture();
    expect(mode.concealed(first)).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(true);
    expect(mode.concealed(second)).toBe(true);
    mode.toggle(first);
    expect(mode.concealed(first)).toBe(false);
    expect(mode.concealed(second)).toBe(true);
    mode.toggle(first);
    expect(mode.concealed(first)).toBe(true);
    mode.toggle(first);
    mode.active = false;
    expect(mode.concealed(second)).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(true);
    expect(mode.concealed(second)).toBe(true);
  });
  test("showing or hiding mixed Chinese/English and legacy notes never changes language, IPA, canonical text or export", () => {
    const mode = new ImmersiveReading(), { text, views, first, second, legacy } = fixture();
    const before = views.snapshot(), exported = wordExportText(text, before);
    mode.active = true;
    for (const note of [first, second, legacy]) {
      expect(mode.concealed(note)).toBe(true);
      mode.toggle(note);
      expect(mode.concealed(note)).toBe(false);
      mode.toggle(note);
      expect(mode.concealed(note)).toBe(true);
    }
    expect(first.language).toBe("zh"); expect(second.language).toBe("en");
    expect(first.britishIPA).toBe("/fɒks/");
    expect(legacy.chinese).toBeUndefined();
    expect(views.snapshot()).toEqual(before);
    expect(wordExportText(text, views.snapshot())).toBe(exported);
  });
  test("undo/redo and offset edits retain occurrence identity within one activation", () => {
    const mode = new ImmersiveReading(), { text, views, first, second } = fixture();
    const history = new ReadingHistory(), before = { text, definitions: views.snapshot(), offset: 0 };
    mode.active = true; mode.toggle(first);
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
    mode.toggle(views.at(first.start + 2)!);
    views.reset(undo.text, undo.definitions);
    expect(mode.concealed(views.at(first.start)!)).toBe(true);
  });
  test("language choice is independent, but rewritten meanings do not inherit revelation", () => {
    const mode = new ImmersiveReading(), { first } = fixture();
    mode.active = true; mode.toggle(first);
    expect(mode.concealed({ ...first, language: "en" })).toBe(false);
    expect(mode.concealed({ ...first, id: 999, chinese: "新释义" })).toBe(true);
  });
  test("article or workspace replacement clears both the active mode and visible notes", () => {
    const mode = new ImmersiveReading(), { first } = fixture();
    mode.active = true; mode.toggle(first); mode.reset();
    expect(mode.active).toBe(false);
    mode.active = true;
    expect(mode.concealed(first)).toBe(true);
    expect(mode.concealed({ ...first, id: 999 })).toBe(true);
  });
  test("anchors a phrase to its exact occurrence, with an adjacent-word legacy fallback", () => {
    const source = (text: string, term?: string) => {
      const noteStart = text.indexOf("『");
      const words = Array.from(text.slice(0, noteStart).matchAll(WORD_PATTERN), match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
      return definitionSourceWords(words, text, noteStart, term).map(({ text, start }) => [text, start]);
    };
    expect(source("take off; Take\toff『go』", "take off")).toEqual([["Take", 10], ["off", 15]]);
    expect(source("Take, off『go』", "take off")).toEqual([["off", 6]]);
    expect(source("Take off『go』")).toEqual([["off", 5]]);
    expect(source("Go. 『unattached』")).toEqual([]);
  });
});
