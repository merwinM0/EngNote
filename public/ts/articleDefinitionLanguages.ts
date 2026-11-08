import { sha256Hex } from "./contextFingerprint";
import { definitionContent, readDefinitionViews, type DefinitionView } from "./definitionViews";

export const ARTICLE_DEFINITION_LANGUAGES_KEY = "er_article_definition_languages_v1";
const MAX_ARTICLES = 100;
const MAX_STORAGE_LENGTH = 256 * 1024;
type Languages = { fingerprint: string; languages: DefinitionView["language"][] };
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const fingerprint = (text: string, views: DefinitionView[]) => sha256Hex(JSON.stringify([text, definitionContent(views)]));
const sortedViews = (value: unknown, text: string) => readDefinitionViews(value, text).sort((a, b) => a.start - b.start);

/** Tab-local reader choices, separate from shared content and new-definition defaults.
 * Only version fingerprints and languages are stored, never article text or credentials.
 */
export class ArticleDefinitionLanguages {
  private entries = new Map<number, Languages>();
  constructor(private readonly storage: () => PreferenceStorage) {}
  restore(): boolean {
    this.entries.clear();
    try {
      const raw = this.storage().getItem(ARTICLE_DEFINITION_LANGUAGES_KEY);
      if (!raw) return true;
      if (raw.length > MAX_STORAGE_LENGTH) return false;
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return false;
      for (const item of value) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [id, record] = item;
        if (!Number.isSafeInteger(id) || id < 1 || !record || typeof record !== "object"
          || typeof record.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(record.fingerprint)
          || !Array.isArray(record.languages) || !record.languages.every((language: unknown) => language === "en" || language === "zh")) continue;
        this.entries.delete(id);
        this.entries.set(id, { fingerprint: record.fingerprint, languages: record.languages });
        if (this.entries.size > MAX_ARTICLES) this.entries.delete(this.entries.keys().next().value!);
      }
      return true;
    } catch { return false; }
  }
  remember(id: number, text: string, value: DefinitionView[]): boolean {
    const views = sortedViews(value, text);
    this.entries.delete(id);
    if (views.length) this.entries.set(id, { fingerprint: fingerprint(text, views), languages: views.map(view => view.language) });
    return this.persist();
  }
  apply(id: number, text: string, value: unknown): DefinitionView[] {
    const views = sortedViews(value, text), record = this.entries.get(id);
    if (!record || record.languages.length !== views.length || record.fingerprint !== fingerprint(text, views)) return views;
    this.entries.delete(id); this.entries.set(id, record);
    return views.map((view, index) => ({ ...view, language: record.languages[index]! }));
  }
  forget(id: number): boolean { this.entries.delete(id); return this.persist(); }
  private persist(): boolean {
    let raw = JSON.stringify([...this.entries]);
    while (this.entries.size > MAX_ARTICLES || raw.length > MAX_STORAGE_LENGTH) {
      this.entries.delete(this.entries.keys().next().value!);
      raw = JSON.stringify([...this.entries]);
    }
    try { this.storage().setItem(ARTICLE_DEFINITION_LANGUAGES_KEY, raw); return true; }
    catch { return false; } // Keep the bounded in-memory choices when storage is blocked.
  }
}
