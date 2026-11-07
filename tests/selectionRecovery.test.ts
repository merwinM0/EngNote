import { describe, expect, test } from "bun:test";
import { remapSelection } from "../public/ts/selectionRecovery";

describe("failed definition selections", () => {
  test("a completely failed request keeps the same word and phrase positions", () => {
    const ranges = [{ start: 0, end: 4 }, { start: 12, end: 20 }];
    expect(remapSelection(ranges, [])).toEqual(ranges);
  });
  test("partial success shifts later failed words by actual inserted annotation length", () => {
    expect(remapSelection([{ start: 10, end: 13 }], [{ offset: 4, value: "『meaning』" }])).toEqual([{ start: 19, end: 22 }]);
  });
  test("refresh replacement uses the length difference and ignores edits after a failed word", () => {
    expect(remapSelection([{ start: 20, end: 23 }], [{ offset: 4, value: "『new』", deleteCount: 10 }, { offset: 30, value: "『later』" }]))
      .toEqual([{ start: 15, end: 18 }]);
  });
});
