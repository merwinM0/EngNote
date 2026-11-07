import { describe, expect, test } from "bun:test";
import { NOTE_TAPE_COLORS, randomNoteTape } from "../public/ts/noteTape";
import { DefinitionViews } from "../public/ts/definitionViews";
import { readFileSync } from "node:fs";

describe("random decorative note tape", () => {
  test("draws only from the five existing translucent stationery colors", () => {
    for (const [index, color] of NOTE_TAPE_COLORS.entries()) expect(randomNoteTape(() => (index + .5) / NOTE_TAPE_COLORS.length)).toBe(color);
    const css = readFileSync("public/css/content.css", "utf8");
    for (const color of NOTE_TAPE_COLORS) expect(css).toContain(`[data-tape="${color}"] { --note-bg: var(--tape-${color}); }`);
  });
  test("retains a note's color across offset edits but never serializes it", () => {
    const views = new DefinitionViews(), text = "bank『a financial institution』";
    views.reset(text, [{ start: 4, english: "a financial institution", chinese: "银行", language: "en" }]);
    views.at(4)!.tape = "lilac";
    views.sync("A " + text);
    expect(views.at(6)!.tape).toBe("lilac");
    expect(views.snapshot()[0]).not.toHaveProperty("tape");
    views.reset("A " + text, views.snapshot()); expect(views.at(6)!.tape).toBeUndefined();
  });
});
