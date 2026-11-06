import { describe, expect, test } from "bun:test";
import { DICTIONARY_PROMPT, parseDictionaryResponse } from "../public/ts/dictionary";

const pair = { term: "fox", english: "a wild animal", chinese: "一种野生动物" };
describe("one-response bilingual dictionary", () => {
  test("requests both languages in the same response", () => {
    expect(DICTIONARY_PROMPT).toContain('"english": string, "chinese": string');
    expect(DICTIONARY_PROMPT).toContain("Both languages are required in this single response");
  });
  test("parses complete English/Chinese pairs and Markdown JSON wrappers", () => {
    const raw = "```json\n" + JSON.stringify([pair, { term: "take off", english: "to leave the ground", chinese: "离开地面起飞" }]) + "\n```";
    const meanings = parseDictionaryResponse(raw);
    expect(meanings.get("fox")).toEqual({ english: pair.english, chinese: pair.chinese });
    expect(meanings.get("take off")).toEqual({ english: "to leave the ground", chinese: "离开地面起飞" });
  });
  test("normalizes term keys and trims meanings without truncation", () => {
    expect(parseDictionaryResponse(JSON.stringify([{ ...pair, term: " Fox ", english: " a wild animal ", chinese: " 一种野生动物 " }])).get("fox"))
      .toEqual({ english: pair.english, chinese: pair.chinese });
  });
  test("skips incomplete or malformed pairs instead of creating English-only notes", () => {
    const invalid = [{ term: "fox", english: "a wild animal" }, { term: "fox", chinese: "动物" }, { ...pair, chinese: "" },
      { ...pair, english: "动物" }, { ...pair, english: "" }, { ...pair, chinese: "an animal" }, { ...pair, term: 123 },
      { ...pair, english: "a\nanimal" }, { ...pair, chinese: "动物\n解释" }, { ...pair, chinese: "动物『解释』" },
      { ...pair, english: "a".repeat(601) }, { ...pair, chinese: "中".repeat(601) }, null];
    expect(parseDictionaryResponse(JSON.stringify(invalid)).size).toBe(0);
    expect(parseDictionaryResponse(JSON.stringify([...invalid, pair])).size).toBe(1);
  });
  test("rejects invalid JSON and non-array responses", () => {
    for (const raw of ["", "{", "null", "中文", JSON.stringify(pair), '"definitions"']) expect(() => parseDictionaryResponse(raw)).toThrow("bilingual dictionary");
  });
});
