import { ARTICLE_DRAFT_KEY, parseArticleDraft, type ArticleDraft } from "./articleDraft";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const workspaceDraftKey = (account: string | null) => `${ARTICLE_DRAFT_KEY}:${account === null ? "guest" : `account:${encodeURIComponent(account)}`}`;

/** Device-local workspaces are isolated by account; these keys never grant API access. */
export class ArticleWorkspaces {
  private memory = new Map<string, ArticleDraft | null>();
  constructor(private readonly storage: () => DraftStorage) {}
  read(account: string | null): ArticleDraft | null {
    const key = workspaceDraftKey(account);
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    try {
      const raw = this.storage().getItem(key);
      const draft = raw ? parseArticleDraft(raw) : null;
      const result = draft && account === null ? { ...draft, entry: null } : draft;
      this.memory.set(key, result);
      return result;
    } catch { return null; }
  }
  write(account: string | null, draft: ArticleDraft | null): boolean {
    const key = workspaceDraftKey(account);
    const value = draft && account === null ? { ...draft, entry: null } : draft;
    this.memory.set(key, value);
    try {
      if (value) this.storage().setItem(key, JSON.stringify(value));
      else this.storage().removeItem(key);
      return true;
    } catch { return false; } // Switching accounts must still retain their in-memory work.
  }
  legacy(): ArticleDraft | null {
    try { const raw = this.storage().getItem(ARTICLE_DRAFT_KEY); return raw ? parseArticleDraft(raw) : null; }
    catch { return null; }
  }
  removeLegacy() {
    try { this.storage().removeItem(ARTICLE_DRAFT_KEY); } catch { /* Never block reading. */ }
  }
}
