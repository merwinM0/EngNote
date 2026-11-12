import { isBilingualMeaning } from "../ai/dictionary";
import type { DefinitionView } from "../definitions/definitionViews";
import { validBritishIPA } from "../definitions/pronunciation";

export type VocabularyItem = { term: string; english: string; chinese?: string; britishIPA?: string; language: "en" | "zh" };
export type ArticleVocabularyItem = VocabularyItem & { start: number };
export const VOCABULARY_BATCH_LIMIT = 500;
export const VOCABULARY_PAGE_SIZE = 100;
const normalizeTerm = (term: string) => term.trim().replace(/\s+/g, " ").replace(/’/g, "'");
/** Fold sentence case, but do not merge acronyms such as US with the pronoun us. */
export const vocabularyKey = (term: string) => normalizeTerm(term).replace(/[A-Za-z]+/g, word => /^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase());
export function readVocabularyItem(value: unknown): VocabularyItem | null {
  if (!value || typeof value !== "object" || !("term" in value) || typeof value.term !== "string"
    || !("english" in value) || typeof value.english !== "string" || !("language" in value) || (value.language !== "en" && value.language !== "zh")) return null;
  const term = normalizeTerm(value.term);
  if (term.length > 3000 || !/^[A-Za-z]+(?:['\-][A-Za-z]+)*(?: [A-Za-z]+(?:['\-][A-Za-z]+)*)*$/.test(term)) return null;
  const chinese = "chinese" in value ? value.chinese : undefined;
  if ((chinese !== undefined && typeof chinese !== "string") || !isBilingualMeaning({ english: value.english, chinese: chinese ?? "释义" })) return null;
  const britishIPA = "britishIPA" in value ? value.britishIPA : undefined;
  if (britishIPA !== undefined && !validBritishIPA(britishIPA)) return null;
  return { term, english: value.english, ...(typeof chinese === "string" ? { chinese } : {}),
    ...(typeof britishIPA === "string" ? { britishIPA } : {}), language: value.language === "zh" && chinese ? "zh" : "en" };
}
function precedingTerm(text: string, start: number, expected?: string): string | null {
  const tail = text.slice(Math.max(0, start - 3000), start);
  if (expected) {
    const normalized = normalizeTerm(expected);
    const pattern = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+").replace(/'/g, "['’]");
    const match = tail.match(new RegExp(`(?:^|[^A-Za-z'’\\-])(${pattern})$`, "i"));
    if (match) return normalizeTerm(match[1]!);
  }
  return tail.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*$/)?.[0] ?? null;
}
/** Read all pages, including legacy English-only notes; never infer a phrase without matching metadata. */
export function articleVocabulary(text: string, definitions: readonly DefinitionView[] = []): ArticleVocabularyItem[] {
  const metadata = new Map(definitions.map(note => [note.start, note]));
  const items = new Map<string, ArticleVocabularyItem>();
  for (const note of text.matchAll(/『([^』]*)』/g)) {
    const view = metadata.get(note.index), valid = view?.english === note[1] ? view : undefined;
    const term = precedingTerm(text, note.index, valid?.term);
    if (!term) continue;
    const item = readVocabularyItem({ term, english: note[1], language: valid?.language ?? "en",
      ...(valid?.chinese ? { chinese: valid.chinese } : {}), ...(valid?.britishIPA ? { britishIPA: valid.britishIPA } : {}) });
    if (item) items.set(vocabularyKey(term), { ...item, start: note.index });
  }
  return [...items.values()];
}
