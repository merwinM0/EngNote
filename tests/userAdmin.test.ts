import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDatabase } from "../backend/database";
import { deleteUserWithArticles, findUser, listUsers, openAdminDatabase, previewUser, terminalText, userArticles, viewArticle } from "../backend/userAdmin";
import { runUserAdmin, type AdminIO } from "../scripts/users";
let directory: string, path: string, backups: string, db: Database;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "engnote-admin-")); path = join(directory, "test.db"); backups = join(directory, "backups");
  db = openDatabase(path);
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?), (?, ?)").run("alice@example.com", "private-test-hash", "bob@example.com", "private-test-hash");
  db.exec("INSERT INTO entries (title, content, owner_email, definitions) VALUES ('One', 'fox『animal』', 'alice@example.com', '[{\"start\":3,\"english\":\"animal\",\"chinese\":\"动物\",\"language\":\"zh\"}]'), ('Two', 'Keep all text.', 'alice@example.com', '[]'), ('Bob', 'Other account.', 'bob@example.com', '[]'), ('Legacy', 'No owner.', NULL, '[]')");
});
afterEach(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
function io(answers: Array<string | undefined> = [], options: Pick<AdminIO, "columns" | "color"> = {}) {
  let output = "";
  const terminal: AdminIO = { ...options, write: text => { output += text; }, readLine: async prompt => { output += prompt + "\n"; return answers.shift(); } };
  return { terminal, output: () => output };
}
const count = (table: "users" | "entries") => (db.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;

describe("local read-only user/article inspection", () => {
  test("opens an existing database read-only, never creates a missing path or migrates schema", () => {
    const readonly = openAdminDatabase(path);
    try { expect(() => readonly.exec("DELETE FROM users")).toThrow(); expect(listUsers(readonly)).toHaveLength(2); }
    finally { readonly.close(); }
    const previousPath = process.env.DB_PATH;
    try { process.env.DB_PATH = ":memory:"; const memory = openDatabase(); try { expect(memory.filename).toBe(":memory:"); } finally { memory.close(); } }
    finally { if (previousPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previousPath; }
    const absent = join(directory, "missing.db"); expect(() => openAdminDatabase(absent)).toThrow(); expect(existsSync(absent)).toBe(false);
    const incompatible = join(directory, "old.db"), old = new Database(incompatible); old.exec("CREATE TABLE users(id INTEGER)"); old.close();
    expect(() => openAdminDatabase(incompatible)).toThrow("不会自动迁移");
  });
  test("queries users by exact ID/email, searches safely and scopes article lists", () => {
    expect(listUsers(db).map(user => user.article_count)).toEqual([2, 1]);
    expect(listUsers(db, "alice")).toHaveLength(1); expect(listUsers(db, "' OR 1=1 --")).toHaveLength(0);
    expect(findUser(db, "ALICE@example.com")?.id).toBe(findUser(db, "1")?.id);
    expect(userArticles(db, findUser(db, "1")!).map(article => article.title)).toEqual(["Two", "One"]);
    expect(viewArticle(db, 1)?.content).toBe("fox『animal』"); expect(viewArticle(db, 999)).toBeNull();
    expect(() => viewArticle(db, NaN)).toThrow(); expect(() => listUsers(db, "", 0)).toThrow();
  });
  test("terminal commands show users, their article lists and complete displayed-language text, never hashes", async () => {
    for (const args of [["list"], ["show", "alice@example.com"], ["article", "1"]]) {
      const terminal = io(); await runUserAdmin(["--db", path, ...args], terminal.terminal);
      expect(terminal.output()).not.toContain("private-test-hash");
      if (args[0] === "article") expect(terminal.output()).toContain("fox『动物』");
      if (args[0] === "show") { expect(terminal.output()).toContain("One"); expect(terminal.output()).toContain("Two"); expect(terminal.output()).not.toContain("Other account"); }
    }
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4);
  });
  test("starts with a compact neutral panel and opens help without touching a missing database", async () => {
    const missing = join(directory, "absent.db"), welcome = io(["quit"]);
    await runUserAdmin(["--db", missing], welcome.terminal);
    expect(welcome.output()).toContain("╭─ EngNote 用户管理");
    expect(welcome.output()).toContain("help 帮助");
    expect(welcome.output()).not.toContain("--backup-dir");
    expect(welcome.output()).not.toContain("\x1b");
    const help = io(); await runUserAdmin(["--db", missing, "--help"], help.terminal);
    expect(help.output()).toContain("--json"); expect(help.output()).toContain("DELETE 邮箱");
    expect(existsSync(missing)).toBe(false);
  });
  test("read-only JSON commands emit one document with raw data and no interaction", async () => {
    for (const args of [["list"], ["show", "1"], ["article", "1"]]) {
      const terminal = io([], { color: true });
      terminal.terminal.readLine = async () => { throw new Error("JSON must not prompt"); };
      await runUserAdmin(["--db", path, ...args, "--json"], terminal.terminal);
      const result = JSON.parse(terminal.output());
      expect(result.ok).toBe(true); expect(result.command).toBe(args[0]);
      expect(terminal.output().trim().split("\n")).toHaveLength(1);
      expect(terminal.output()).not.toContain("\x1b"); expect(terminal.output()).not.toContain("数据库：");
      expect(terminal.output()).not.toContain("private-test-hash");
      if (args[0] === "list") { expect(result.users).toHaveLength(2); expect(result.pageSize).toBe(50); }
      if (args[0] === "show") { expect(result.user.email).toBe("alice@example.com"); expect(result.articles).toHaveLength(2); }
      if (args[0] === "article") expect(result.article.content).toBe("fox『动物』");
    }
    const value = "Original\n\u202e\x1b[31m";
    db.query("UPDATE entries SET title = ? WHERE id = 1").run(value);
    const terminal = io(); await runUserAdmin(["--db", path, "article", "1", "--json"], terminal.terminal);
    expect(JSON.parse(terminal.output()).article.title).toBe(value);
    expect(terminal.output()).not.toContain("\u202e"); expect(terminal.output()).not.toContain("\x1b");
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4);
  });
  test("JSON cannot silently enter a prompt or bypass deletion confirmation", async () => {
    const terminal = io(["DELETE alice@example.com"]);
    for (const args of [[], ["delete", "1"]]) {
      await expect(runUserAdmin(["--db", path, ...args, "--json"], terminal.terminal)).rejects.toThrow("JSON 模式");
    }
    expect(terminal.output()).toBe(""); expect(count("users")).toBe(2); expect(count("entries")).toBe(4);
    expect(existsSync(backups)).toBe(false);
  });
  test("human errors provide a repair and terminal data cannot supply its own colors", async () => {
    const terminal = io(["show 999", "quit"], { color: true });
    await runUserAdmin(["--db", path], terminal.terminal);
    expect(terminal.output()).toContain("\x1b[31m错误\x1b[0m");
    expect(terminal.output()).toContain("处理"); expect(terminal.output()).toContain("bun users list");
    db.query("UPDATE entries SET title = ? WHERE id = 1").run("Injected\x1b[32m\u202e");
    const plain = io(); await runUserAdmin(["--db", path, "article", "1"], plain.terminal);
    expect(plain.output()).toContain("Injected\\u{1b}[32m\\u{202e}"); expect(plain.output()).not.toContain("\x1b");
  });
  test("escapes ANSI/OSC, bidi, C0 and carriage-return terminal injection", () => {
    expect(terminalText("Safe\x1b[2J\x1b]52;c;bad\x07\r\u202Eend\n\t")).toBe("Safe\\u{1b}[2J\\u{1b}]52;c;bad\\u{7}\\u{d}\\u{202e}end\n\t");
  });
});
describe("confirmed, backed-up account cascade deletion", () => {
  test("cancel, EOF, wrong confirmations, unknown users and duplicate deletion never delete extra data", async () => {
    for (const answer of [undefined, "", "yes", "DELETE bob@example.com"]) {
      const terminal = io([answer]); await runUserAdmin(["--db", path, "delete", "1"], terminal.terminal);
      expect(terminal.output()).toContain("已取消"); expect(count("users")).toBe(2); expect(count("entries")).toBe(4);
    }
    expect(existsSync(backups)).toBe(false);
    expect(previewUser(db, "999")).toBeNull();
    const preview = previewUser(db, "1")!; deleteUserWithArticles(db, preview, backups);
    expect(() => deleteUserWithArticles(db, preview, backups)).toThrow("发生变化");
    expect(count("users")).toBe(1); expect(count("entries")).toBe(2);
  });
  test("backs up a consistent WAL snapshot before deletion and deletes only this account's articles", () => {
    const preview = previewUser(db, "alice@example.com")!;
    const result = deleteUserWithArticles(db, preview, backups);
    expect(result.articles).toBe(2); expect(findUser(db, "alice@example.com")).toBeNull();
    expect(findUser(db, "bob@example.com")).not.toBeNull(); expect(viewArticle(db, 3)?.title).toBe("Bob"); expect(viewArticle(db, 4)?.owner_email).toBeNull();
    expect(lstatSync(backups).mode & 0o777).toBe(0o700); expect(lstatSync(result.backup).mode & 0o777).toBe(0o600);
    const backup = new Database(result.backup, { readonly: true });
    try { expect(listUsers(backup)).toHaveLength(2); expect(userArticles(backup, findUser(backup, "alice@example.com")!)).toHaveLength(2); expect(viewArticle(backup, 1)?.content).toBe("fox『animal』"); }
    finally { backup.close(); }
  });
  test("rechecks both account identity and article contents after preview before creating any backup", () => {
    const preview = previewUser(db, "1")!;
    db.query("UPDATE entries SET content = 'New edit' WHERE id = 1").run();
    expect(() => deleteUserWithArticles(db, preview, backups)).toThrow("重新查看");
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4); expect(existsSync(backups)).toBe(false);
  });
  test("backup failure or an unsafe backup directory leaves all data intact", () => {
    writeFileSync(backups, "not a directory");
    expect(() => deleteUserWithArticles(db, previewUser(db, "1")!, backups)).toThrow();
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4);
  });
  test("refuses world-readable and symbolic-link backup directories without deleting anything", () => {
    mkdirSync(backups, { mode: 0o700 }); chmodSync(backups, 0o755);
    expect(() => deleteUserWithArticles(db, previewUser(db, "1")!, backups)).toThrow("私有目录");
    const link = join(directory, "backup-link"); chmodSync(backups, 0o700); symlinkSync(backups, link);
    expect(() => deleteUserWithArticles(db, previewUser(db, "1")!, link)).toThrow("私有目录");
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4); expect(readdirSync(backups)).toHaveLength(0);
  });
  test("database failure rolls back both article and user deletion; the pre-delete backup remains valid", () => {
    db.exec("CREATE TRIGGER reject_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'blocked'); END;");
    expect(() => deleteUserWithArticles(db, previewUser(db, "1")!, backups)).toThrow("blocked");
    expect(count("users")).toBe(2); expect(count("entries")).toBe(4); expect(readdirSync(backups)).toHaveLength(1);
  });
  test("interactive terminal can inspect then explicitly delete and continue", async () => {
    const terminal = io(["show alice@example.com", "article 1", "delete alice@example.com", "DELETE alice@example.com", "list", "quit"]);
    await runUserAdmin(["--db", path, "--backup-dir", backups], terminal.terminal);
    expect(terminal.output()).toContain("fox『动物』"); expect(terminal.output()).toContain("及 2 篇文章");
    expect(count("users")).toBe(1); expect(count("entries")).toBe(2);
  });
  test("actual Bun command works with flags, piped confirmation and nonzero failures without secrets", async () => {
    const invoke = async (args: string[], input = "") => {
      const process = Bun.spawn([Bun.which("bun")!, "run", "users", "--db", path, "--backup-dir", backups, ...args], { cwd: resolve(import.meta.dir, ".."), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
      process.stdin.write(input); process.stdin.end();
      const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
      expect(stdout + stderr).not.toContain("private-test-hash"); return { stdout, stderr, code };
    };
    expect((await invoke(["article", "1"])).stdout).toContain("fox『动物』");
    const missing = await invoke(["show", "999"]); expect(missing.code).toBe(1); expect(missing.stderr).toContain("处理");
    for (const args of [["list"], ["show", "1"], ["article", "1"]]) {
      const result = await invoke([...args, "--json"]);
      expect(result.code).toBe(0); expect(JSON.parse(result.stdout).ok).toBe(true);
    }
    const rejected = await invoke(["delete", "1", "--json"], "DELETE alice@example.com\n");
    expect(rejected.code).toBe(1); expect(JSON.parse(rejected.stdout).error.code).toBe("INTERACTIVE_REQUIRED");
    expect(count("users")).toBe(2); expect(existsSync(backups)).toBe(false);
    const notFound = await invoke(["show", "999", "--json"]);
    expect(notFound.code).toBe(1); expect(JSON.parse(notFound.stdout).error.code).toBe("NOT_FOUND");
    const cancelled = await invoke(["delete", "1"]); expect(cancelled.stdout).toContain("已取消");
    const removed = await invoke(["delete", "1"], "DELETE alice@example.com\n"); expect(removed.code).toBe(0); expect(removed.stdout).toContain("及 2 篇文章");
    expect(count("users")).toBe(1); expect(count("entries")).toBe(2);
  });
});
