import { DOCUMENT_LIMIT } from "./pagination";
import { readDefinitionViews } from "./definitionViews";
import type { DefinitionView } from "./definitionViews";

// Keep the original storage key so existing working text survives this upgrade.
export const ARTICLE_DRAFT_KEY = "er_article_draft_v1";
export type DraftEntry = { id: number; title: string; savedText: string };
export type ArticleDraft = { version: 2; text: string; index: number; entry: DraftEntry | null; definitions?: DefinitionView[]; offset?: number };

function readEntry(value: unknown): DraftEntry | null {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id < 1
    || !("title" in value) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 20
    || !("savedText" in value) || typeof value.savedText !== "string" || !value.savedText.trim() || value.savedText.length > DOCUMENT_LIMIT) return null;
  // Persist identity and the last saved baseline, never client-supplied edit permissions.
  return { id: value.id, title: value.title, savedText: value.savedText };
}

export function parseArticleDraft(raw: string): ArticleDraft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || (value.version !== 1 && value.version !== 2)
      || !("text" in value) || typeof value.text !== "string" || value.text.length > DOCUMENT_LIMIT
      || !("index" in value) || typeof value.index !== "number" || !Number.isInteger(value.index)) return null;
    return {
      version: 2, text: value.text, index: value.index,
      ...("offset" in value && typeof value.offset === "number" && Number.isSafeInteger(value.offset) && value.offset >= 0 && value.offset <= value.text.length ? { offset: value.offset } : {}),
      entry: value.version === 2 && "entry" in value ? readEntry(value.entry) : null,
      ...("definitions" in value ? { definitions: readDefinitionViews(value.definitions, value.text) } : {}),
    };
  } catch { return null; }
}
