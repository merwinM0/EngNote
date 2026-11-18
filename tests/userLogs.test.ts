import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../backend/database";
import { deleteUserWithArticles, previewUser } from "../backend/userAdmin";
import { pruneUserLogs, readUserLogs, recordUserLog, userLogExpiry } from "../backend/userLogs";
import { runUserAdmin } from "../scripts/users";

let directory: string, path: string, db: Database;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "engnote-logs-"));
  path = join(directory, "test.db");
  db = openDatabase(path);
});
afterEach(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

async function cli(args: string[], answers: string[] = []) {
  let output = "";
  await runUserAdmin(["--db", path, ...args], {
    write: text => { output += text; }, readLine: async () => answers.shift(),
  });
  return output;
}

test("six UTC calendar months clamp month ends and filter expired rows before pruning", () => {
  const at = Date.parse("2025-08-31T12:34:00.123Z"), expiry = Date.parse("2026-02-28T12:34:00.123Z");
  expect(userLogExpiry(at)).toBe(expiry);
  expect(new Date(userLogExpiry(Date.parse("2023-08-31T23:45:00Z"))).toISOString()).toBe("2024-02-29T23:45:00.000Z");
  recordUserLog(db, { event: "auth.login", userId: 12 }, at);
  expect([...readUserLogs(db, {}, undefined, expiry - 1)]).toHaveLength(1);
  expect([...readUserLogs(db, {}, undefined, expiry)]).toHaveLength(0);
  expect(pruneUserLogs(db, expiry - 1)).toBe(0);
  expect(pruneUserLogs(db, expiry)).toBe(1);
  recordUserLog(db, { event: "auth.login" }, Date.UTC(2000, 0, 1));
  const reopened = openDatabase(path);
  try { expect(reopened.query("SELECT count(*) AS count FROM user_logs").get()).toEqual({ count: 0 }); }
  finally { reopened.close(); }
});

test("account deletion retains unexpired ID-only logs, without linking a re-registered email", () => {
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?)").run("gone@example.com", "private-hash");
  recordUserLog(db, { event: "auth.login", userId: 1 });
  deleteUserWithArticles(db, previewUser(db, "1")!, join(directory, "backups"));
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?)").run("gone@example.com", "new-private-hash");
  expect([...readUserLogs(db, { userId: 2 })]).toHaveLength(0);
  const old = [...readUserLogs(db, { userId: 1 })];
  expect(old).toEqual([expect.objectContaining({ userId: 1, event: "auth.login" })]);
  expect(JSON.stringify(old)).not.toMatch(/gone@example|private-hash/);
});

test("CLI filters and paginates newest first, and exports all matching rows privately", async () => {
  const now = Date.now();
  db.transaction(() => {
    for (let i = 1; i <= 600; i++) recordUserLog(db, { event: "article.update", userId: 12, articleId: i }, now);
    recordUserLog(db, { event: "auth.login", userId: 12, reason: "invalid_credentials" }, now);
    recordUserLog(db, { event: "article.update", userId: 23, articleId: 99 }, now);
    recordUserLog(db, { event: "article.update", userId: 12, articleId: 601 }, now - 10 * 86400000);
    recordUserLog(db, { event: "article.update", userId: 12, articleId: 602 }, Date.UTC(2000, 0, 1));
  })();
  const filters = ["--user", "12", "--since", "7d", "--event", "article.update"];
  const result = JSON.parse(await cli(["logs", ...filters, "--page", "2", "--json"]));
  expect(result).toMatchObject({ ok: true, command: "logs", page: 2, pageSize: 50, hasMore: true });
  expect(result.logs).toHaveLength(50);
  expect(result.logs[0]).toMatchObject({ articleId: 550, outcome: "success", reason: null });
  expect(result.logs.at(-1).articleId).toBe(501);
  expect(await cli([], ["logs --user 12 --event auth.login", "quit"])).toContain("失败 (invalid_credentials)");

  const dest = join(directory, "export.json");
  const process = Bun.spawn(["bun", "scripts/users.ts", "--db", path, "logs", "export", ...filters, "--out", dest], { stdout: "pipe", stderr: "pipe" });
  expect(await process.exited).toBe(0);
  expect(await new Response(process.stdout).text()).toContain("已导出 600 条日志");
  const exported = JSON.parse(readFileSync(dest, "utf8"));
  expect(exported).toMatchObject({ ok: true, command: "logs export", count: 600 });
  expect(exported.logs.map((log: { articleId: number }) => log.articleId)).toEqual(Array.from({ length: 600 }, (_, i) => 600 - i));
  expect(statSync(dest).mode & 0o077).toBe(0);
  expect(db.query("SELECT count(*) AS count FROM user_logs").get()).toEqual({ count: 604 });
});

test("invalid options, existing files, symlinks and legacy databases do not clobber or create data", async () => {
  const dest = join(directory, "already.json"), link = join(directory, "linked.json");
  writeFileSync(dest, "untouched"); symlinkSync(dest, link);
  for (const file of [dest, link]) await expect(cli(["logs", "export", "--out", file])).rejects.toThrow("不会覆盖");
  expect(readFileSync(dest, "utf8")).toBe("untouched");
  for (const args of [["--user", "0"], ["--since", "0d"], ["--since", "week"], ["--event", "unknown"], ["--page", "9007199254740991"], ["export"], ["--out", dest]]) {
    await expect(cli(["logs", ...args])).rejects.toThrow();
  }
  const failedExport = join(directory, "failed.json");
  db.exec("DROP TABLE user_logs");
  await expect(cli(["logs", "export", "--out", failedExport])).rejects.toThrow("先启动应用");
  expect(existsSync(failedExport)).toBe(false);
  expect(db.query("SELECT 1 FROM sqlite_schema WHERE name = 'user_logs'").get()).toBeNull();
});
