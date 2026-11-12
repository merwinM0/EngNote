import { describe, expect, test } from "bun:test";
import { definitionContent, DefinitionViews, readDefinitionViews } from "../public/ts/definitions/definitionViews";
import { parseArticleDraft } from "../public/ts/articles/articleDraft";

const text = "A fox『an animal』 walks past a dog『an animal』 and a bird『a flying animal』.";
function setup() { const views = new DefinitionViews(); views.reset(text); return views; }
function chooseChinese(views: DefinitionViews, start = text.indexOf("『")) {
  const note = views.at(start)!;
  Object.assign(note, { chinese: "一种动物", language: "zh" });
  return note;
}

describe("independent definition languages", () => {
  test("defaults to English and never shares choices between identical English definitions", () => {
    const views = setup(), first = chooseChinese(views), second = views.at(text.indexOf("『", first.start + 1))!;
    expect(first.id).not.toBe(second.id);
    expect(second.language).toBe("en");
    expect(second.chinese).toBeUndefined();
    first.language = "en";
    expect(views.get(second.id)).toEqual(second);
  });
  test("round-trips each language and cached Chinese without changing article text", () => {
    const views = setup(), first = chooseChinese(views);
    const second = views.at(text.indexOf("『", first.start + 1))!;
    Object.assign(second, { chinese: "另一种动物", language: "en" });
    const draft = parseArticleDraft(JSON.stringify({ version: 2, text, index: 0, entry: null, definitions: views.snapshot() }))!;
    const restored = new DefinitionViews(); restored.reset(draft.text, draft.definitions);
    expect(draft.text).toBe(text);
    expect(restored.at(first.start)?.language).toBe("zh");
    expect(restored.at(second.start)?.language).toBe("en");
    expect(restored.at(second.start)?.chinese).toBe("另一种动物");
  });
  test("moving note offsets during edits retains their identity and choice", () => {
    const views = setup(), first = chooseChinese(views);
    views.sync("😀 A new beginning. " + text);
    expect(views.get(first.id)?.start).toBe(first.start + "😀 A new beginning. ".length);
    expect(views.get(first.id)?.language).toBe("zh");
    const moved = views.get(first.id)!;
    views.sync(("😀 A new beginning. " + text).replace("an animal", "a wild creature"));
    expect(views.get(moved.id)).toBeUndefined();
    expect(views.at(moved.start)?.language).toBe("en");
  });
  test("multiple new definitions leave existing notes and their distinct choices intact", () => {
    const views = setup(), first = chooseChinese(views);
    const bird = views.at(text.lastIndexOf("『"))!;
    Object.assign(bird, { chinese: "会飞的动物", language: "zh" });
    const insertions = [{ offset: 1, value: "『one』" }, { offset: text.indexOf(" walks") + 6, value: "『moves on foot』" }];
    let next = text;
    for (const edit of [...insertions].sort((a, b) => b.offset - a.offset)) next = next.slice(0, edit.offset) + edit.value + next.slice(edit.offset);
    views.sync(next, insertions);
    expect(views.get(first.id)?.chinese).toBe("一种动物");
    expect(views.get(bird.id)?.language).toBe("zh");
    expect(views.at(1)?.language).toBe("en");
  });
  test("deleting one note does not change another, and old responses cannot target a fresh article", () => {
    const views = setup(), first = chooseChinese(views), bird = views.at(text.lastIndexOf("『"))!;
    Object.assign(bird, { chinese: "鸟类", language: "zh" });
    views.sync(text.replace("『an animal』", ""));
    expect(views.get(first.id)).toBeUndefined();
    expect(views.get(bird.id)?.chinese).toBe("鸟类");
    const previousId = bird.id;
    views.reset(text);
    expect(views.get(previousId)).toBeUndefined();
    expect(views.at(text.lastIndexOf("『"))?.language).toBe("en");
  });
  test("rejects invalid or mismatched cached views without losing the draft", () => {
    const valid = { start: text.indexOf("『"), english: "an animal", chinese: "动物", language: "zh" as const };
    const candidates = [null, {}, { ...valid, start: -1 }, { ...valid, english: "different" }, { ...valid, language: "fr" },
      { ...valid, chinese: "animal" }, { ...valid, chinese: "动物\n解释" }, { ...valid, chinese: "中".repeat(601) }, valid, valid];
    expect(readDefinitionViews(candidates, text)).toEqual([valid]);
    const draft = parseArticleDraft(JSON.stringify({ version: 2, text, index: 0, entry: null, definitions: candidates }))!;
    expect(draft.text).toBe(text);
    expect(draft.definitions).toEqual([valid]);
    const views = new DefinitionViews();
    expect(() => views.reset("『outer『inner』", [{ start: 6, english: "inner", chinese: "内部", language: "zh" }])).not.toThrow();
  });
});

describe("saved bilingual content", () => {
  test("keeps the original query identity across drafts and saves, while legacy notes remain readable", () => {
    const views = setup(), first = chooseChinese(views);
    first.term = "fox";
    const shared = views.snapshot();
    expect(shared[0]?.term).toBe("fox");
    const restored = new DefinitionViews(); restored.reset(text, shared);
    expect(restored.at(first.start)?.term).toBe("fox");
    expect(restored.at(first.start)?.language).toBe("zh");
    const invalid = [{ ...shared[0]!, term: '<script>bad</script>' }];
    expect(readDefinitionViews(invalid, text)[0]?.term).toBeUndefined();
    expect(readDefinitionViews(invalid, text)[0]?.chinese).toBe("一种动物");
  });
  test("language-neutral dirty comparisons do not change the snapshots used for saves", () => {
    const views = setup(); chooseChinese(views);
    const chosen = views.snapshot();
    expect(chosen[0]!.language).toBe("zh");
    expect(definitionContent(chosen)[0]!.language).toBe("en");
    const english = chosen.map(view => ({ ...view, language: "en" as const }));
    expect(definitionContent(chosen)).toEqual(definitionContent(english));
    expect(views.snapshot()[0]!.language).toBe("zh");
  });
  test("server data fills missing Chinese without changing the reader's existing choices", () => {
    const views = setup(), first = chooseChinese(views), second = views.at(text.indexOf("『", first.start + 1))!;
    views.merge([{ start: first.start, english: first.english, chinese: "动物", language: "en" },
      { start: second.start, english: second.english, chinese: "另一种动物", language: "zh" }]);
    expect(first.language).toBe("zh");
    expect(first.chinese).toBe("一种动物");
    expect(second.language).toBe("zh");
    expect(second.chinese).toBe("另一种动物");
  });
  test("replacing a legacy note preserves other bilingual identities and offsets", () => {
    const views = setup(), bird = views.at(text.lastIndexOf("『"))!;
    Object.assign(bird, { chinese: "鸟类", language: "zh" });
    const offset = text.indexOf("『"), value = "『a wild creature』", deleteCount = "『an animal』".length;
    const updated = text.slice(0, offset) + value + text.slice(offset + deleteCount);
    views.sync(updated, [{ offset, value, deleteCount }]);
    expect(views.at(offset)?.english).toBe("a wild creature");
    expect(views.get(bird.id)?.chinese).toBe("鸟类");
    expect(views.get(bird.id)?.start).toBe(bird.start + value.length - deleteCount);
  });
});
