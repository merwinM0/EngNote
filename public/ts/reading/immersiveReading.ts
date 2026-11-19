import type { TextRange } from "../definitions/selectionRecovery";

type RangeEdit = TextRange & { length: number };

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const merged: TextRange[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function moveRange(range: TextRange, edit: RangeEdit): TextRange | null {
  const shift = edit.length - (edit.end - edit.start);
  if (range.end <= edit.start) return range;
  if (range.start >= edit.end) return { start: range.start + shift, end: range.end + shift };
  // Keep unedited portions; replacements wholly inside a region remain inside it.
  if (range.start < edit.start && range.end > edit.end) return { start: range.start, end: range.end + shift };
  if (range.start < edit.start) return { start: range.start, end: edit.start };
  if (range.end > edit.end) return { start: edit.start + edit.length, end: range.end + shift };
  return null;
}

/** Temporary regions in canonical UTF-16 offsets. Never saved in text, history or drafts. */
export class ImmersiveReading {
  private ranges: TextRange[] = [];
  private visible = new Map<number, TextRange>();
  selecting = false;
  full = false;
  first: TextRange | null = null;
  get active() { return this.full || this.ranges.length > 0; }

  intersects({ start, end }: TextRange): boolean {
    if (end <= start) return false;
    if (this.full) return true;
    // End offsets are sorted too, since normalized regions never overlap.
    let low = 0, high = this.ranges.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.ranges[mid]!.end <= start) low = mid + 1; else high = mid;
    }
    return (this.ranges[low]?.start ?? Infinity) < end;
  }

  press() {
    if (this.full) { this.reset(); return "exited"; }
    if (!this.selecting) { this.selecting = true; return "select"; }
    if (this.first) { this.cancel(); return "canceled"; }
    this.reset(); this.full = true;
    return "full";
  }
  cancel() { this.selecting = false; this.first = null; }
  choose(word: TextRange): "start" | "entered" | "exited" | null {
    if (!this.selecting) return null;
    if (!this.first) { this.first = { start: word.start, end: word.end }; return "start"; }
    const range = { start: Math.min(this.first.start, word.start), end: Math.max(this.first.end, word.end) };
    this.cancel();
    const covered = this.ranges.some(item => item.start <= range.start && item.end >= range.end);
    this.ranges = covered ? this.ranges.flatMap(item => {
      if (item.end <= range.start || item.start >= range.end) return [item];
      return [
        ...(item.start < range.start ? [{ start: item.start, end: range.start }] : []),
        ...(item.end > range.end ? [{ start: range.end, end: item.end }] : []),
      ];
    }) : mergeRanges([...this.ranges, range]);
    for (const [id, source] of this.visible) if (!this.intersects(source)) this.visible.delete(id);
    return covered ? "exited" : "entered";
  }

  concealed(id: number, source: TextRange) { return this.intersects(source) && !this.visible.has(id); }
  toggle(id: number, source: TextRange) {
    if (this.intersects(source) && !this.visible.delete(id)) this.visible.set(id, source);
  }

  edit(edit: RangeEdit) {
    this.cancel();
    this.ranges = mergeRanges(this.ranges.flatMap(range => moveRange(range, edit) ?? []));
    for (const [id, source] of this.visible) {
      const next = moveRange(source, edit);
      if (next && this.intersects(next)) this.visible.set(id, next); else this.visible.delete(id);
    }
  }

  rebase(before: string, after: string) {
    if (before === after) return;
    let start = 0, end = before.length, nextEnd = after.length;
    while (start < end && start < nextEnd && before[start] === after[start]) start++;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    this.edit({ start, end, length: nextEnd - start });
  }

  reset() { this.cancel(); this.full = false; this.ranges = []; this.visible.clear(); }
}
