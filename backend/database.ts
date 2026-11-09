import { Database } from "bun:sqlite";
import { resolve } from "node:path";

export const defaultDatabasePath = () => process.env.DB_PATH === ":memory:" ? ":memory:" : resolve(process.env.DB_PATH || resolve(import.meta.dir, "..", "data.db"));
/** Schema creation/migration belongs to application startup, never to read-only admin commands. */
export function openDatabase(path = defaultDatabasePath()): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), owner_email TEXT, definitions TEXT NOT NULL DEFAULT '[]', formatting TEXT
  )`);
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(entries)").all();
  if (!columns.some(column => column.name === "owner_email")) db.exec("ALTER TABLE entries ADD COLUMN owner_email TEXT");
  if (!columns.some(column => column.name === "definitions")) db.exec("ALTER TABLE entries ADD COLUMN definitions TEXT NOT NULL DEFAULT '[]'");
  if (!columns.some(column => column.name === "formatting")) db.exec("ALTER TABLE entries ADD COLUMN formatting TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS entries_owner_id ON entries (owner_email, id)");
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}
