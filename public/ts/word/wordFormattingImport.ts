import { DOCUMENT_LIMIT } from "../reading/pagination";
import { readParagraphStyle, readRunStyle, validateFormatting, type DocumentFormatting, type FormatParagraph, type FormatRun, paragraphRanges, type ParagraphStyle, type RunStyle, type TableCell } from "./documentFormatting";

export type WordImport = { text: string; formatting: DocumentFormatting; hasUnsupportedObjects: boolean };
export type WordParts = Record<string, string>;
const namespaces = ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"];
const children = (node: Element) => Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
const child = (node: Element | undefined, name: string) => node && children(node).find(el => el.namespaceURI === node.namespaceURI && el.localName === name);
const descendants = (node: Element, name: string) => Array.from(node.getElementsByTagNameNS(node.namespaceURI, name));
const attr = (node: Element | undefined, name = "val") => node?.getAttributeNS(node.namespaceURI, name) ?? "";
const numeric = (node: Element | undefined, name = "val") => { const raw = attr(node, name); return raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined; };
const toggle = (node: Element | undefined) => node ? !["0", "false", "off", "none"].includes(attr(node)) : undefined;
function xml(source: string): Element {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsupported XML declarations in this document.");
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) throw new Error("The Word document contains invalid XML.");
  return doc.documentElement;
}
const highlights: Record<string, string> = { yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF", blue: "#0000FF", red: "#FF0000", darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0", black: "#000000", white: "#FFFFFF" };
type Properties = { run: RunStyle; paragraph: ParagraphStyle; numbering?: { id: string; level: number } };
export function wordPartsToDocument(parts: WordParts): WordImport {
  const document = xml(parts["word/document.xml"] ?? "");
  if (!document.namespaceURI || !namespaces.includes(document.namespaceURI)) throw new Error("This file is not a supported Word document.");
  const body = child(document, "body");
  if (!body) throw new Error("The Word document has no body text.");
  const theme = parts["word/theme/theme1.xml"] ? xml(parts["word/theme/theme1.xml"]!) : undefined;
  const themeFont = (value: string, eastAsia = false) => {
    const group = theme && Array.from(theme.getElementsByTagNameNS("*", value.startsWith("major") ? "majorFont" : "minorFont"))[0];
    const font = group && Array.from(group.getElementsByTagNameNS("*", eastAsia ? "ea" : "latin"))[0];
    return font?.getAttribute("typeface") || undefined;
  };
  function runProperties(node?: Element): RunStyle {
    if (!node) return {};
    const result: RunStyle = {}, fonts = child(node, "rFonts");
    const latin = attr(fonts, "ascii") || attr(fonts, "hAnsi") || themeFont(attr(fonts, "asciiTheme") || attr(fonts, "hAnsiTheme"));
    const eastAsia = attr(fonts, "eastAsia") || (attr(fonts, "eastAsiaTheme") ? themeFont(attr(fonts, "eastAsiaTheme"), true) : undefined);
    if (latin) result.font = latin;
    if (eastAsia) result.eastAsiaFont = eastAsia;
    const size = numeric(child(node, "sz")); if (size !== undefined) result.size = size / 2;
    for (const [xmlName, key] of [["b", "bold"], ["i", "italic"], ["strike", "strike"], ["u", "underline"]] as const) {
      const value = toggle(child(node, xmlName)); if (value !== undefined) result[key] = value;
    }
    const value = attr(child(node, "color")); if (/^[\da-f]{6}$/i.test(value)) result.color = `#${value}`; else if (value === "auto") result.color = "#000000";
    const highlightValue = attr(child(node, "highlight")), highlight = highlights[highlightValue];
    if (highlight) result.highlight = highlight; else if (highlightValue === "none") result.highlight = "none";
    const fill = attr(child(node, "shd"), "fill"); if (/^[\da-f]{6}$/i.test(fill)) result.highlight = `#${fill}`;
    const vertical = attr(child(node, "vertAlign")); if (["baseline", "superscript", "subscript"].includes(vertical)) result.vertical = vertical as RunStyle["vertical"];
    const spacing = numeric(child(node, "spacing")); if (spacing !== undefined) result.spacing = spacing / 20;
    return readRunStyle(result);
  }
  function paragraphProperties(node?: Element): ParagraphStyle {
    if (!node) return {};
    const result: ParagraphStyle = {}, alignment = attr(child(node, "jc"));
    const align = ({ both: "justify", distribute: "justify", start: "left", end: "right" } as Record<string, string>)[alignment] ?? alignment;
    if (["left", "center", "right", "justify"].includes(align)) result.align = align as ParagraphStyle["align"];
    const spacing = child(node, "spacing"), indent = child(node, "ind");
    for (const key of ["before", "after"] as const) { const value = numeric(spacing, key); if (value !== undefined) result[key] = value / 20; }
    for (const key of ["left", "right", "firstLine"] as const) { const value = numeric(indent, key); if (value !== undefined) result[key] = value / 20; }
    const hanging = numeric(indent, "hanging"); if (hanging !== undefined) result.firstLine = -hanging / 20;
    const line = numeric(spacing, "line");
    if (line !== undefined) { if (["exact", "atLeast"].includes(attr(spacing, "lineRule"))) result.linePoints = line / 20; else result.lineHeight = line / 240; }
    const heading = numeric(child(node, "outlineLvl")); if (heading !== undefined && heading < 6) result.heading = heading + 1;
    const pageBreak = toggle(child(node, "pageBreakBefore")); if (pageBreak !== undefined) result.pageBreak = pageBreak;
    return readParagraphStyle(result);
  }
  function numbering(node?: Element): Properties["numbering"] {
    const properties = child(node, "numPr"), id = attr(child(properties, "numId"));
    return id ? { id, level: numeric(child(properties, "ilvl")) ?? 0 } : undefined;
  }
  const stylesRoot = parts["word/styles.xml"] ? xml(parts["word/styles.xml"]!) : undefined;
  const defaults = child(stylesRoot, "docDefaults");
  const defaultsRun = runProperties(child(child(defaults, "rPrDefault"), "rPr"));
  const defaultsParagraph = paragraphProperties(child(child(defaults, "pPrDefault"), "pPr"));
  const styles = new Map(stylesRoot ? descendants(stylesRoot, "style").map(node => [attr(node, "styleId"), node]) : []);
  const cache = new Map<string, Properties>();
  function style(id: string, seen = new Set<string>()): Properties {
    const cached = cache.get(id); if (cached) return cached;
    const node = styles.get(id);
    if (!node) return { run: {}, paragraph: {} };
    if (seen.has(id) || seen.size > 30) throw new Error("The Word document contains circular or excessive style inheritance.");
    seen.add(id);
    const base = style(attr(child(node, "basedOn")), seen), p = child(node, "pPr");
    const result: Properties = { run: { ...base.run, ...runProperties(child(node, "rPr")) }, paragraph: { ...base.paragraph, ...paragraphProperties(p) }, numbering: numbering(p) ?? base.numbering };
    cache.set(id, result); return result;
  }
  const defaultStyle = [...styles.values()].find(node => attr(node, "type") === "paragraph" && attr(node, "default") === "1");
  const defaultParagraphStyle = style(defaultStyle ? attr(defaultStyle, "styleId") : "Normal");
  const numberingRoot = parts["word/numbering.xml"] ? xml(parts["word/numbering.xml"]!) : undefined;
  const numbers = new Map(numberingRoot ? descendants(numberingRoot, "num").map(node => [attr(node, "numId"), node]) : []);
  const abstracts = new Map(numberingRoot ? descendants(numberingRoot, "abstractNum").map(node => [attr(node, "abstractNumId"), node]) : []);
  const counters = new Map<string, number[]>();
  function list(info?: Properties["numbering"]): { marker?: string; paragraph: ParagraphStyle } {
    if (!info || info.id === "0") return { paragraph: {} };
    const num = numbers.get(info.id), abstract = abstracts.get(attr(child(num, "abstractNumId")));
    const level = abstract && children(abstract).find(node => node.localName === "lvl" && numeric(node, "ilvl") === info.level);
    if (!level) return { marker: "•", paragraph: {} };
    const values = counters.get(info.id) ?? [], override = num && children(num).find(node => node.localName === "lvlOverride" && numeric(node, "ilvl") === info.level);
    const first = numeric(child(override, "startOverride")) ?? numeric(child(level, "start")) ?? 1;
    values[info.level] = values[info.level] === undefined ? first : values[info.level]! + 1;
    values.length = info.level + 1; counters.set(info.id, values);
    const format = attr(child(level, "numFmt"));
    const display = (value: number, format: string) => {
      if (["lowerLetter", "upperLetter"].includes(format) && value > 0) {
        let text = "";
        for (let number = value; number > 0; number = Math.floor((number - 1) / 26)) text = String.fromCharCode(65 + (number - 1) % 26) + text;
        return format === "lowerLetter" ? text.toLowerCase() : text;
      }
      if (["lowerRoman", "upperRoman"].includes(format) && value > 0 && value < 4000) {
        let text = "", number = value;
        for (const [amount, symbol] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]] as const) while (number >= amount) { text += symbol; number -= amount; }
        return format === "lowerRoman" ? text.toLowerCase() : text;
      }
      return format === "decimalZero" ? String(value).padStart(2, "0") : String(value);
    };
    const marker = format === "bullet" ? (attr(child(level, "lvlText")) || "•").replace(/\uF0B7/g, "•").replace(/\uF0A7/g, "▪")
      : (attr(child(level, "lvlText")) || `%${info.level + 1}.`).replace(/%(\d)/g, (_, n: string) => {
        const index = Number(n) - 1, ancestor = abstract && children(abstract).find(node => node.localName === "lvl" && numeric(node, "ilvl") === index);
        return display(values[index] ?? 1, attr(child(ancestor, "numFmt")) || format);
      });
    return { marker, paragraph: paragraphProperties(child(level, "pPr")) };
  }
  let text = "", tableIndex = 0;
  const runs: FormatRun[] = [], paragraphs: FormatParagraph[] = [];
  function paragraph(node: Element, tableCell?: TableCell) {
    if (paragraphs.length) text += "\n\n";
    const pPr = child(node, "pPr"), named = style(attr(child(pPr, "pStyle"))), num = list(numbering(pPr) ?? named.numbering ?? defaultParagraphStyle.numbering);
    const paragraphStyle = { ...defaultsParagraph, ...defaultParagraphStyle.paragraph, ...named.paragraph, ...num.paragraph, ...paragraphProperties(pPr) };
    const baseRun = { ...defaultsRun, ...defaultParagraphStyle.run, ...named.run };
    const start = text.length;
    function read(node: Element, inherited: RunStyle) {
      if (node.namespaceURI !== document.namespaceURI || ["del", "instrText", "drawing", "pict", "object", "pPr", "rPr"].includes(node.localName)) return;
      let current = inherited;
      if (node.localName === "r") {
        const properties = child(node, "rPr"), named = style(attr(child(properties, "rStyle")));
        current = { ...inherited, ...named.run, ...runProperties(properties) };
      }
      const value = node.localName === "t" ? node.textContent ?? "" : node.localName === "tab" ? "\t" : ["br", "cr"].includes(node.localName) ? "\n" : null;
      if (value !== null) {
        const start = text.length; text += value;
        if (value) runs.push({ start, end: text.length, style: current });
      } else for (const nested of children(node)) read(nested, current);
    }
    read(node, baseRun);
    paragraphs.push({ start, end: text.length, style: paragraphStyle, ...(num.marker ? { marker: num.marker } : {}), ...(tableCell ? { cell: tableCell } : {}) });
    if (text.length > DOCUMENT_LIMIT) throw new Error("The Word article is longer than 100,000 characters. Import a shorter section.");
  }
  function table(node: Element) {
    const id = tableIndex++, merged = new Map<number, TableCell>();
    children(node).filter(node => node.localName === "tr").forEach((row, rowIndex) => {
      let column = 0;
      for (const node of children(row).filter(node => node.localName === "tc")) {
        if (descendants(node, "tbl").length) throw new Error("Nested Word tables are not supported. Simplify the table before importing.");
        const properties = child(node, "tcPr"), span = numeric(child(properties, "gridSpan")) ?? 1;
        const merge = child(properties, "vMerge"), previous = merged.get(column);
        let data: TableCell;
        if (merge && attr(merge) !== "restart" && previous) { data = previous; data.rowSpan++; }
        else {
          data = { table: id, row: rowIndex, column, colSpan: span, rowSpan: 1 };
          const width = child(properties, "tcW"); if (attr(width, "type") === "dxa" && numeric(width, "w")) data.width = numeric(width, "w")! / 20;
          const fill = attr(child(properties, "shd"), "fill"); if (/^[\da-f]{6}$/i.test(fill)) data.fill = `#${fill}`;
          const vertical = attr(child(properties, "vAlign")); if (["top", "center", "bottom"].includes(vertical)) data.vertical = vertical as TableCell["vertical"];
          if (merge) merged.set(column, data); else merged.delete(column);
        }
        for (const p of children(node).filter(node => node.localName === "p")) {
          // Empty continuation cells do not introduce a second visual cell or paragraph.
          if (merge && attr(merge) !== "restart" && previous && !descendants(p, "t").some(el => el.textContent)) continue;
          paragraph(p, data);
        }
        column += span;
      }
    });
  }
  for (const node of children(body)) {
    if (node.localName === "p") paragraph(node);
    else if (node.localName === "tbl") table(node);
    else if (node.localName === "sdt") for (const nested of descendants(node, "p")) paragraph(nested);
  }
  if (!text.trim()) throw new Error("This document contains no readable text. Scanned images are not supported.");
  const expanded = paragraphs.flatMap(p => {
    const ranges = paragraphRanges(text.slice(p.start, p.end));
    return ranges.map((range, index) => ({ ...p, start: p.start + range.start, end: p.start + range.end,
      ...(index ? { marker: undefined } : {}),
      style: { ...p.style, ...(index ? { before: 0, firstLine: 0, pageBreak: false } : {}), ...(index < ranges.length - 1 ? { after: 0 } : {}) },
    }));
  });
  const formatting = validateFormatting({ version: 1, runs, paragraphs: expanded }, text)!;
  return { text, formatting, hasUnsupportedObjects: ["drawing", "pict", "object", "altChunk", "headerReference", "footerReference"].some(name => descendants(body, name).length > 0) };
}
