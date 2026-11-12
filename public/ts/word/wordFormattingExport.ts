import { cellKey, formattingSegments, styleAt, type DocumentFormatting, type FormatParagraph, type ParagraphStyle, type RunStyle, type TableCell } from "./documentFormatting";

export function xmlText(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function properties(style: RunStyle): string {
  let xml = "";
  if (style.font || style.eastAsiaFont) xml += `<w:rFonts${style.font ? ` w:ascii="${xmlText(style.font)}" w:hAnsi="${xmlText(style.font)}"` : ""}${style.eastAsiaFont ? ` w:eastAsia="${xmlText(style.eastAsiaFont)}"` : ""}/>`;
  if (style.size) xml += `<w:sz w:val="${Math.round(style.size * 2)}"/>`;
  for (const [key, tag] of [["bold", "b"], ["italic", "i"], ["strike", "strike"]] as const) if (style[key] !== undefined) xml += `<w:${tag} w:val="${style[key] ? 1 : 0}"/>`;
  if (style.underline !== undefined) xml += `<w:u w:val="${style.underline ? "single" : "none"}"/>`;
  if (style.color) xml += `<w:color w:val="${style.color.slice(1)}"/>`;
  if (style.highlight === "none") xml += '<w:highlight w:val="none"/>';
  else if (style.highlight) xml += `<w:shd w:fill="${style.highlight.slice(1)}"/>`;
  if (style.spacing !== undefined) xml += `<w:spacing w:val="${Math.round(style.spacing * 20)}"/>`;
  if (style.vertical) xml += `<w:vertAlign w:val="${style.vertical}"/>`;
  return xml ? `<w:rPr>${xml}</w:rPr>` : "";
}
function run(text: string, style: RunStyle): string {
  return `<w:r>${properties(style)}${text.split(/(\n|\t)/).map(part => part === "\n" ? "<w:br/>" : part === "\t" ? "<w:tab/>" : `<w:t xml:space="preserve">${xmlText(part)}</w:t>`).join("")}</w:r>`;
}
function pProperties(style: ParagraphStyle): string {
  let xml = `<w:spacing w:before="${Math.round((style.before ?? 0) * 20)}" w:after="${Math.round((style.after ?? 0) * 20)}" w:line="${Math.round(style.linePoints ? style.linePoints * 20 : (style.lineHeight ?? 1.2) * 240)}" w:lineRule="${style.linePoints ? "exact" : "auto"}"/>`;
  if (style.align) xml += `<w:jc w:val="${style.align === "justify" ? "both" : style.align}"/>`;
  xml += `<w:ind w:left="${Math.round((style.left ?? 0) * 20)}" w:right="${Math.round((style.right ?? 0) * 20)}"${(style.firstLine ?? 0) < 0 ? ` w:hanging="${Math.round(-style.firstLine! * 20)}"` : ` w:firstLine="${Math.round((style.firstLine ?? 0) * 20)}"`}/>`;
  if (style.heading) xml += `<w:outlineLvl w:val="${style.heading - 1}"/>`;
  if (style.pageBreak) xml += "<w:pageBreakBefore/>";
  return `<w:pPr>${xml}</w:pPr>`;
}
export function formattedWordBody(text: string, format: DocumentFormatting, visibleNote: (start: number, original: string) => string): string {
  function plain(start: number, end: number): string {
    return formattingSegments(format, start, end).map(part => run(text.slice(part.start, part.end), part.style)).join("");
  }
  function paragraph(p: FormatParagraph): string {
    let contents = p.marker ? run(p.marker + " ", styleAt(format, p.start)) : "", cursor = p.start;
    for (const match of text.slice(p.start, p.end).matchAll(/『[^』]*』/g)) {
      const start = p.start + match.index;
      contents += plain(cursor, start) + run(visibleNote(start, match[0]), styleAt(format, start));
      cursor = start + match[0].length;
    }
    contents += plain(cursor, p.end);
    return `<w:p>${pProperties(p.style)}${contents}</w:p>`;
  }
  let xml = "";
  for (let index = 0; index < format.paragraphs.length;) {
    const p = format.paragraphs[index]!;
    if (!p.cell) { xml += paragraph(p); index++; continue; }
    const id = p.cell.table, cells = new Map<string, { cell: TableCell; paragraphs: FormatParagraph[] }>();
    while (index < format.paragraphs.length && format.paragraphs[index]!.cell?.table === id) {
      const p = format.paragraphs[index++]!, key = cellKey(p.cell);
      const item = cells.get(key) ?? { cell: p.cell!, paragraphs: [] };
      item.paragraphs.push(p); cells.set(key, item);
    }
    xml += '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map(side => `<w:${side} w:val="single" w:sz="4" w:color="808080"/>`).join("") + "</w:tblBorders></w:tblPr>";
    const items = [...cells.values()], rows = Math.max(...items.map(item => item.cell.row + item.cell.rowSpan));
    for (let row = 0; row < rows; row++) {
      xml += "<w:tr>";
      for (const item of items.filter(item => item.cell.row <= row && row < item.cell.row + item.cell.rowSpan).sort((a, b) => a.cell.column - b.cell.column)) {
        const c = item.cell, continuation = row !== c.row;
        xml += `<w:tc><w:tcPr>${c.width ? `<w:tcW w:w="${Math.round(c.width * 20)}" w:type="dxa"/>` : ""}${c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : ""}${c.rowSpan > 1 ? `<w:vMerge${continuation ? "" : ' w:val="restart"'}/>` : ""}${c.fill ? `<w:shd w:fill="${c.fill.slice(1)}"/>` : ""}${c.vertical ? `<w:vAlign w:val="${c.vertical}"/>` : ""}</w:tcPr>${continuation ? "<w:p/>" : item.paragraphs.map(paragraph).join("")}</w:tc>`;
      }
      xml += "</w:tr>";
    }
    xml += "</w:tbl>";
  }
  return xml;
}
