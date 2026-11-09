/** Safe, runtime-neutral Word formatting. Ranges always address canonical UTF-16 text. */
export type RunStyle = {
  font?: string; eastAsiaFont?: string; size?: number; bold?: boolean; italic?: boolean;
  underline?: boolean; strike?: boolean; color?: string; highlight?: string;
  vertical?: "baseline" | "superscript" | "subscript"; spacing?: number;
};
export type ParagraphStyle = {
  align?: "left" | "center" | "right" | "justify";
  before?: number; after?: number; left?: number; right?: number; firstLine?: number;
  lineHeight?: number; linePoints?: number; heading?: number; pageBreak?: boolean;
};
export type TableCell = { table: number; row: number; column: number; colSpan: number; rowSpan: number; width?: number; fill?: string; vertical?: "top" | "center" | "bottom" };
export type FormatRun = { start: number; end: number; style: RunStyle };
export type FormatParagraph = { start: number; end: number; style: ParagraphStyle; marker?: string; cell?: TableCell };
export type DocumentFormatting = { version: 1; runs: FormatRun[]; paragraphs: FormatParagraph[] };
export type TextEdit = { start: number; end: number; value: string };
export const MAX_FORMATTING_UNITS = 256_000;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Word formatting.");
  return value as Record<string, unknown>;
};
const number = (value: unknown, min: number, max: number, integer = false): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error("Invalid Word formatting number.");
  return value;
};
const color = (value: unknown): string => {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new Error("Invalid Word formatting color.");
  return value.toUpperCase();
};
export function safeFont(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100 || !/^[\p{L}\p{N} ._\-]+$/u.test(value)) throw new Error("Unsupported Word font name.");
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error("Invalid Word formatting choice.");
  return value as T;
}
export function readRunStyle(value: unknown): RunStyle {
  const raw = object(value), style: RunStyle = {};
  for (const key of ["font", "eastAsiaFont"] as const) if (raw[key] !== undefined) style[key] = safeFont(raw[key]);
  for (const key of ["bold", "italic", "underline", "strike"] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== "boolean") throw new Error("Invalid Word font effect."); style[key] = raw[key];
  }
  if (raw.color !== undefined) style.color = color(raw.color);
  if (raw.highlight !== undefined) style.highlight = raw.highlight === "none" ? "none" : color(raw.highlight);
  if (raw.size !== undefined) style.size = number(raw.size, .5, 200);
  if (raw.spacing !== undefined) style.spacing = number(raw.spacing, -20, 100);
  if (raw.vertical !== undefined) style.vertical = choice(raw.vertical, ["baseline", "superscript", "subscript"] as const);
  return style;
}
export function readParagraphStyle(value: unknown): ParagraphStyle {
  const raw = object(value), style: ParagraphStyle = {};
  if (raw.align !== undefined) style.align = choice(raw.align, ["left", "center", "right", "justify"] as const);
  for (const key of ["before", "after", "left", "right", "firstLine"] as const) if (raw[key] !== undefined) style[key] = number(raw[key], key === "firstLine" ? -720 : 0, 720);
  if (raw.lineHeight !== undefined) style.lineHeight = number(raw.lineHeight, .2, 10);
  if (raw.linePoints !== undefined) style.linePoints = number(raw.linePoints, .5, 200);
  if (raw.heading !== undefined) style.heading = number(raw.heading, 1, 6, true);
  if (raw.pageBreak !== undefined) { if (typeof raw.pageBreak !== "boolean") throw new Error("Invalid paragraph break."); style.pageBreak = raw.pageBreak; }
  return style;
}
export function paragraphRanges(text: string): Array<{ start: number; end: number }> {
  let start = 0;
  return text.split("\n\n").map(value => { const range = { start, end: start + value.length }; start += value.length + 2; return range; });
}
function cell(value: unknown): TableCell {
  const raw = object(value);
  const result: TableCell = { table: number(raw.table, 0, 3000, true), row: number(raw.row, 0, 3000, true), column: number(raw.column, 0, 200, true), colSpan: number(raw.colSpan, 1, 200, true), rowSpan: number(raw.rowSpan, 1, 3000, true) };
  if (raw.width !== undefined) result.width = number(raw.width, .5, 2000);
  if (raw.fill !== undefined) result.fill = color(raw.fill);
  if (raw.vertical !== undefined) result.vertical = choice(raw.vertical, ["top", "center", "bottom"] as const);
  return result;
}
const boundary = (text: string, at: number) => !(at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]!) && /[\uDC00-\uDFFF]/.test(text[at]!));
export function validateFormatting(value: unknown, text: string): DocumentFormatting | null {
  if (value === undefined || value === null) return null;
  if (JSON.stringify(value).length > MAX_FORMATTING_UNITS) throw new Error("Word formatting exceeds the 256,000-character metadata limit.");
  const raw = object(value);
  if (raw.version !== 1 || !Array.isArray(raw.runs) || !Array.isArray(raw.paragraphs) || raw.runs.length > 6000 || raw.paragraphs.length > 3000) throw new Error("Invalid or excessive Word formatting.");
  let previous = 0;
  const runs = raw.runs.map(value => {
    const run = object(value), start = number(run.start, previous, text.length, true), end = number(run.end, start + 1, text.length, true);
    if (!boundary(text, start) || !boundary(text, end)) throw new Error("Word formatting splits a Unicode character.");
    previous = end; return { start, end, style: readRunStyle(run.style) };
  });
  const ranges = paragraphRanges(text);
  if (ranges.length !== raw.paragraphs.length) throw new Error("Word paragraph formatting does not match the article.");
  const paragraphs = raw.paragraphs.map((value, index) => {
    const p = object(value), range = ranges[index]!;
    if (p.start !== range.start || p.end !== range.end) throw new Error("Word paragraph formatting does not match the article.");
    const result: FormatParagraph = { ...range, style: readParagraphStyle(p.style) };
    if (p.marker !== undefined) {
      if (typeof p.marker !== "string" || p.marker.length > 64 || /[\p{Cc}\p{Cf}]/u.test(p.marker)) throw new Error("Invalid Word list marker.");
      result.marker = p.marker;
    }
    if (p.cell !== undefined) result.cell = cell(p.cell);
    return result;
  });
  const tables = new Map<number, TableCell[]>(), closedTables = new Set<number>();
  let activeTable: number | undefined, lastCell = "", spans = 0;
  const seenCells = new Map<string, TableCell>();
  for (const p of paragraphs) {
    const c = p.cell;
    if (activeTable !== c?.table) {
      if (activeTable !== undefined) closedTables.add(activeTable);
      if (c && closedTables.has(c.table)) throw new Error("Word tables must occupy consecutive paragraphs.");
      activeTable = c?.table; lastCell = "";
    }
    if (!c) continue;
    const key = cellKey(c), previous = seenCells.get(key);
    if (previous) {
      if (lastCell !== key || JSON.stringify(previous) !== JSON.stringify(c)) throw new Error("Inconsistent Word table cell formatting.");
    } else {
      const cells = tables.get(c.table) ?? [], last = cells.at(-1);
      if (last && (c.row < last.row || c.row === last.row && c.column <= last.column)) throw new Error("Word table cells are out of order.");
      if (cells.some(other => c.row < other.row + other.rowSpan && other.row < c.row + c.rowSpan && c.column < other.column + other.colSpan && other.column < c.column + c.colSpan)) throw new Error("Overlapping Word table cells.");
      spans += c.rowSpan;
      if (spans > 6000) throw new Error("Word table layout exceeds its rendering budget.");
      cells.push(c); tables.set(c.table, cells); seenCells.set(key, c);
    }
    lastCell = key;
  }
  if ([...tables.values()].reduce((sum, cells) => sum + Math.max(...cells.map(c => c.row + c.rowSpan)), 0) > 6000) throw new Error("Word table layout exceeds its rendering budget.");
  return { version: 1, runs, paragraphs };
}
export function readFormatting(value: unknown, text: string): DocumentFormatting | null {
  try { return validateFormatting(value, text); } catch { return null; }
}
export const cellKey = (cell?: TableCell) => cell ? `${cell.table}:${cell.row}:${cell.column}` : "";
function firstRunAfter(runs: FormatRun[], offset: number): number {
  let low = 0, high = runs.length;
  while (low < high) { const middle = (low + high) >>> 1; if (runs[middle]!.end <= offset) low = middle + 1; else high = middle; }
  return low;
}
export function styleAt(format: DocumentFormatting, offset: number): RunStyle {
  const run = format.runs[firstRunAfter(format.runs, offset)];
  return run && run.start <= offset ? run.style : {};
}
function coalesce(runs: FormatRun[]): FormatRun[] {
  const result: FormatRun[] = [];
  for (const run of runs.sort((a, b) => a.start - b.start)) {
    if (run.end <= run.start) continue;
    const last = result.at(-1);
    if (last?.end === run.start && JSON.stringify(last.style) === JSON.stringify(run.style)) last.end = run.end;
    else result.push({ ...run });
  }
  return result;
}
/** Apply one edit without teaching text or annotation code about CSS/Word XML. */
export function editFormatting(format: DocumentFormatting | null, before: string, edit: TextEdit): DocumentFormatting | null {
  if (!format) return null;
  const { start, end, value } = edit, delta = value.length - (end - start);
  const after = before.slice(0, start) + value + before.slice(end);
  const runs: FormatRun[] = [];
  for (const run of format.runs) {
    if (run.start < start) runs.push({ start: run.start, end: Math.min(run.end, start), style: run.style });
    if (run.end > end) runs.push({ start: Math.max(run.start, end) + delta, end: run.end + delta, style: run.style });
  }
  if (value) runs.push({ start, end: start + value.length, style: styleAt(format, Math.min(start, Math.max(0, before.length - 1))) });
  const oldAt = (at: number) => at < start ? at : at >= start + value.length ? at - delta : start;
  const newAt = (at: number) => at < start ? at : at >= end ? at + delta : null;
  const anchors = format.paragraphs.flatMap(p => { const position = newAt(p.start); return position === null ? [] : [{ position, key: cellKey(p.cell) }]; });
  let anchorIndex = 0;
  const markedParagraphs = new Set<FormatParagraph>();
  const paragraphs = paragraphRanges(after).map(range => {
    const anchor = oldAt(range.start);
    let low = 0, high = format.paragraphs.length;
    while (low < high) { const middle = (low + high) >>> 1; if (format.paragraphs[middle]!.start <= anchor) low = middle + 1; else high = middle; }
    const old = format.paragraphs[Math.max(0, low - 1)]!;
    const keys = new Set([cellKey(old.cell)]);
    while (anchorIndex < anchors.length && anchors[anchorIndex]!.position <= range.start) anchorIndex++;
    for (let index = anchorIndex; index < anchors.length && anchors[index]!.position < range.end; index++) keys.add(anchors[index]!.key);
    if (keys.size > 1 && [...keys].some(Boolean)) throw new Error("Paragraph tidying cannot merge different table cells. The original article was kept.");
    const marker = markedParagraphs.has(old) ? undefined : old.marker;
    markedParagraphs.add(old);
    return { ...old, ...range, marker, style: { ...old.style } };
  });
  return validateFormatting({ version: 1, runs: coalesce(runs), paragraphs }, after);
}
export function rebaseFormatting(format: DocumentFormatting | null, before: string, after: string): DocumentFormatting | null {
  if (!format || before === after) return format;
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (prefix > 0 && (!boundary(before, prefix) || !boundary(after, prefix))) prefix--;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  while (suffix > 0 && (!boundary(before, before.length - suffix) || !boundary(after, after.length - suffix))) suffix--;
  return editFormatting(format, before, { start: prefix, end: before.length - suffix, value: after.slice(prefix, after.length - suffix) });
}
export function formattedPageParagraphs(format: DocumentFormatting, text: string, start: number, end: number) {
  return format.paragraphs.filter(p => p.start === p.end
    ? p.start >= start && (p.start < end || p.start === end && end === text.length)
    : p.end > start && p.start < end).map(p => {
    const from = Math.max(start, p.start), to = Math.min(end, p.end);
    return { start: from, text: text.slice(from, to), format: {
      ...p, marker: from === p.start ? p.marker : undefined,
      style: { ...p.style, ...(from > p.start ? { before: 0, firstLine: 0, pageBreak: false } : {}), ...(to < p.end ? { after: 0 } : {}) },
    } };
  });
}
export function formattingSegments(format: DocumentFormatting, start: number, end: number): Array<FormatRun> {
  const parts: FormatRun[] = [];
  let cursor = start;
  for (let index = firstRunAfter(format.runs, start); index < format.runs.length; index++) {
    const run = format.runs[index]!;
    if (run.start >= end) break;
    if (cursor < run.start) parts.push({ start: cursor, end: run.start, style: {} });
    const stop = Math.min(run.end, end);
    parts.push({ start: Math.max(cursor, run.start), end: stop, style: run.style }); cursor = stop;
  }
  if (cursor < end) parts.push({ start: cursor, end, style: {} });
  return parts;
}
