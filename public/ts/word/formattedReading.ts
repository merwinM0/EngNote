import { t } from "../ui/i18n";
import { cellKey, formattingSegments, type DocumentFormatting, type FormatParagraph, type ParagraphStyle, type RunStyle } from "./documentFormatting";

export function applyRunStyle(node: HTMLElement, style: RunStyle) {
  if (style.font || style.eastAsiaFont) node.style.fontFamily = [...new Set([style.font, style.eastAsiaFont].filter((font): font is string => !!font))].map(font => JSON.stringify(font)).join(", ") + ", serif";
  if (style.size !== undefined) node.style.fontSize = `calc(${style.size}pt * var(--reading-font-scale, 1))`;
  if (style.bold !== undefined) node.style.fontWeight = style.bold ? "700" : "400";
  if (style.italic !== undefined) node.style.fontStyle = style.italic ? "italic" : "normal";
  if (style.underline !== undefined || style.strike !== undefined) node.style.textDecoration = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
  if (style.color) node.style.color = style.color;
  if (style.highlight) node.style.backgroundColor = style.highlight === "none" ? "transparent" : style.highlight;
  if (style.spacing !== undefined) node.style.letterSpacing = `${style.spacing}pt`;
  if (style.vertical && style.vertical !== "baseline") { node.style.verticalAlign = style.vertical === "superscript" ? "super" : "sub"; node.style.fontSize = style.size ? `calc(${style.size * .75}pt * var(--reading-font-scale, 1))` : ".75em"; }
}
export function applyParagraphStyle(node: HTMLElement, style: ParagraphStyle) {
  node.style.textAlign = style.align ?? "left";
  node.style.marginTop = `${style.before ?? 0}pt`; node.style.marginBottom = `${style.after ?? 0}pt`;
  node.style.paddingLeft = `${style.left ?? 0}pt`; node.style.paddingRight = `${style.right ?? 0}pt`;
  node.style.setProperty("--word-left", `${style.left ?? 0}pt`); node.style.setProperty("--word-right", `${style.right ?? 0}pt`);
  node.style.setProperty("--word-indent", `${style.firstLine ?? 0}pt`);
  node.style.textIndent = `${style.firstLine ?? 0}pt`;
  node.style.lineHeight = style.linePoints ? `calc(${style.linePoints}pt * var(--reading-font-scale, 1))` : String(style.lineHeight ?? 1.2);
  if (style.heading) { node.setAttribute("role", "heading"); node.setAttribute("aria-level", String(style.heading)); }
  if (style.pageBreak) node.classList.add("word-page-break");
}
export function appendStyledText(parent: HTMLElement, text: string, start: number, format: DocumentFormatting | null) {
  if (!text) return;
  if (!format) { parent.append(document.createTextNode(text)); return; }
  for (const part of formattingSegments(format, start, start + text.length)) {
    const span = document.createElement("span");
    span.className = "word-run"; span.textContent = text.slice(part.start - start, part.end - start);
    applyRunStyle(span, part.style); parent.append(span);
  }
}
/** Tables are ordinary semantic DOM, not imported HTML; re-created independently per page. */
export function paragraphAppender(root: DocumentFragment) {
  const tables = new Map<number, { body: HTMLTableSectionElement; rows: Map<number, HTMLTableRowElement>; cells: Map<string, HTMLTableCellElement> }>();
  return (node: HTMLElement, paragraph?: FormatParagraph) => {
    if (paragraph) {
      applyParagraphStyle(node, paragraph.style);
      if (paragraph.marker) {
        const marker = document.createElement("span"); marker.className = "word-list-marker";
        marker.textContent = paragraph.marker + " "; node.prepend(marker);
      }
      if (!node.hasChildNodes()) node.append(document.createElement("br"));
    }
    const cell = paragraph?.cell;
    if (!cell) { root.append(node); return; }
    let table = tables.get(cell.table);
    if (!table) {
      const wrap = document.createElement("div"); wrap.className = "word-table-scroll";
      wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", t("reader.wordTable")); wrap.dataset.i18nAriaLabel = "reader.wordTable";
      const element = document.createElement("table"); element.className = "word-table";
      const body = document.createElement("tbody"); element.append(body); wrap.append(element); root.append(wrap);
      table = { body, rows: new Map(), cells: new Map() }; tables.set(cell.table, table);
    }
    for (let index = 0; index < cell.row + cell.rowSpan; index++) if (!table.rows.has(index)) {
      const row = document.createElement("tr"); table.rows.set(index, row); table.body.append(row);
    }
    const key = cellKey(cell);
    let element = table.cells.get(key);
    if (!element) {
      element = document.createElement("td"); element.colSpan = cell.colSpan; element.rowSpan = cell.rowSpan;
      if (cell.width) element.style.width = `${cell.width}pt`;
      if (cell.fill) element.style.backgroundColor = cell.fill;
      if (cell.vertical) element.style.verticalAlign = cell.vertical === "center" ? "middle" : cell.vertical;
      table.rows.get(cell.row)!.append(element); table.cells.set(key, element);
    }
    element.append(node);
  };
}
