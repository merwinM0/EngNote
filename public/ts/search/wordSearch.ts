import type { DefinitionView } from "../definitions/definitionViews";
import type { Page } from "../reading/pagination";
import { WORD_PATTERN } from "../reading/text";

export type SearchScope = "article" | "page";
export type WordOccurrence = { text: string; folded: string; start: number; end: number; page: number; noteStart?: number };
export type WordSearchIndex = { words: WordOccurrence[]; positions: Uint32Array; body: string[] };
export type WordSearchResult = WordOccurrence & { current: boolean; distance: number; direction: "before" | "after" | "here"; match: "exact" | "partial" | "fuzzy"; priority: number };
const fold = (value: string) => value.toLowerCase().replace(/’/g, "'");

/** Index canonical offsets, but never index definitions or count their text as reading distance. */
export function indexSearchWords(text: string, pages: readonly Page[], definitions: readonly Pick<DefinitionView, "start" | "term">[] = []): WordSearchIndex {
  const metadata = new Map(definitions.map(note => [note.start, note.term]));
  const words: WordOccurrence[] = [];
  const notes: Array<{ start: number; end: number }> = [];
  let page = 0;
  for (const match of text.matchAll(/『[^』]*』|[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)) {
    const start = match.index, value = match[0];
    if (value.startsWith("『")) {
      notes.push({ start, end: start + value.length });
      const last = words.at(-1);
      if (!last || last.end !== start) continue;
      const term = metadata.get(start);
      const parts = term ? Array.from(term.matchAll(WORD_PATTERN), word => fold(word[0])) : [];
      const preceding = parts.length ? words.slice(-parts.length) : [];
      const phrase = preceding.length === parts.length && preceding.every((word, index) => word.folded === parts[index]
        && (!index || /^\s+$/.test(text.slice(preceding[index - 1]!.end, word.start))));
      for (const word of phrase && preceding.length ? preceding : [last]) word.noteStart = start;
      continue;
    }
    while (page + 1 < pages.length && start >= pages[page]!.end) page++;
    words.push({ text: value, folded: fold(value), start, end: start + value.length, page });
  }
  const positions = new Uint32Array(text.length + 1), body: string[] = [];
  let noteIndex = 0;
  for (let offset = 0; offset < text.length;) {
    const note = notes[noteIndex];
    if (note?.start === offset) {
      positions.fill(body.length, offset, note.end + 1);
      offset = note.end; noteIndex++;
    } else {
      const char = String.fromCodePoint(text.codePointAt(offset)!);
      positions.fill(body.length, offset, offset + char.length);
      body.push(char); offset += char.length; positions[offset] = body.length;
    }
  }
  return { words, positions, body };
}

/** Small typo budget, including adjacent transpositions; work is bounded by a 64-character query. */
function nearWord(word: string, query: string, limit: number): boolean {
  if (Math.abs(word.length - query.length) > limit) return false;
  let previous = Array.from({ length: query.length + 1 }, (_, i) => i), older = previous;
  for (let i = 1; i <= word.length; i++) {
    const row = [i];
    for (let j = 1; j <= query.length; j++) {
      let value = Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + Number(word[i - 1] !== query[j - 1]));
      if (i > 1 && j > 1 && word[i - 1] === query[j - 2] && word[i - 2] === query[j - 1]) value = Math.min(value, older[j - 2]! + 1);
      row.push(value);
    }
    older = previous; previous = row;
  }
  return previous[query.length]! <= limit;
}

export function searchWords(index: WordSearchIndex, query: string, pages: readonly Page[], currentPage: number, scope: SearchScope, anchor?: number): WordSearchResult[] {
  query = fold(query.trim());
  if (!query || query.length > 64 || !/^[a-z'\-]+$/.test(query) || !/[a-z]/.test(query)) return [];
  const page = pages[currentPage];
  if (!page) return [];
  const origin = Math.max(page.start, Math.min(anchor ?? page.start, page.end));
  const position = (offset: number) => index.positions[offset] ?? 0;
  const matches = new Map<string, WordSearchResult["match"] | null>();
  const results: WordSearchResult[] = [];
  for (const word of index.words) {
    const current = word.start < page.end && word.end > page.start;
    if (scope === "page" && !current) continue;
    if (!matches.has(word.folded)) matches.set(word.folded, word.folded === query ? "exact" : word.folded.includes(query) ? "partial"
      : query.length >= 3 && nearWord(word.folded, query, query.length >= 6 ? 2 : 1) ? "fuzzy" : null);
    const match = matches.get(word.folded);
    if (!match) continue;
    const before = current ? word.end <= origin : word.end <= page.start;
    const here = current && word.start <= origin && origin < word.end;
    const boundary = current ? origin : before ? page.start : page.end;
    const distance = here ? 0 : before ? position(boundary) - position(word.end) : position(word.start) - position(boundary);
    results.push({ ...word, page: current ? currentPage : word.page, current, distance: Math.max(0, distance), direction: here ? "here" : before ? "before" : "after", match, priority: 0 });
  }
  const direction = { here: 0, after: 1, before: 2 };
  results.sort((a, b) => Number(b.current) - Number(a.current) || a.distance - b.distance || direction[a.direction] - direction[b.direction] || a.start - b.start);
  return results.map((result, index) => ({ ...result, priority: index + 1 }));
}

export function searchExcerpt(index: WordSearchIndex, word: WordOccurrence): string {
  const start = index.positions[word.start]!, end = index.positions[word.end]!;
  const stop = Math.min(end, start + 64) + 36;
  return (start > 24 ? "…" : "") + index.body.slice(Math.max(0, start - 24), stop).join("").replace(/\s+/g, " ")
    + (stop < index.body.length ? "…" : "");
}
