import { WORD_PATTERN } from "../reading/text";

export const foldSourceWord = (word: string) => word.toLowerCase().replace(/’/g, "'");

/** The canonical source span, even when the phrase crosses a page boundary. */
export function definitionSourceRange(text: string, end: number, term?: string) {
  const preceding = (offset: number) => {
    let start = offset;
    while (start > 0 && /[A-Za-z'’\-]/.test(text[start - 1]!)) start--;
    const match = start < offset ? Array.from(text.slice(start, offset).matchAll(WORD_PATTERN)).at(-1) : undefined;
    return match && start + match.index + match[0].length === offset ? match[0] : undefined;
  };
  const last = preceding(end);
  if (!last) return { start: end, end: end + 1 };
  const fallback = { start: end - last.length, end };
  const parts = term?.split(/\s+/) ?? [];
  if (parts.length < 2 || foldSourceWord(last) !== foldSourceWord(parts.at(-1)!)) return fallback;
  let start = fallback.start;
  for (let i = parts.length - 2; i >= 0; i--) {
    let cursor = start;
    while (cursor > 0 && /\s/.test(text[cursor - 1]!)) cursor--;
    const word = cursor < start ? preceding(cursor) : undefined;
    if (!word || foldSourceWord(word) !== foldSourceWord(parts[i]!)) return fallback;
    start = cursor - word.length;
  }
  return { start, end };
}

/** Match the annotated occurrence, not another instance of the same word. */
export function definitionSourceWords<T extends { text: string; start: number; end: number }>(
  words: readonly T[], text: string, noteStart: number, term?: string,
): readonly T[] {
  const last = words.at(-1);
  if (!last || last.end !== noteStart) return [];
  const parts = term ? Array.from(term.matchAll(WORD_PATTERN), word => foldSourceWord(word[0])) : [];
  if (parts.length < 2 || parts.length > words.length) return [last];
  const phrase = words.slice(-parts.length);
  return phrase.every((word, i) => foldSourceWord(word.text) === parts[i]
    && (!i || /^\s+$/.test(text.slice(phrase[i - 1]!.end, word.start)))) ? phrase : [last];
}
