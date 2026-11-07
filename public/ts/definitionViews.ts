import { validBritishIPA } from "./pronunciation";
import { isDefinitionMode, type DefinitionMode } from "./definitionMode";
import type { NoteTapeColor } from "./noteTape";
/** Bilingual note data is saved separately; the canonical article keeps its English 『notes』. */
export type DefinitionMetadata = { britishIPA?: string; mode?: DefinitionMode; contextKey?: string };
export type DefinitionView = DefinitionMetadata & { start: number; english: string; chinese: string; language: "en" | "zh"; term?: string };
export type Definition = DefinitionMetadata & { id: number; start: number; english: string; chinese?: string; language: "en" | "zh"; term?: string; tape?: NoteTapeColor };
export type DefinitionEdit = { offset: number; value: string; deleteCount?: number };

/** Display choices are per reader and never part of an article's dirty/save comparison. */
export function definitionContent(views: DefinitionView[]): DefinitionView[] {
  return views.map(view => ({ ...view, language: "en" as const })).sort((a, b) => a.start - b.start);
}

export function readDefinitionViews(value: unknown, text: string): DefinitionView[] {
  if (!Array.isArray(value) || !value.length) return [];
  const notes = new Map(Array.from(text.matchAll(/『([^』]*)』/g), match => [match.index, match[1]!]));
  const views: DefinitionView[] = [], seen = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.start !== "number" || !Number.isSafeInteger(item.start) || item.start < 0 || seen.has(item.start)
      || typeof item.english !== "string" || typeof item.chinese !== "string" || !item.chinese.trim() || item.chinese.length > 600
      || !/\p{Script=Han}/u.test(item.chinese) || /[『』\r\n]/.test(item.chinese) || (item.language !== "en" && item.language !== "zh")
      || notes.get(item.start) !== item.english) continue;
    const term = typeof item.term === "string" && item.term.length <= 3000 && /^[A-Za-z]+(?:['’\-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’\-][A-Za-z]+)*)*$/.test(item.term)
      ? item.term.trim().replace(/\s+/g, " ") : undefined;
    views.push({ start: item.start, english: item.english, chinese: item.chinese, language: item.language, ...(term ? { term } : {}),
      ...(validBritishIPA(item.britishIPA) ? { britishIPA: item.britishIPA } : {}),
      ...(isDefinitionMode(item.mode) ? { mode: item.mode } : {}),
      ...(typeof item.contextKey === "string" && /^(context|article):[a-f0-9]{64}$/.test(item.contextKey) ? { contextKey: item.contextKey } : {}) });
    seen.add(item.start);
  }
  return views;
}

export class DefinitionViews {
  private text = "";
  private nextId = 0;
  private notes = new Map<number, Definition>();
  private offsets = new Map<number, Definition>();
  get(id: number) { return this.notes.get(id); }
  at(start: number) { return this.offsets.get(start); }
  reset(text: string, saved: unknown = []) {
    this.text = ""; this.notes.clear(); this.offsets.clear(); this.sync(text);
    for (const view of readDefinitionViews(saved, text)) {
      const note = this.at(view.start);
      if (note?.english === view.english) Object.assign(note, view);
    }
  }
  merge(saved: unknown) {
    for (const view of readDefinitionViews(saved, this.text)) {
      const note = this.at(view.start);
      if (note?.english === view.english && !note.chinese) Object.assign(note, view, { language: "en" });
    }
  }
  sync(text: string, insertions?: DefinitionEdit[]) {
    if (text === this.text) return;
    let prefix = 0, suffix = 0;
    while (prefix < this.text.length && prefix < text.length && this.text[prefix] === text[prefix]) prefix++;
    while (suffix < this.text.length - prefix && suffix < text.length - prefix && this.text[this.text.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
    const retained = new Map<number, Definition>();
    for (const note of this.notes.values()) {
      const end = note.start + note.english.length + 2;
      let start: number;
      if (insertions) {
        if (insertions.some(edit => edit.offset < end && edit.offset + (edit.deleteCount ?? 0) > note.start
          || edit.offset > note.start && edit.offset < end)) continue;
        start = note.start + insertions.reduce((shift, edit) => shift + (edit.offset + (edit.deleteCount ?? 0) <= note.start ? edit.value.length - (edit.deleteCount ?? 0) : 0), 0);
      } else if (end <= prefix) start = note.start;
      else if (note.start >= this.text.length - suffix) start = note.start + text.length - this.text.length;
      else continue; // Editing a definition itself invalidates its old translation.
      retained.set(start, note);
    }
    this.notes.clear(); this.offsets.clear();
    for (const match of text.matchAll(/『([^』]*)』/g)) {
      const start = match.index, english = match[1]!;
      const previous = retained.get(start);
      const note: Definition = previous?.english === english ? { ...previous, start }
        : { id: ++this.nextId, start, english, language: "en" };
      this.notes.set(note.id, note); this.offsets.set(start, note);
    }
    this.text = text;
  }
  snapshot(): DefinitionView[] {
    return Array.from(this.notes.values()).filter((note): note is Definition & { chinese: string } => !!note.chinese)
      .map(({ start, english, chinese, language, term, britishIPA, mode, contextKey }) => ({ start, english, chinese, language, ...(term ? { term } : {}), ...(britishIPA ? { britishIPA } : {}), ...(mode ? { mode } : {}), ...(contextKey ? { contextKey } : {}) }));
  }
}
