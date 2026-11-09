import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type AdminUser = { id: number; email: string; created_at: string; article_count: number };
export type AdminArticle = { id: number; title: string; created_at: string; characters: number };
export type UserPreview = { user: AdminUser; articles: AdminArticle[]; stamp: string };
export const USER_PAGE_SIZE = 50;
export function openAdminDatabase(path: string, writable = false): Database {
  const filename = realpathSync(resolve(path)); // Fail rather than silently creating a mistyped database.
  if (!lstatSync(filename).isFile()) throw new Error("数据库路径必须是已存在的普通文件。");
  const db = new Database(filename, { create: false, readonly: !writable, readwrite: writable });
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const users = db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map(column => column.name);
    const entries = db.query<{ name: string }, []>("PRAGMA table_info(entries)").all().map(column => column.name);
    if (!["id", "email", "created_at"].every(name => users.includes(name)) || !["id", "title", "content", "created_at", "owner_email"].every(name => entries.includes(name))) throw new Error("数据库结构不兼容，请先启动应用完成迁移；管理工具不会自动迁移数据库。");
    return db;
  } catch (error) { db.close(); throw error; }
}
export function listUsers(db: Database, search = "", page = 1): AdminUser[] {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("页码必须是正整数。");
  return db.query<AdminUser, [string, string, number, number]>(`SELECT u.id, u.email, u.created_at, (SELECT COUNT(*) FROM entries e WHERE e.owner_email = u.email) AS article_count
    FROM users u WHERE instr(lower(u.email), ?) > 0 OR CAST(u.id AS TEXT) = ? ORDER BY u.id LIMIT ? OFFSET ?`).all(search.trim().toLowerCase(), search.trim(), USER_PAGE_SIZE, (page - 1) * USER_PAGE_SIZE);
}
export function findUser(db: Database, target: string): AdminUser | null {
  const value = target.trim();
  const numeric = /^\d+$/.test(value);
  if (numeric && (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) throw new Error("用户 ID 必须是正安全整数。");
  return db.query<AdminUser, [string | number]>(`SELECT u.id, u.email, u.created_at, (SELECT COUNT(*) FROM entries e WHERE e.owner_email = u.email) AS article_count
    FROM users u WHERE ${numeric ? "u.id" : "u.email"} = ?`).get(numeric ? Number(value) : value.toLowerCase()) ?? null;
}
export function userArticles(db: Database, user: AdminUser): AdminArticle[] {
  return db.query<AdminArticle, [string]>("SELECT id, title, created_at, length(content) AS characters FROM entries WHERE owner_email = ? ORDER BY id DESC").all(user.email);
}
export function viewArticle(db: Database, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("文章 ID 必须是正安全整数。");
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(entries)").all().map(column => column.name);
  // Only fixed, inspected column names are interpolated; all user inputs are bound parameters.
  return db.query<{ id: number; title: string; content: string; created_at: string; owner_email: string | null; definitions: string }, [number]>(`SELECT id, title, content, created_at, owner_email, ${columns.includes("definitions") ? "definitions" : "'[]' AS definitions"} FROM entries WHERE id = ?`).get(id) ?? null;
}
export function previewUser(db: Database, target: string): UserPreview | null {
  const user = findUser(db, target); if (!user) return null;
  const hash = createHash("sha256").update(JSON.stringify(user));
  // Include saved contents and metadata, not just counts: any concurrent article change requires a new preview.
  for (const row of db.query("SELECT * FROM entries WHERE owner_email = ? ORDER BY id").iterate(user.email)) hash.update(JSON.stringify(row));
  return { user, articles: userArticles(db, user), stamp: hash.digest("hex") };
}
/** Escape terminal commands and bidi/invisible controls while retaining readable multiline content. */
export function terminalText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, character => character === "\n" || character === "\t" ? character : `\\u{${character.codePointAt(0)!.toString(16)}}`);
}
function backupSnapshot(db: Database, directory: string, userId: number): string {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("备份目录必须是非符号链接的私有目录（权限 700）；未删除数据。");
  const path = join(root, `${Date.now()}-${randomUUID()}-before-user-${userId}.sqlite`);
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, db.serialize()); fsyncSync(fd); }
  finally { closeSync(fd); }
  const directoryFd = openSync(root, "r");
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  return path;
}
export function deleteUserWithArticles(db: Database, preview: UserPreview, backupDirectory: string): { articles: number; backup: string } {
  return db.transaction(() => {
    const current = previewUser(db, String(preview.user.id));
    if (!current || current.user.email !== preview.user.email || current.stamp !== preview.stamp) throw new Error("用户或文章在预览后发生变化，请重新查看并确认；未删除数据。");
    const backup = backupSnapshot(db, backupDirectory, current.user.id);
    const articles = db.query("DELETE FROM entries WHERE owner_email = ?").run(current.user.email).changes;
    const deleted = db.query("DELETE FROM users WHERE id = ? AND email = ?").run(current.user.id, current.user.email).changes;
    if (deleted !== 1 || articles !== current.user.article_count) throw new Error("删除数量不一致，事务已回滚。");
    return { articles, backup };
  }).immediate();
}
