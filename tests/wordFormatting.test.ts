import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DOMParser as XmlParser } from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { extractWordParts, importWord } from "../public/ts/word";
import { wordPartsToDocument } from "../public/ts/wordFormattingImport";
import { createWordDocument } from "../public/ts/wordExport";
const previous = globalThis.DOMParser;
beforeAll(() => { globalThis.DOMParser = XmlParser as unknown as typeof DOMParser; });
afterAll(() => { globalThis.DOMParser = previous; });
const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const document = (body: string) => `<w:document ${ns}><w:body>${body}</w:body></w:document>`;
const styles = `<w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:eastAsia="SimSun"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:styleId="Base"><w:rPr><w:b/><w:color w:val="123456"/></w:rPr><w:pPr><w:spacing w:after="240"/></w:pPr></w:style><w:style w:styleId="Heading"><w:basedOn w:val="Base"/><w:pPr><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="36"/></w:rPr></w:style></w:styles>`;
const body = '<w:p><w:pPr><w:pStyle w:val="Heading"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:rPr><w:i/><w:rFonts w:ascii="Arial"/><w:u w:val="single"/><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">  Hello</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t> world.</w:t></w:r></w:p>';

describe("Word text formatting import/export", () => {
  test("extracts a bounded allowlist, ignoring relationships, media and embedded scripts", () => {
    const zip = zipSync({ "word/document.xml": strToU8(document(body)), "word/styles.xml": strToU8(styles), "word/media/ignored.bin": new Uint8Array(100), "word/_rels/document.xml.rels": strToU8("external ignored") });
    const parts = extractWordParts(zip);
    expect(Object.keys(parts).sort()).toEqual(["word/document.xml", "word/styles.xml"]);
    expect(wordPartsToDocument(parts).text).toBe("Title\n\n  Hello world.");
  });
  test("retains inherited/default fonts, explicit effects, heading and paragraph spacing", () => {
    const imported = wordPartsToDocument({ "word/document.xml": document(body), "word/styles.xml": styles });
    expect(imported.formatting.runs[0]!.style).toMatchObject({ font: "Georgia", eastAsiaFont: "SimSun", size: 18, bold: true, color: "#123456" });
    expect(imported.formatting.paragraphs[0]!.style).toEqual({ align: "center", after: 12, heading: 1 });
    expect(imported.formatting.runs[1]!.style).toMatchObject({ font: "Arial", italic: true, underline: true, highlight: "#FFFF00", size: 12 });
    expect(imported.formatting.runs[2]!.style.vertical).toBe("superscript");
  });
  test("resolves theme fonts and inherited false effects without downloading any resources", () => {
    const theme = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="SimSun"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
    const source = document('<w:p><w:pPr><w:pStyle w:val="Base"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:rFonts w:asciiTheme="minorHAnsi"/><w:color w:val="auto"/><w:highlight w:val="none"/></w:rPr><w:t>Word</w:t></w:r></w:p>');
    const result = wordPartsToDocument({ "word/document.xml": source, "word/styles.xml": styles.replace("<w:b/>", '<w:b/><w:highlight w:val="yellow"/>'), "word/theme/theme1.xml": theme });
    expect(result.formatting.runs[0]!.style).toMatchObject({ font: "Calibri", bold: false, color: "#000000", highlight: "none" });
  });
  test("keeps tables, merged cells, shading, lists, tabs and explicit line breaks", () => {
    const source = document('<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Item</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:fill="ABCDEF"/></w:tcPr><w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:br/><w:t>C</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
    const numbering = `<w:numbering ${ns}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    const result = wordPartsToDocument({ "word/document.xml": source, "word/numbering.xml": numbering });
    expect(result.text).toBe("Item\n\nA\tB\n\nC");
    expect(result.formatting.paragraphs[0]!.marker).toBe("1.");
    expect(result.formatting.paragraphs[1]!.cell).toMatchObject({ table: 0, colSpan: 2, fill: "#ABCDEF" });
    expect(result.formatting.paragraphs[2]!.cell).toEqual(result.formatting.paragraphs[1]!.cell);
  });
  test("preserves common Roman/alphabetic numbering and maps standard Symbol bullets", () => {
    const source = document('<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Item</w:t></w:r></w:p>');
    for (const [format, start, expected] of [["upperRoman", 4, "IV."], ["lowerRoman", 9, "ix."], ["upperLetter", 27, "AA."], ["lowerLetter", 27, "aa."], ["decimalZero", 1, "01."], ["bullet", 1, "•"]] as const) {
      const numbering = `<w:numbering ${ns}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${format === "bullet" ? "\uF0B7" : "%1."}"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
      expect(wordPartsToDocument({ "word/document.xml": source, "word/numbering.xml": numbering }).formatting.paragraphs[0]!.marker).toBe(expected);
    }
  });
  test("imports a File without reflowing original leading spaces, font runs or paragraphs", async () => {
    const bytes = zipSync({ "word/document.xml": strToU8(document(body)), "word/styles.xml": strToU8(styles) });
    const result = await importWord(new File([new Uint8Array(bytes).buffer], "example.docx"));
    expect(result.text).toBe("Title\n\n  Hello world."); expect(result.formatting.runs).toHaveLength(3);
  });
  test("exports original fonts and layout alongside current bilingual note language", () => {
    const source = document('<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:rFonts w:ascii="Georgia"/></w:rPr><w:t>fox『animal』</w:t></w:r></w:p>');
    const imported = wordPartsToDocument({ "word/document.xml": source });
    const zip = createWordDocument(imported.text, [{ start: 3, english: "animal", chinese: "动物", language: "zh", britishIPA: "/fɒks/" }], "", imported.formatting);
    const xml = strFromU8(unzipSync(zip)["word/document.xml"]!);
    expect(xml).toContain('w:ascii="Georgia"'); expect(xml).toContain('<w:b w:val="1"/>'); expect(xml).toContain('<w:jc w:val="right"/>');
    expect(xml).toContain("『/fɒks/ 动物』"); expect(xml).not.toContain("『animal』");
    expect(wordPartsToDocument(extractWordParts(zip)).formatting.runs.some(run => run.style.font === "Georgia")).toBe(true);
  });
  test("exports merged tables and list markers as valid OOXML", () => {
    const imported = wordPartsToDocument({ "word/document.xml": document('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>') });
    const exported = createWordDocument(imported.text, [], "", imported.formatting);
    const xml = strFromU8(unzipSync(exported)["word/document.xml"]!);
    expect(xml).toContain("<w:tbl>"); expect(xml).toContain("<w:tc>");
    expect(wordPartsToDocument(extractWordParts(exported)).text).toBe("Cell");
  });
  test("rejects unsafe/circular style data and explicitly reports unsupported objects", () => {
    const cyclic = `<w:styles ${ns}><w:style w:styleId="A"><w:basedOn w:val="A"/></w:style></w:styles>`;
    expect(() => wordPartsToDocument({ "word/document.xml": document('<w:p><w:pPr><w:pStyle w:val="A"/></w:pPr><w:r><w:t>Hi</w:t></w:r></w:p>'), "word/styles.xml": cyclic })).toThrow("circular");
    expect(() => wordPartsToDocument({ "word/document.xml": document('<w:p><w:r><w:rPr><w:rFonts w:ascii="url(example)"/></w:rPr><w:t>Hi</w:t></w:r></w:p>') })).toThrow("font");
    const result = wordPartsToDocument({ "word/document.xml": document('<w:p><w:r><w:t>Safe</w:t><w:drawing/></w:r></w:p>') });
    expect(result.text).toBe("Safe"); expect(result.hasUnsupportedObjects).toBe(true);
  });
});
