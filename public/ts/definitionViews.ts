/** Presentation-only translations: the canonical article keeps its English 『notes』. */
export type DefinitionView = { start: number; english: string; chinese: string; language: "en" | "zh" };
export type Definition = { id: number; start: number; english: string; chinese?: string; language: "en" | "zh" };

export function readDefinitionViews(value: unknown, text: string): DefinitionView[] {
  if (!Array.isArray(value)) return [];
  const views: DefinitionView[] = [], seen = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.start !== "number" || !Number.isSafeInteger(item.start) || item.start < 0 || seen.has(item.start)
      || typeof item.english !== "string" || typeof item.chinese !== "string" || !item.chinese.trim() || item.chinese.length > 600
      || !/\p{Script=Han}/u.test(item.chinese) || /[『』\r\n]/.test(item.chinese) || (item.language !== "en" && item.language !== "zh")
      || text.slice(item.start, item.start + item.english.length + 2) !== `『${item.english}』`) continue;
    views.push({ start: item.start, english: item.english, chinese: item.chinese, language: item.language });
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
  sync(text: string, insertions?: Array<{ offset: number; value: string }>) {
    if (text === this.text) return;
    let prefix = 0, suffix = 0;
    while (prefix < this.text.length && prefix < text.length && this.text[prefix] === text[prefix]) prefix++;
    while (suffix < this.text.length - prefix && suffix < text.length - prefix && this.text[this.text.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
    const retained = new Map<number, Definition>();
    for (const note of this.notes.values()) {
      const end = note.start + note.english.length + 2;
      let start: number;
      if (insertions) {
        if (insertions.some(edit => edit.offset > note.start && edit.offset < end)) continue;
        start = note.start + insertions.reduce((shift, edit) => shift + (edit.offset <= note.start ? edit.value.length : 0), 0);
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
      .map(({ start, english, chinese, language }) => ({ start, english, chinese, language }));
  }
}

export function parseChineseDefinition(raw: string): string {
  let value: unknown;
  try { value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw); } catch { /* Report one actionable validation error below. */ }
  const meaning = value && typeof value === "object" && "meaning" in value && typeof value.meaning === "string" ? value.meaning.trim() : "";
  if (!meaning || meaning.length > 600 || !/\p{Script=Han}/u.test(meaning) || /[『』\r\n]/.test(meaning)) {
    throw new Error("AI did not return a valid Chinese definition.");
  }
  return meaning;
}
