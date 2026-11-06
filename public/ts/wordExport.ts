import { strToU8, zipSync } from "fflate";
import { readDefinitionViews, type DefinitionView } from "./definitionViews";

export const WORD_DOCUMENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Use canonical offsets, not the mounted page or a global language preference. */
export function wordExportText(text: string, definitions: readonly DefinitionView[] = []): string {
  const byStart = new Map(readDefinitionViews(definitions, text).map(note => [note.start, note]));
  return text.replace(/『([^』]*)』/g, (original: string, _english: string, start: number) => {
    const note = byStart.get(start);
    return note?.language === "zh" ? `『${note.chinese}』` : original;
  });
}

/** XML 1.0 excludes control characters and lone surrogates, but keeps valid Unicode. */
function xmlText(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function paragraph(value: string, heading = false): string {
  const contents = value.split(/(\n|\t)/).map(part => part === "\n" ? "<w:br/>" : part === "\t" ? "<w:tab/>"
    : `<w:t xml:space="preserve">${xmlText(part)}</w:t>`).join("");
  return `<w:p>${heading ? '<w:pPr><w:keepNext/></w:pPr>' : ""}<w:r>${heading ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : ""}${contents}</w:r></w:p>`;
}

/** A real OOXML package, created locally without importing any screen/paper styling. */
export function createWordDocument(text: string, definitions: readonly DefinitionView[] = [], title = ""): Uint8Array {
  const visible = wordExportText(text, definitions).replace(/\r\n?/g, "\n");
  const document = `${XML_HEADER}<w:document xmlns:w="${WORD_NS}"><w:background w:color="FFFFFF"/><w:body>${title ? paragraph(title.replace(/\r\n?/g, "\n"), true) : ""}${visible.split("\n\n").map(value => paragraph(value)).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `${XML_HEADER}<w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="SimSun"/><w:color w:val="000000"/><w:sz w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="${REL_NS}/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(document),
    "word/_rels/document.xml.rels": strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`),
    "word/styles.xml": strToU8(styles),
  }, { level: 6 });
}

export function wordExportFilename(title: string): string {
  let name = title.replace(/[<>:"/\\|?*\p{Cc}\p{Cf}\p{Cs}]/gu, "").trim().replace(/\.docx$/i, "").replace(/[. ]+$/g, "");
  name = Array.from(name).slice(0, 100).join("").replace(/[. ]+$/g, "") || "EngNote";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `EngNote-${name}`;
  return `${name}.docx`;
}
