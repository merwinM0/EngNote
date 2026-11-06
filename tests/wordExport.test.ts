import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { DefinitionViews, type DefinitionView } from "../public/ts/definitionViews";
import { paginate } from "../public/ts/pagination";
import { extractWordXml } from "../public/ts/word";
import { createWordDocument, WORD_DOCUMENT_TYPE, wordExportFilename, wordExportText } from "../public/ts/wordExport";

function bilingual(text: string, languages: Array<"en" | "zh">): DefinitionView[] {
  return [...text.matchAll(/『([^』]*)』/g)].map((match, index) => ({
    start: match.index, english: match[1]!, chinese: `释义${index + 1}`, language: languages[index] ?? "en",
  }));
}

describe("Word export language snapshot", () => {
  test("exports each note's displayed language independently, even for identical meanings", () => {
    const text = "A fox『an animal』 meets a dog『an animal』 and a bird『an animal』.";
    const definitions = bilingual(text, ["zh", "en", "zh"]);
    const before = JSON.stringify(definitions);
    expect(wordExportText(text, definitions)).toBe("A fox『释义1』 meets a dog『an animal』 and a bird『释义3』.");
    expect(JSON.stringify(definitions)).toBe(before);
    expect(text).toContain("fox『an animal』");
  });
  test("does not let earlier replacement lengths shift later note identities", () => {
    const text = "One『a』, two『a much longer meaning』, three『b』.";
    const definitions = bilingual(text, ["zh", "zh", "en"]);
    definitions[0]!.chinese = "一个比原文长得多的中文解释";
    expect(wordExportText(text, definitions)).toBe("One『一个比原文长得多的中文解释』, two『释义2』, three『b』.");
  });
  test("keeps English-only notes and ignores stale or invalid translations", () => {
    const text = "A fox『an animal』 reads『look at words』.";
    const definitions = bilingual(text, ["zh", "zh"]);
    expect(wordExportText(text)).toBe(text);
    expect(wordExportText(text, [
      { ...definitions[0]!, start: 1 },
      { ...definitions[1]!, english: "a stale definition" },
    ])).toBe(text);
    expect(wordExportText(text, [{ ...definitions[0]!, chinese: "" }])).toBe(text);
  });
  test("includes notes on every page, not only the current mounted reading page", () => {
    const text = "Start『the beginning』.\n\n" + "An English paragraph.\n\n".repeat(400) + "End『the finish』.";
    expect(paginate(text).length).toBeGreaterThan(1);
    const definitions = bilingual(text, ["en", "zh"]);
    const document = extractWordXml(createWordDocument(text, definitions));
    expect(document).toContain("Start『the beginning』.");
    expect(document).toContain("End『释义2』.");
    expect(document.match(/An English paragraph\./g)?.length).toBe(400);
  });
  test("takes a read-only snapshot without changing note languages, identities or article text", () => {
    const text = "A fox『an animal』 meets a bird『a flying animal』.";
    const views = new DefinitionViews();
    views.reset(text, bilingual(text, ["zh", "en"]));
    const before = views.snapshot(), firstId = views.at(text.indexOf("『"))!.id;
    createWordDocument(text, views.snapshot(), "A story");
    expect(views.snapshot()).toEqual(before);
    expect(views.at(text.indexOf("『"))!.id).toBe(firstId);
  });
});

describe("plain white DOCX package", () => {
  test("creates a genuine OOXML package with document, styles and their relationships", () => {
    const bytes = createWordDocument("Hello『a greeting』.", [], "My article");
    const files = unzipSync(bytes);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(WORD_DOCUMENT_TYPE).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml",
    ]);
    expect(strFromU8(files["[Content_Types].xml"]!)).toContain('PartName="/word/document.xml"');
    expect(strFromU8(files["_rels/.rels"]!)).toContain('Target="word/document.xml"');
    expect(strFromU8(files["word/_rels/document.xml.rels"]!)).toContain('Target="styles.xml"');
    const xml = extractWordXml(bytes);
    expect(xml.indexOf("My article")).toBeLessThan(xml.indexOf("Hello『a greeting』."));
    expect(xml).toContain('w:pgSz w:w="11906" w:h="16838"');
  });
  test("uses white paper, black text and plain bracketed notes, without tape or paper textures", () => {
    const text = "A fox『an animal』 reads.";
    const files = unzipSync(createWordDocument(text, bilingual(text, ["zh"])));
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain('<w:background w:color="FFFFFF"/>');
    expect(xml).toContain("A fox『释义1』 reads.");
    expect(strFromU8(files["word/styles.xml"]!)).toContain('<w:color w:val="000000"/>');
    for (const bytes of Object.values(files)) {
      expect(strFromU8(bytes)).not.toMatch(/<w:(?:shd|highlight|drawing|pict)\b|TargetMode="External"|tape|texture|data-paper/);
    }
  });
  test("escapes XML metacharacters in both article/title and bilingual definitions", () => {
    const text = 'A <fox> & "bird"『a & b』. </w:t><w:shd/>';
    const definitions = bilingual(text, ["zh"]);
    definitions[0]!.chinese = "中文<&>解释";
    const xml = extractWordXml(createWordDocument(text, definitions, 'Title <&> "quoted"'));
    expect(xml).toContain("Title &lt;&amp;&gt; &quot;quoted&quot;");
    expect(xml).toContain("A &lt;fox&gt; &amp; &quot;bird&quot;『中文&lt;&amp;&gt;解释』.");
    expect(xml).toContain("&lt;/w:t&gt;&lt;w:shd/&gt;");
    expect(xml).not.toContain("<w:shd/>");
  });
  test("keeps paragraphs, line breaks, tabs, spaces, Chinese and supplementary Unicode", () => {
    const xml = extractWordXml(createWordDocument("  First\tline\nnext\n\nLast  \r\nend\r中文 😀"));
    expect(xml.match(/<w:p>/g)?.length).toBe(2);
    expect(xml.match(/<w:br\/>/g)?.length).toBe(3);
    expect(xml).toContain("<w:tab/>");
    expect(xml).toContain('<w:t xml:space="preserve">  First</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">Last  </w:t>');
    expect(xml).toContain("中文 😀");
  });
  test("removes characters forbidden by XML 1.0 without corrupting valid Unicode", () => {
    const xml = extractWordXml(createWordDocument("a\u0000\u0008\u000b\ud800b\ufffe😀", [], "T\u0001itle"));
    expect(xml).toContain("ab😀");
    expect(xml).toContain("Title");
    expect(xml).not.toMatch(/[\u0000\u0008\u000b\ufffe]/);
  });
  test("exports long documents without truncating the end or serializing UI state", () => {
    const text = "Reading 2026! ".repeat(7000) + "THE LAST LINE.";
    const xml = extractWordXml(createWordDocument(text));
    expect(xml).toContain(text);
    expect(xml).not.toMatch(/sessionStorage|localStorage|apiKey/);
  });
});

describe("download filenames", () => {
  test("uses the article title while removing unsafe filesystem characters", () => {
    expect(wordExportFilename('A / story: "fox"?')).toBe("A  story fox.docx");
    expect(wordExportFilename("Mixed notes.docx")).toBe("Mixed notes.docx");
    expect(wordExportFilename("中文释义 😀")).toBe("中文释义 😀.docx");
    expect(wordExportFilename("... ")).toBe("EngNote.docx");
    expect(wordExportFilename("")).toBe("EngNote.docx");
    expect(wordExportFilename("CON")).toBe("EngNote-CON.docx");
    expect(wordExportFilename("LPT1.txt")).toBe("EngNote-LPT1.txt.docx");
    expect(wordExportFilename("name\u0000\u202e\ud800")).toBe("name.docx");
    expect(Array.from(wordExportFilename("😀".repeat(101)).replace(/\.docx$/, "")).length).toBe(100);
  });
});
