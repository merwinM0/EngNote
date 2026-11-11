import type { Database } from "bun:sqlite";
import { articleVocabulary, vocabularyKey, type VocabularyItem } from "../public/ts/vocabulary";
import { readDefinitionViews } from "../public/ts/definitionViews";

type StoredVocabulary = { term: string; english: string; chinese: string | null; british_ipa: string | null; language: "en" | "zh"; updated_at: number };
/** All callers authenticate first; repeat the user-ID check inside the write transaction. */
export function storeVocabulary(db: Database, userId: number, items: readonly VocabularyItem[], now = Date.now()): boolean {
  return db.transaction(() => {
    if (!db.query("SELECT id FROM users WHERE id = ?").get(userId)) return false;
    const insert = db.query(`INSERT INTO vocabulary (user_id, term_key, term, english, chinese, british_ipa, language, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, term_key) DO UPDATE SET term = excluded.term, english = excluded.english,
      chinese = excluded.chinese, british_ipa = excluded.british_ipa, updated_at = MAX(excluded.updated_at, vocabulary.updated_at + 1)
      WHERE vocabulary.english IS NOT excluded.english OR vocabulary.chinese IS NOT excluded.chinese OR vocabulary.british_ipa IS NOT excluded.british_ipa`);
    for (const item of items) insert.run(userId, vocabularyKey(item.term), item.term, item.english, item.chinese ?? null, item.britishIPA ?? null, item.language, now);
    return true;
  })();
}
export function collectArticleVocabulary(db: Database, userId: number, content: string, raw: string, now = Date.now()) {
  let definitions: ReturnType<typeof readDefinitionViews> = [];
  try { definitions = readDefinitionViews(JSON.parse(raw), content); } catch { /* Legacy English notes remain readable. */ }
  return storeVocabulary(db, userId, articleVocabulary(content, definitions), now);
}
/** One-time, transactional backfill from owned saved articles; never touch unowned history or query cache. */
export function initVocabulary(db: Database) {
  db.transaction(() => {
    if (db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary'").get()) return;
    db.exec(`CREATE TABLE vocabulary (
      user_id INTEGER NOT NULL REFERENCES users(id), term_key TEXT NOT NULL, term TEXT NOT NULL,
      english TEXT NOT NULL, chinese TEXT, british_ipa TEXT, language TEXT NOT NULL DEFAULT 'en', updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, term_key)
    ); CREATE INDEX vocabulary_user_updated ON vocabulary (user_id, updated_at DESC, term_key)`);
    const rows = db.query<{ user_id: number; content: string; definitions: string; updated_at: number }, []>(`SELECT u.id AS user_id, e.content, e.definitions, e.updated_at
      FROM entries e JOIN users u ON e.owner_email = u.email ORDER BY e.updated_at, e.id`).iterate();
    for (const row of rows) collectArticleVocabulary(db, row.user_id, row.content, row.definitions, row.updated_at);
  })();
}
export function listVocabulary(db: Database, userId: number, query: string, offset: number, limit: number) {
  const where = "user_id = ? AND (instr(lower(term), ?) > 0 OR instr(lower(english), ?) > 0 OR instr(chinese, ?) > 0)";
  const params = [userId, query.toLowerCase(), query.toLowerCase(), query] as const;
  const total = db.query<{ count: number }, [number, string, string, string]>(`SELECT COUNT(*) AS count FROM vocabulary WHERE ${where}`).get(...params)!.count;
  const rows = db.query<StoredVocabulary, [number, string, string, string, number, number]>(`SELECT term, english, chinese, british_ipa, language, updated_at FROM vocabulary WHERE ${where} ORDER BY updated_at DESC, term_key LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, items: rows.map(row => ({ term: row.term, english: row.english, ...(row.chinese ? { chinese: row.chinese } : {}),
    ...(row.british_ipa ? { britishIPA: row.british_ipa } : {}), language: row.language, updated_at: row.updated_at })) };
}
