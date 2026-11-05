import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// No real SMTP, Redis, or user database may be touched by tests.
process.env.NODE_ENV = "test";
process.env.REDIS_URL = "";
process.env.SMTP_HOST = "";
process.env.COOKIE_SECURE = "false";
process.env.APP_ORIGIN = "";
const { createServer, openDatabase } = await import("../backend/server");
const { closeStore } = await import("../backend/redis");
let db: Database;
let server: ReturnType<typeof createServer>;
let alice: string;
let bob: string;
async function request(path: string, method = "GET", data?: unknown, cookie?: string, extra?: Record<string, string>) {
  return fetch(new URL(path, server.url), { method, headers: { ...(data === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
async function create(cookie = alice) {
  const response = await request("/api/entries", "POST", { title: "My page", content: "A fox『an animal』 in 2025." }, cookie);
  expect(response.status).toBe(201);
  return (await response.json()).id as number;
}
beforeAll(async () => {
  db = openDatabase(":memory:");
  const hash = await Bun.password.hash("password123", { algorithm: "argon2id" });
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?), (?, ?)").run("alice@example.com", hash, "bob@example.com", hash);
  server = createServer({ db, port: 0, hostname: "127.0.0.1" });
  const login = await request("/api/auth/login", "POST", { email: "alice@example.com", password: "password123" });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict");
  expect((await login.json()).token).toBeUndefined();
  alice = cookie.split(";")[0]!;
  const second = await request("/api/auth/login", "POST", { email: "bob@example.com", password: "password123" });
  bob = second.headers.get("set-cookie")!.split(";")[0]!;
});
afterAll(async () => { await server?.stop(true); db?.close(); await closeStore(); });

describe("source server", () => {
  test("serves both HTML entries and returns real 404s", async () => {
    expect((await request("/")).status).toBe(200);
    expect((await request("/index.html")).status).toBe(200);
    for (const path of ["/.env", "/data.db", "/index.ts", "/public/ts/main.ts", "/%2e%2e%2f.env", "/missing.css"]) expect((await request(path)).status).toBe(404);
    const missing = await request("/api/missing");
    expect(missing.status).toBe(404); expect(missing.headers.get("content-type")).toContain("application/json");
  });
  test("requires a real session for writes", async () => {
    expect((await request("/api/entries", "POST", { title: "Hi", content: "Hi" })).status).toBe(401);
    expect((await request("/api/auth/me", "GET", undefined, alice)).status).toBe(200);
  });
  test("supports CRUD with author-only updates and deletes", async () => {
    const id = await create();
    const page = await (await request(`/api/entries/${id}`)).json();
    expect(page.entry.content).toContain("『an animal』");
    expect(page.entry.can_edit).toBe(false); expect(page.entry.owner_email).toBeUndefined();
    expect((await request(`/api/entries/${id}`, "PUT", { content: "No" }, bob)).status).toBe(403);
    expect((await request(`/api/entries/${id}`, "DELETE", undefined, bob)).status).toBe(403);
    expect((await request(`/api/entries/${id}`, "PUT", { content: "Updated." }, alice)).status).toBe(200);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.content).toBe("Updated.");
    expect((await request(`/api/entries/${id}`, "DELETE", undefined, alice)).status).toBe(200);
    expect((await request(`/api/entries/${id}`)).status).toBe(404);
  });
  test("historical articles stay readable but cannot be claimed or deleted", async () => {
    const info = db.query("INSERT INTO entries (title, content) VALUES ('Legacy', 'Keep me')").run();
    const id = Number(info.lastInsertRowid);
    expect((await request(`/api/entries/${id}`)).status).toBe(200);
    expect((await request(`/api/entries/${id}`, "DELETE", undefined, alice)).status).toBe(403);
  });
  test("validates runtime JSON types, lengths and content types", async () => {
    for (const data of [null, [], { title: 3, content: "Hi" }, { title: "Hi", content: {} }, { title: "中文", content: "Hi" }, { title: "a".repeat(21), content: "Hi" }, { title: "Hi", content: "a".repeat(100001) }]) {
      expect((await request("/api/entries", "POST", data, alice)).status).toBe(400);
    }
    const invalid = await fetch(new URL("/api/entries", server.url), { method: "POST", headers: { cookie: alice, "content-type": "application/json" }, body: "{" });
    expect(invalid.status).toBe(400);
    expect((await request("/api/entries", "POST", undefined, alice)).status).toBe(415);
  });
  test("enforces method and same-origin contracts", async () => {
    const invalid = await request("/api/entries", "PATCH");
    expect(invalid.status).toBe(405); expect(invalid.headers.get("allow")).toBe("GET, POST");
    expect((await request("/api/entries", "POST", { title: "Hi", content: "Hi" }, alice, { origin: "https://evil.example" })).status).toBe(403);
    expect((await request("/api/entries", "POST", { title: "Hi", content: "Hi" }, alice, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
  test("registration validates and consumes development codes with cooldown", async () => {
    const email = "new@example.com";
    const code = (await (await request("/api/auth/send-code", "POST", { email })).json()).devCode;
    expect(code).toMatch(/^\d{6}$/);
    expect((await request("/api/auth/send-code", "POST", { email })).status).toBe(400);
    expect((await request("/api/auth/register", "POST", { email, password: "password123", code })).status).toBe(201);
    expect((await request("/api/auth/register", "POST", { email, password: "password123", code })).status).toBe(400);
  });
  test("logout invalidates the session and clears the cookie", async () => {
    const login = await request("/api/auth/login", "POST", { email: "alice@example.com", password: "password123" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const out = await request("/api/auth/logout", "POST", undefined, cookie);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await request("/api/auth/me", "GET", undefined, cookie)).status).toBe(401);
  });
});

test("migrates the old schema without losing articles", () => {
  const dir = mkdtempSync(join(tmpdir(), "english-reading-test-"));
  const path = join(dir, "legacy.db");
  const old = new Database(path);
  old.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))); INSERT INTO entries (title, content) VALUES ('Old story', 'Original text.');");
  old.close();
  const migrated = openDatabase(path);
  try { expect(migrated.query("SELECT title, content, owner_email FROM entries").get()).toEqual({ title: "Old story", content: "Original text.", owner_email: null }); }
  finally { migrated.close(); rmSync(dir, { recursive: true, force: true }); }
});
