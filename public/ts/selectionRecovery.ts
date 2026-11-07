import type { DefinitionEdit } from "./definitionViews";
export type TextRange = { start: number; end: number };

/** Retain word identity by global offsets even when successful notes shift later words. */
export function remapSelection(ranges: TextRange[], edits: DefinitionEdit[]): TextRange[] {
  const shift = (position: number) => edits.reduce((sum, edit) =>
    sum + (edit.offset + (edit.deleteCount ?? 0) <= position ? edit.value.length - (edit.deleteCount ?? 0) : 0), 0);
  return ranges.map(range => ({ start: range.start + shift(range.start), end: range.end + shift(range.end) }));
}
