import type { DefinitionView } from "../definitions/definitionViews";
import type { DocumentFormatting } from "../word/documentFormatting";
export type ReadingSnapshot = { text: string; definitions: DefinitionView[]; offset: number; formatting?: DocumentFormatting | null };
const same = (a: ReadingSnapshot, b: ReadingSnapshot) => a.text === b.text && JSON.stringify(a.definitions) === JSON.stringify(b.definitions) && JSON.stringify(a.formatting ?? null) === JSON.stringify(b.formatting ?? null);
/** Tab-memory only: never captures keys, credentials or saved-entry identity. */
export class ReadingHistory {
  private past: ReadingSnapshot[] = [];
  private future: ReadingSnapshot[] = [];
  private lastEdit = -Infinity;
  constructor(private limit = 50, private budget = 8_000_000, private now = Date.now) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  reset() { this.past = []; this.future = []; this.breakGroup(); }
  breakGroup() { this.lastEdit = -Infinity; }
  record(before: ReadingSnapshot, after: ReadingSnapshot, typing = false) {
    if (same(before, after)) return;
    if (!typing || this.now() - this.lastEdit > 800 || !this.past.length) this.past.push(structuredClone(before));
    this.lastEdit = typing ? this.now() : -Infinity;
    this.future = [];
    this.trim();
  }
  undo(current: ReadingSnapshot) {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(structuredClone(current)); this.breakGroup(); this.trim(); return previous;
  }
  redo(current: ReadingSnapshot) {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(structuredClone(current)); this.breakGroup(); this.trim(); return next;
  }
  private trim() {
    const size = (entry: ReadingSnapshot) => entry.text.length * 2 + JSON.stringify(entry.definitions).length * 2 + JSON.stringify(entry.formatting ?? null).length * 2;
    while (this.past.length + this.future.length > this.limit || [...this.past, ...this.future].reduce((sum, entry) => sum + size(entry), 0) > this.budget) {
      if (this.past.length) this.past.shift(); else if (this.future.length) this.future.shift(); else break;
    }
  }
}
