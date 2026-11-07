import { describe, expect, test } from "bun:test";
import { validBritishIPA, withIPA } from "../public/ts/pronunciation";
import { parseDictionaryResponse } from "../public/ts/dictionary";
import { DefinitionViews, definitionContent, readDefinitionViews } from "../public/ts/definitionViews";
import { parseArticleDraft } from "../public/ts/articleDraft";
import { wordExportText } from "../public/ts/wordExport";
import { characterCount, paginate } from "../public/ts/pagination";
const text = "water『a clear liquid』", view = { start: 5, term: "water", english: "a clear liquid", chinese: "水", language: "en" as const, britishIPA: "/ˈwɔːtə/" };
describe("independent shared British IPA", () => {
  test("validates pronunciation separately, preserving usable legacy or malformed-IPA meanings", () => {
    for (const ipa of ["/ˈwɔːtə/", "/teɪk ɒf/", "/riːd/", "/red/", "/θɪŋ/"]) expect(validBritishIPA(ipa)).toBe(true);
    for (const ipa of [null, "", "//", "water", "/你好/", "/w\n/", "/x『y/", "/x/ extra", "/" + "x".repeat(160) + "/"]) {
      expect(validBritishIPA(ipa)).toBe(false);
      const parsed = parseDictionaryResponse(JSON.stringify([{ ...view, britishIPA: ipa }]));
      expect(parsed.get("water")).toEqual({ english: view.english, chinese: view.chinese });
    }
    expect(parseDictionaryResponse(JSON.stringify([view])).get("water")?.britishIPA).toBe(view.britishIPA);
  });
  test("same IPA appears once in either language without changing canonical text, offsets or counts", () => {
    const views = new DefinitionViews(); views.reset(text, [view]); const note = views.at(5)!;
    expect(withIPA(note.english, note.britishIPA)).toBe("/ˈwɔːtə/ a clear liquid");
    expect(withIPA(note.chinese!, note.britishIPA)).toBe("/ˈwɔːtə/ 水");
    expect(paginate(text)[0]?.count).toBe(characterCount(text)); expect(note.start).toBe(5);
    expect(note.english).not.toContain("/ˈwɔːtə/"); expect(note.chinese).not.toContain("/ˈwɔːtə/");
  });
  test("does not duplicate IPA when AI repeats it in a meaning", () => {
    const parsed = parseDictionaryResponse(JSON.stringify([{ ...view, english: view.britishIPA + " " + view.english, chinese: view.britishIPA + " " + view.chinese }])).get("water")!;
    expect(parsed.english).toBe(view.english); expect(parsed.chinese).toBe(view.chinese);
    expect(withIPA(view.britishIPA + " " + view.english, view.britishIPA)).toBe("/ˈwɔːtə/ a clear liquid");
  });
  test("survives draft/save/offset edits and is discarded when the definition itself changes", () => {
    const draft = parseArticleDraft(JSON.stringify({ version: 2, text, index: 0, entry: null, definitions: [view] }))!;
    const views = new DefinitionViews(); views.reset(draft.text, draft.definitions);
    views.sync("😀 " + text); expect(views.snapshot()[0]?.britishIPA).toBe(view.britishIPA);
    expect(views.snapshot()[0]?.start).toBe(8); expect(definitionContent(views.snapshot())[0]?.britishIPA).toBe(view.britishIPA);
    views.sync(("😀 " + text).replace("a clear liquid", "a drink")); expect(views.at(8)?.britishIPA).toBeUndefined();
  });
  test("exports each current language with exactly one IPA, legacy notes still export", () => {
    expect(wordExportText(text, [view])).toBe("water『/ˈwɔːtə/ a clear liquid』");
    expect(wordExportText(text, [{ ...view, language: "zh" }])).toBe("water『/ˈwɔːtə/ 水』");
    expect(wordExportText(text, [])).toBe(text);
    expect(wordExportText(text, [{ ...view, britishIPA: "bad", language: "zh" }])).toBe("water『水』");
    expect(readDefinitionViews([{ ...view, britishIPA: "bad" }], text)[0]?.chinese).toBe("水");
  });
});
