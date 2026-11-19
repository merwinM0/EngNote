import { WORD_PATTERN } from "../reading/text";

export const foldSourceWord = (word: string) => word.toLowerCase().replace(/’/g, "'");

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
