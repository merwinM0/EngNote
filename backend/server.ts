import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import home from "../public/home.html";
import reader from "../public/index.html";
import { initAuth, register, login, requestCode, resolveToken, logout, SESSION_TTL } from "./auth";
import { readDefinitionViews } from "../public/ts/definitionViews";
import type { DefinitionView } from "../public/ts/definitionViews";

const projectRoot = resolve(import.meta.dir, "..");
const COOKIE_NAME = "er_session";
export function openDatabase(path = process.env.DB_PATH || resolve(projectRoot, "data.db")): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), owner_email TEXT, definitions TEXT NOT NULL DEFAULT '[]'
  )`);
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(entries)").all();
  if (!columns.some(column => column.name === "owner_email")) db.exec("ALTER TABLE entries ADD COLUMN owner_email TEXT");
  if (!columns.some(column => column.name === "definitions")) db.exec("ALTER TABLE entries ADD COLUMN definitions TEXT NOT NULL DEFAULT '[]'");
  db.exec("CREATE INDEX IF NOT EXISTS entries_owner_id ON entries (owner_email, id)");
  initAuth(db);
  return db;
}
class HttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
}
async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError("Use an application/json request body.", 415);
  let value: unknown;
  try { value = await req.json(); } catch { throw new HttpError("Invalid JSON body.", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Expected a JSON object.", 400);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number, trim = true): string {
  if (typeof value !== "string") throw new HttpError(`${name} must be text.`, 400);
  const result = trim ? value.trim() : value;
  if (!result || result.length > max) throw new HttpError(`${name} must contain 1–${max} characters.`, 400);
  return result;
}
function token(req: Request): string {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) return bearer;
  return req.headers.get("cookie")?.split(/;\s*/).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? "";
}
function sessionCookie(req: Request, value: string, age: number) {
  const secure = process.env.COOKIE_SECURE === "true" || new URL(req.url).protocol === "https:";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
}
function allow(req: Request, methods: string[]) {
  if (!methods.includes(req.method)) return json({ ok: false, error: "Method not allowed." }, 405, { allow: methods.join(", ") });
}
type StoredEntry = { id: number; title: string; content: string; created_at: string; owner_email: string | null; definitions: string };
function storedDefinitions(raw: string, content: string): DefinitionView[] {
  try { return readDefinitionViews(JSON.parse(raw), content); } catch { return []; }
}
function requestDefinitions(value: unknown, content: string): DefinitionView[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError("Definitions must be an array of bilingual notes.", 400);
  // Old clients may omit the display choice; never overwrite an explicit en/zh choice.
  const normalized = value.map(item => item && typeof item === "object" && item.language === undefined ? { ...item, language: "en" } : item);
  const valid = readDefinitionViews(normalized, content);
  if (valid.length !== value.length) throw new HttpError("Each bilingual definition must match a unique English note in the article and contain valid Chinese.", 400);
  return valid.sort((a, b) => a.start - b.start);
}

export function createServer(options: { db: Database; port: number; hostname?: string }) {
  const { db } = options;
  const appOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : null;
  if (appOrigin && !/^https?:\/\//.test(appOrigin)) throw new Error("APP_ORIGIN must be an HTTP(S) origin.");
  async function handleApi(req: Request, path: string): Promise<Response> {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.get("origin");
      if (req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError("Cross-site writes are not allowed.", 403);
      if (origin && origin !== (appOrigin ?? new URL(req.url).origin)) throw new HttpError("Request origin does not match this server.", 403);
    }
    const authRoutes = ["send-code", "register", "login", "logout", "me"];
    const action = path.startsWith("/api/auth/") ? path.slice("/api/auth/".length) : "";
    if (authRoutes.includes(action)) {
      const invalidMethod = allow(req, action === "me" ? ["GET"] : ["POST"]);
      if (invalidMethod) return invalidMethod;
      if (action === "me") {
        const email = await resolveToken(token(req));
        return email ? json({ ok: true, email }) : json({ ok: false, error: "Please log in." }, 401);
      }
      if (action === "logout") { await logout(token(req)); return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) }); }
      const data = await body(req);
      const email = text(data.email, "Email", 254);
      if (action === "send-code") {
        const result = await requestCode(email);
        return json(result, result.ok ? 200 : 400);
      }
      const password = text(data.password, "Password", 128, false);
      if (action === "register") {
        const code = text(data.code, "Code", 6);
        const result = await register(email, password, code);
        return json(result, result.ok ? 201 : 400);
      }
      const result = await login(email, password);
      if (!result.ok || !result.token) return json({ ok: false, error: result.error }, 401);
      // Do not expose the token to browser JavaScript.
      return json({ ok: true, email: result.email }, 200, { "set-cookie": sessionCookie(req, result.token, SESSION_TTL) });
    }
    if (path === "/api/entries") {
      const invalidMethod = allow(req, ["GET", "POST"]);
      if (invalidMethod) return invalidMethod;
      const email = await resolveToken(token(req));
      if (!email) throw new HttpError("Please log in.", 401);
      if (req.method === "GET") {
        const rows = db.query<Pick<StoredEntry, "id" | "title" | "created_at">, [string]>("SELECT id, title, created_at FROM entries WHERE owner_email = ? ORDER BY id DESC").all(email);
        return json({ ok: true, entries: rows.map(entry => ({ ...entry, can_edit: true })) });
      }
      const data = await body(req);
      const title = text(data.title, "Title", 20);
      if (/\p{Script=Han}/u.test(title)) throw new HttpError("Use an English title.", 400);
      const content = text(data.content, "Content", 100000, false);
      if (!content.trim()) throw new HttpError("Content cannot be empty.", 400);
      const definitions = requestDefinitions(data.definitions, content);
      const result = db.query("INSERT INTO entries (title, content, owner_email, definitions) VALUES (?, ?, ?, ?)").run(title, content, email, JSON.stringify(definitions));
      return json({ ok: true, id: Number(result.lastInsertRowid), title }, 201);
    }
    const single = path.match(/^\/api\/entries\/(\d+)$/);
    if (single) {
      const invalidMethod = allow(req, ["GET", "PUT", "DELETE"]);
      if (invalidMethod) return invalidMethod;
      const email = await resolveToken(token(req));
      if (!email) throw new HttpError("Please log in.", 401);
      const id = Number(single[1]);
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError("Invalid article ID.", 400);
      // Scope every read/write lookup; unknown and inaccessible IDs are indistinguishable.
      const entry = db.query<StoredEntry, [number, string]>("SELECT * FROM entries WHERE id = ? AND owner_email = ?").get(id, email);
      if (!entry) throw new HttpError("Page not found.", 404);
      if (req.method === "GET") {
        const { owner_email, definitions, ...page } = entry;
        return json({ ok: true, entry: { ...page, definitions: storedDefinitions(definitions, page.content), can_edit: true } });
      }
      if (req.method === "DELETE") db.query("DELETE FROM entries WHERE id = ? AND owner_email = ?").run(id, email);
      else {
        const data = await body(req);
        const content = text(data.content, "Content", 100000, false);
        if (!content.trim()) throw new HttpError("Content cannot be empty.", 400);
        const definitions = "definitions" in data ? requestDefinitions(data.definitions, content) : storedDefinitions(entry.definitions, content);
        db.query("UPDATE entries SET content = ?, definitions = ? WHERE id = ? AND owner_email = ?").run(content, JSON.stringify(definitions), id, email);
      }
      return json({ ok: true, id });
    }
    return json({ ok: false, error: "API route not found." }, 404);
  }
  return Bun.serve({
    port: options.port, hostname: options.hostname ?? (process.env.HOST?.trim() || "0.0.0.0"),
    development: process.env.NODE_ENV === "production" ? false : { hmr: true, console: true },
    maxRequestBodySize: 1024 * 1024,
    routes: { "/": home, "/home.html": home, "/index.html": reader },
    async fetch(req) {
      const path = new URL(req.url).pathname;
      try {
        if (path === "/api" || path.startsWith("/api/")) return await handleApi(req, path);
        // Explicit allowlist: no arbitrary filesystem paths, source files, databases or .env files.
        if (path === "/icons/official") {
          const invalidMethod = allow(req, ["GET", "HEAD"]);
          if (invalidMethod) return invalidMethod;
          const icon = Bun.file(resolve(projectRoot, "public/icons/official"));
          if (await icon.exists()) {
            const bytes = new Uint8Array(await icon.slice(0, 4).arrayBuffer());
            const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : bytes[0] === 0x47 ? "image/gif" : "image/x-icon";
            return new Response(req.method === "HEAD" ? null : icon, { headers: { "content-type": type, "x-content-type-options": "nosniff" } });
          }
        }
        return new Response("Not found", { status: 404 });
      } catch (error) {
        if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status);
        console.error("Request failed:", error instanceof Error ? error.message : "Unknown error");
        return json({ ok: false, error: "The request could not be completed. Please try again." }, 500);
      }
    },
  });
}
