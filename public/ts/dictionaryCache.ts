import { validBritishIPA } from "./pronunciation";
import { dictionaryKey, DICTIONARY_VERSION, isBilingualMeaning } from "./dictionary";
import type { BilingualMeaning } from "./dictionary";

export const DICTIONARY_CACHE_STORAGE = "er_dictionary_cache_v2";
export const DICTIONARY_CACHE_LIMIT = 256;
export const DICTIONARY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
type Entry = { term: string; meaning: BilingualMeaning; expiresAt: number };
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Bounded, versioned general-dictionary cache. No keys, article text or reader identity. */
export class DictionaryCache {
  private entries = new Map<string, Entry>();
  constructor(private readonly storage: () => CacheStorage, private readonly now = Date.now) {}
  restore() {
    this.entries.clear();
    try {
      const data: unknown = JSON.parse(this.storage().getItem(DICTIONARY_CACHE_STORAGE) ?? "null");
      if (!data || typeof data !== "object" || !("version" in data) || data.version !== DICTIONARY_VERSION
        || !("entries" in data) || !Array.isArray(data.entries)) return;
      for (const entry of data.entries.slice(-DICTIONARY_CACHE_LIMIT)) {
        if (!entry || typeof entry !== "object" || typeof entry.term !== "string" || !dictionaryKey(entry.term) || entry.term.length > 3000
          || !isBilingualMeaning(entry.meaning) || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= this.now()
          || entry.expiresAt > this.now() + DICTIONARY_CACHE_TTL) continue;
        this.entries.set(dictionaryKey(entry.term), { term: dictionaryKey(entry.term), meaning: { english: entry.meaning.english, chinese: entry.meaning.chinese, ...(validBritishIPA(entry.meaning.britishIPA) ? { britishIPA: entry.meaning.britishIPA } : {}) }, expiresAt: entry.expiresAt });
      }
    } catch { /* Blocked or malformed storage must not prevent dictionary use. */ }
  }
  get(term: string): BilingualMeaning | undefined {
    const key = dictionaryKey(term), entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); this.persist(); return; }
    // Persist recency too: otherwise a reload could evict a just-used entry as if it were the oldest.
    if (Array.from(this.entries.keys()).at(-1) !== key) {
      this.entries.delete(key); this.entries.set(key, entry); this.persist();
    }
    return { ...entry.meaning };
  }
  set(term: string, meaning: BilingualMeaning) {
    const key = dictionaryKey(term);
    if (!key || key.length > 3000 || !isBilingualMeaning(meaning)) return;
    this.entries.delete(key);
    for (const [stored, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(stored);
    this.entries.set(key, { term: key, meaning: { english: meaning.english, chinese: meaning.chinese, ...(validBritishIPA(meaning.britishIPA) ? { britishIPA: meaning.britishIPA } : {}) }, expiresAt: this.now() + DICTIONARY_CACHE_TTL });
    while (this.entries.size > DICTIONARY_CACHE_LIMIT) this.entries.delete(this.entries.keys().next().value!);
    this.persist();
  }
  clear(): boolean {
    this.entries.clear();
    try { this.storage().removeItem(DICTIONARY_CACHE_STORAGE); return true; } catch { return false; }
  }
  private persist() {
    try { this.storage().setItem(DICTIONARY_CACHE_STORAGE, JSON.stringify({ version: DICTIONARY_VERSION, entries: [...this.entries.values()] })); }
    catch { /* The in-memory cache remains usable. */ }
  }
}
export const dictionaryCache = new DictionaryCache(() => localStorage);
