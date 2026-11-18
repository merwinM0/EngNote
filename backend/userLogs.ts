import type { Database } from "bun:sqlite";

export const USER_LOG_EVENTS = [
  "auth.send_code", "auth.register", "auth.login", "auth.logout",
  "article.create", "article.update", "article.delete",
] as const;
export type UserLogEvent = typeof USER_LOG_EVENTS[number];
export type UserLogReason = "invalid_input" | "unauthenticated" | "forbidden" | "not_found" | "internal_error"
  | "rate_limited" | "delivery_failed" | "already_registered" | "invalid_code" | "invalid_credentials";
export type UserLogAttempt = { event: UserLogEvent; userId?: number; articleId?: number; reason?: UserLogReason };
export type UserLogFilter = { userId?: number; since?: number; event?: UserLogEvent };

type UserLogRow = { id: number; at: number; event: UserLogEvent; userId: number | null; articleId: number | null; reason: UserLogReason | null };
export type UserLogRecord = Omit<UserLogRow, "at"> & { time: string; outcome: "success" | "failure" };

// Add six UTC calendar months, clamped to the target month's last day.
export function userLogExpiry(at: number): number {
  const date = new Date(at), day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 6, 1);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return date.setUTCDate(Math.min(day, last.getUTCDate()));
}

export function initUserLogs(db: Database): void {
  // No foreign keys: old IDs remain queryable after a user or article is deleted.
  db.exec(`CREATE TABLE IF NOT EXISTS user_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    event TEXT NOT NULL, user_id INTEGER, article_id INTEGER, reason TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS user_logs_expiry ON user_logs (expires_at);
  CREATE INDEX IF NOT EXISTS user_logs_recent ON user_logs (at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS user_logs_user_recent ON user_logs (user_id, at DESC, id DESC);`);
  pruneUserLogs(db);
}

export function pruneUserLogs(db: Database, now = Date.now()): number {
  return db.query("DELETE FROM user_logs WHERE expires_at <= ?").run(now).changes;
}

/** Observational logging: a log write failure must not change a completed API result. */
export function recordUserLog(db: Database, { event, userId, articleId, reason }: UserLogAttempt, now = Date.now()): void {
  try {
    db.query("INSERT INTO user_logs (at, expires_at, event, user_id, article_id, reason) VALUES (?, ?, ?, ?, ?, ?)")
      .run(now, userLogExpiry(now), event, userId ?? null, articleId ?? null, reason ?? null);
  } catch {
    console.error("User activity log write failed.");
  }
}

export function* readUserLogs(db: Database, filter: UserLogFilter, page?: { limit: number; offset: number }, now = Date.now()): Generator<UserLogRecord, void> {
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'user_logs'").get()) {
    throw new Error("用户日志表尚未初始化，请先启动应用完成迁移；管理工具不会自动迁移数据库。");
  }
  const conditions = ["expires_at > ?"], args: Array<string | number> = [now];
  if (filter.since !== undefined) { conditions.push("at >= ?"); args.push(filter.since); }
  if (filter.userId !== undefined) { conditions.push("user_id = ?"); args.push(filter.userId); }
  if (filter.event !== undefined) { conditions.push("event = ?"); args.push(filter.event); }
  if (page) args.push(page.limit, page.offset);
  const rows = db.query<UserLogRow, Array<string | number>>(`SELECT id, at, event, user_id AS userId, article_id AS articleId, reason
    FROM user_logs WHERE ${conditions.join(" AND ")} ORDER BY at DESC, id DESC${page ? " LIMIT ? OFFSET ?" : ""}`);
  for (const { at, ...row } of rows.iterate(...args)) {
    yield { ...row, time: new Date(at).toISOString(), outcome: row.reason === null ? "success" : "failure" };
  }
}
