import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
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
  test("listens on all IPv4 interfaces by default, including an empty HOST", async () => {
    const previous = process.env.HOST;
    try {
      for (const host of [undefined, "", "   "]) {
        if (host === undefined) delete process.env.HOST; else process.env.HOST = host;
        const listener = createServer({ db, port: 0 });
        try {
          expect(listener.hostname).toBe("0.0.0.0");
          expect((await fetch(`http://127.0.0.1:${listener.port}/api/entries`)).status).toBe(200);
        } finally { await listener.stop(true); }
      }
    } finally {
      if (previous === undefined) delete process.env.HOST; else process.env.HOST = previous;
    }
  });
  test("respects an explicit loopback HOST and a caller hostname override", async () => {
    const previous = process.env.HOST;
    process.env.HOST = " 127.0.0.1 ";
    try {
      const configured = createServer({ db, port: 0 });
      try { expect(configured.hostname).toBe("127.0.0.1"); }
      finally { await configured.stop(true); }
      process.env.HOST = "0.0.0.0";
      const overridden = createServer({ db, port: 0, hostname: "127.0.0.1" });
      try { expect(overridden.hostname).toBe("127.0.0.1"); }
      finally { await overridden.stop(true); }
    } finally {
      if (previous === undefined) delete process.env.HOST; else process.env.HOST = previous;
    }
  });
  test("serves both HTML entries and returns real 404s", async () => {
    expect((await request("/")).status).toBe(200);
    expect((await request("/index.html")).status).toBe(200);
    for (const path of ["/.env", "/data.db", "/index.ts", "/public/ts/main.ts", "/%2e%2e%2f.env", "/missing.css"]) expect((await request(path)).status).toBe(404);
    const missing = await request("/api/missing");
    expect(missing.status).toBe(404); expect(missing.headers.get("content-type")).toContain("application/json");
  });
  test("serves EngNote branding on both pages", async () => {
    for (const path of ["/", "/index.html"]) {
      const html = await (await request(path)).text();
      expect(html).toContain("<title>EngNote</title>");
      expect(html).toContain('name="application-name" content="EngNote"');
      expect(html).toContain('<span class="brand-name">EngNote</span>');
      expect(html).toContain('aria-label="EngNote home"');
      expect(html).not.toMatch(/english[ _-]*reading/i);
    }
  });
  test("home explains English-first reading with optional Chinese in English copy", async () => {
    const html = await (await request("/")).text();
    expect(html).toContain('<h1 class="hero-title">Read English <em>your way</em></h1>');
    expect(html).toContain("Start with clear English definitions");
    expect(html).toContain("click a note in Read to see its Chinese meaning");
    expect(html).toContain("Each note remembers your choice when you refresh.");
    expect(html).toContain("AI creates English and Chinese definitions together.");
    expect(html).not.toContain("exclusively");
    expect(html).not.toContain("without translating into another language.");
    expect(html).not.toMatch(/\p{Script=Han}/u);
    expect(html).not.toContain("Stay in English. Slow down");
    expect(html).not.toMatch(/<footer\b/);
    expect(html).not.toContain('class="page-note"');
  });
  test("AI setup exposes an independent Zh/Eng default language toggle", async () => {
    const html = await (await request("/index.html")).text();
    const settings = html.match(/<dialog id="aiPanel"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    expect(settings).toContain('id="definitionLanguageBtn"');
    expect(settings).toContain('aria-label="Zh / Eng: Chinese first for new AI definitions"');
    expect(settings).toContain('aria-pressed="false"');
    expect(settings).toContain('data-definition-language="zh">Zh</span>');
    expect(settings).toContain('data-definition-language="en" class="is-active">Eng</span>');
    expect(settings).toContain("Existing notes keep their language.");
    expect(settings.match(/<form id="aiForm"[\s\S]*?<\/form>/)?.[0]).not.toContain('id="definitionLanguageBtn"');
  });
  test("reader starts with tools rather than a visible promotional heading", async () => {
    const html = await (await request("/index.html")).text();
    expect(html).not.toContain("Make room for a good story.");
    expect(html).not.toContain('class="notebook-heading"');
    expect(html).toContain('<h1 class="sr-only">Reading notebook</h1>');
    expect(html).toContain('aria-label="Reading tools"');
  });
  test("reader keeps saved articles and saving in modal notes, outside the reading layout", async () => {
    const html = await (await request("/index.html")).text();
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toContain('id="collectionBtn"');
    expect(header).toContain('aria-controls="collectionPanel"');
    expect(main).not.toContain('id="entryList"');
    expect(main).not.toContain('id="saveTitle"');
    expect(main).not.toContain('class="sidebar"');
    for (const id of ["savePanel", "collectionPanel", "deletePanel", "confirmPanel"]) expect(html).toContain(`<dialog id="${id}"`);
    expect(html).toContain("Leave the title blank and AI will sum up your article");
    expect(html).not.toContain("Every page and definition is saved together.");
    expect(html).toContain('id="titleProgress"');
  });
  test("collection pins its tapes and provides a bounded zoomable article canvas", async () => {
    const html = await (await request("/index.html")).text();
    const board = html.match(/<dialog id="collectionPanel"[\s\S]*?<\/dialog>/)?.[0] ?? "";
    expect(board).toContain('id="savedTitle">Saved articles</h2>');
    expect(board).toContain('id="refreshListBtn"');
    expect(board).toContain('aria-label="Close saved articles"');
    expect(board).toContain('id="entryList"');
    expect(board).toContain("board-tape-left");
    expect(board).toContain("board-tape-right");
    expect(board).toContain('id="collectionViewport"');
    expect(board).not.toMatch(/boardZoomRange|boardZoomLimits|boardZoomOutBtn|boardZoomInBtn|boardInstructions/);
    expect(board).not.toContain("Drag to move");
    expect(board).not.toContain("25%–200%");
    expect(board).toContain('id="boardZoomValue" class="sr-only"');
    expect(board).toContain('id="boardFitBtn"');
    expect(board).toContain('id="boardResetBtn"');
    expect(board).not.toMatch(/board-scribble|board-footer|board-doodle|class="eyebrow"|<svg/);
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
  test("saves and loads every page as one lossless article", async () => {
    const content = "  " + "A fox『an animal』 in 2026!\n\n".repeat(300) + "\t ";
    const saved = await request("/api/entries", "POST", { title: "Many pages", content }, alice);
    expect(saved.status).toBe(201);
    const id = (await saved.json()).id;
    expect((await (await request(`/api/entries/${id}`)).json()).entry.content).toBe(content);
    expect((await request(`/api/entries/${id}`, "PUT", { content: content + "\nLast page." }, alice)).status).toBe(200);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.content).toBe(content + "\nLast page.");
    expect((await request(`/api/entries/${id}`, "PUT", { content: "  \n " }, alice)).status).toBe(400);
  });
  test("saves bilingual definitions with articles and defaults shared views to English", async () => {
    const content = "A fox『an animal』 meets a bird『a flying animal』.";
    const definitions = [{ start: content.indexOf("『"), english: "an animal", chinese: "一种动物", language: "zh" },
      { start: content.lastIndexOf("『"), english: "a flying animal", chinese: "会飞的动物", language: "en" }];
    const saved = await request("/api/entries", "POST", { title: "Two languages", content, definitions }, alice);
    expect(saved.status).toBe(201);
    const id = (await saved.json()).id;
    const loaded = (await (await request(`/api/entries/${id}`)).json()).entry;
    expect(loaded.content).toBe(content);
    expect(loaded.definitions).toEqual(definitions.map(view => ({ ...view, language: "en" })));
    const updated = [{ ...definitions[0]!, chinese: "野生动物" }, definitions[1]!];
    expect((await request(`/api/entries/${id}`, "PUT", { content, definitions: updated }, bob)).status).toBe(403);
    expect((await request(`/api/entries/${id}`, "PUT", { content, definitions: updated }, alice)).status).toBe(200);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.definitions[0].chinese).toBe("野生动物");
    const list = (await (await request("/api/entries")).json()).entries;
    expect(list.find((entry: { id: number }) => entry.id === id)).not.toHaveProperty("definitions");
  });
  test("rejects malformed bilingual metadata atomically", async () => {
    const content = "A fox『an animal』 reads.", id = await create();
    const valid = { start: content.indexOf("『"), english: "an animal", chinese: "动物", language: "en" };
    for (const definitions of [null, {}, [null], [{ ...valid, start: 999 }], [{ ...valid, english: "different" }],
      [{ ...valid, chinese: "animal" }], [{ ...valid, chinese: "中".repeat(601) }], [valid, valid], [{ ...valid, chinese: "" }]]) {
      expect((await request(`/api/entries/${id}`, "PUT", { content, definitions }, alice)).status).toBe(400);
      expect((await request("/api/entries", "POST", { title: "Invalid pair", content, definitions }, alice)).status).toBe(400);
    }
    expect((await (await request(`/api/entries/${id}`)).json()).entry.content).toBe("A fox『an animal』 in 2025.");
  });
  test("older clients keep valid pairs and discard metadata for removed notes", async () => {
    const content = "A fox『an animal』 reads.", definitions = [{ start: 5, english: "an animal", chinese: "动物" }];
    const saved = await request("/api/entries", "POST", { title: "Compatibility", content, definitions }, alice);
    const id = (await saved.json()).id;
    expect((await request(`/api/entries/${id}`, "PUT", { content: content + " More." }, alice)).status).toBe(200);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.definitions).toHaveLength(1);
    expect((await request(`/api/entries/${id}`, "PUT", { content: "No annotations." }, alice)).status).toBe(200);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.definitions).toEqual([]);
    db.query("UPDATE entries SET definitions = 'invalid JSON' WHERE id = ?").run(id);
    expect((await (await request(`/api/entries/${id}`)).json()).entry.content).toBe("No annotations.");
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
  test("browser cookie and server session both expire exactly 24 hours after login", async () => {
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    try {
      const login = await request("/api/auth/login", "POST", { email: "alice@example.com", password: "password123" });
      expect(login.status).toBe(200);
      const header = login.headers.get("set-cookie")!;
      expect(header).toContain("Max-Age=86400");
      const cookie = header.split(";")[0]!;
      clock.mockReturnValue(now + 86400000 - 1);
      expect((await request("/api/auth/me", "GET", undefined, cookie)).status).toBe(200);
      clock.mockReturnValue(now + 86400000);
      expect((await request("/api/auth/me", "GET", undefined, cookie)).status).toBe(401);
      expect((await request("/api/entries", "POST", { title: "Expired", content: "Keep me" }, cookie)).status).toBe(401);
    } finally { clock.mockRestore(); }
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
  const dir = mkdtempSync(join(tmpdir(), "engnote-test-"));
  const path = join(dir, "legacy.db");
  const old = new Database(path);
  old.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))); INSERT INTO entries (title, content) VALUES ('Old story', 'Original text.');");
  old.close();
  const migrated = openDatabase(path);
  try { expect(migrated.query("SELECT title, content, owner_email, definitions FROM entries").get()).toEqual({ title: "Old story", content: "Original text.", owner_email: null, definitions: "[]" }); }
  finally { migrated.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("adds bilingual storage without changing existing ownership or annotations", () => {
  const dir = mkdtempSync(join(tmpdir(), "engnote-owned-migration-")), path = join(dir, "legacy.db");
  const old = new Database(path);
  old.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), owner_email TEXT); INSERT INTO entries (title, content, owner_email) VALUES ('Owned story', 'A fox『an animal』 reads.', 'alice@example.com');");
  old.close();
  const migrated = openDatabase(path);
  try {
    expect(migrated.query("SELECT title, content, owner_email, definitions FROM entries").get()).toEqual({
      title: "Owned story", content: "A fox『an animal』 reads.", owner_email: "alice@example.com", definitions: "[]",
    });
  } finally { migrated.close(); rmSync(dir, { recursive: true, force: true }); }
});
