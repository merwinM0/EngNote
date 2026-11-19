import { describe, expect, test } from "bun:test";
import { definitionSourceRange, definitionSourceWords } from "../public/ts/definitions/definitionSource";
import { WORD_PATTERN } from "../public/ts/reading/text";
import { ImmersiveReading } from "../public/ts/reading/immersiveReading";
import { DefinitionViews } from "../public/ts/definitions/definitionViews";
import { wordExportText } from "../public/ts/word/wordExport";

const range = (start: number, end: number) => ({ start, end });
function choose(mode: ImmersiveReading, a: ReturnType<typeof range>, b = a) {
  expect(mode.press()).toBe("select");
  expect(mode.choose(a)).toBe("start");
  return mode.choose(b);
}

describe("article-local immersive reading", () => {
  test("accepts single words and reverse selection, toggling just the chosen region", () => {
    const mode = new ImmersiveReading();
    expect(choose(mode, range(20, 25), range(0, 4))).toBe("entered");
    expect(mode.intersects(range(4, 13))).toBe(true);
    expect(mode.intersects(range(25, 29))).toBe(false);
    expect(choose(mode, range(4, 13))).toBe("exited");
    expect(mode.intersects(range(4, 13))).toBe(false);
    expect(mode.intersects(range(0, 4))).toBe(true);
    expect(mode.intersects(range(20, 25))).toBe(true);
  });
  test("fills a mixed range and keeps a separate range unchanged", () => {
    const mode = new ImmersiveReading();
    choose(mode, range(0, 2)); choose(mode, range(20, 22));
    expect(choose(mode, range(1, 2), range(5, 6))).toBe("entered");
    expect(mode.intersects(range(4, 5))).toBe(true);
    expect(choose(mode, range(0, 2), range(5, 6))).toBe("exited");
    expect(mode.intersects(range(5, 6))).toBe(false);
    expect(mode.intersects(range(20, 22))).toBe(true);
  });
  test("an empty selection can enter full immersion; a third press or a reset exits all", () => {
    const mode = new ImmersiveReading();
    choose(mode, range(3, 7));
    expect(mode.press()).toBe("select");
    expect(mode.press()).toBe("full");
    expect(mode.full).toBe(true);
    expect(mode.concealed(4, range(300, 310))).toBe(true);
    expect(mode.press()).toBe("exited");
    expect(mode.active).toBe(false);
    expect(mode.press()).toBe("select");
    expect(mode.choose(range(0, 2))).toBe("start");
    expect(mode.press()).toBe("canceled");
    expect(mode.active).toBe(false);
    choose(mode, range(0, 2)); mode.reset();
    expect(mode.choose(range(0, 2))).toBeNull();
    expect(mode.intersects(range(0, 2))).toBe(false);
  });
  test("only new ranges start with hidden notes; revealing does not change canonical text, language, or export", () => {
    const text = "fox『animal』 and fox『animal』";
    const views = new DefinitionViews();
    views.reset(text, [{ start: 3, english: "animal", chinese: "狐狸", language: "zh", britishIPA: "/fɒks/", term: "fox" }]);
    const before = views.snapshot(), exportBefore = wordExportText(text, before);
    const first = views.at(3)!, id = first.id, source = range(0, 3), second = range(16, 19);
    const mode = new ImmersiveReading();
    choose(mode, source); expect(mode.concealed(id, source)).toBe(true);
    mode.toggle(id, source); expect(mode.concealed(id, source)).toBe(false);
    choose(mode, second); expect(mode.concealed(id, source)).toBe(false);
    choose(mode, source); expect(mode.concealed(id, source)).toBe(false);
    choose(mode, source); expect(mode.concealed(id, source)).toBe(true);
    mode.toggle(id, source); mode.toggle(id, source); expect(mode.concealed(id, source)).toBe(true);
    expect(views.snapshot()).toEqual(before);
    expect(wordExportText(text, views.snapshot())).toBe(exportBefore);
  });
  test("range offsets follow unaffected words after insertions and trim safely across replacements", () => {
    const mode = new ImmersiveReading(); choose(mode, range(4, 7));
    mode.toggle(2, range(4, 7));
    mode.rebase("aaa cat tail", "aaa big cat tail");
    expect(mode.intersects(range(4, 7))).toBe(false);
    expect(mode.intersects(range(8, 11))).toBe(true);
    expect(mode.concealed(2, range(8, 11))).toBe(false);
    mode.edit({ start: 6, end: 10, length: 2 });
    expect(mode.intersects(range(7, 8))).toBe(false);
    expect(mode.intersects(range(8, 9))).toBe(true);
    mode.edit({ start: 8, end: 9, length: 0 });
    expect(mode.active).toBe(false);
  });
  test("maps the exact annotated phrase, including across pages, with an adjacent-word fallback", () => {
    const text = "take off; Take\toff『go』", start = text.indexOf("『");
    const words = Array.from(text.slice(0, start).matchAll(WORD_PATTERN), m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
    expect(definitionSourceWords(words, text, start, "take off").map(word => word.start)).toEqual([10, 15]);
    expect(definitionSourceRange(text, start, "take off")).toEqual(range(10, 18));
    expect(definitionSourceRange("Take, off『go』", 9, "take off")).toEqual(range(6, 9));
    expect(definitionSourceRange("Go. 『unattached』", 4)).toEqual(range(4, 5));
  });
});
