/**
 * auth.ts - Email registration / login.
 *
 * - Passwords are stored as slow-hashed (Argon2id via Bun.password).
 * - Verification codes are stored in Redis (or in-memory fallback).
 * - Sessions are stored in Redis (or in-memory fallback) as random tokens.
 */

import { Database } from "bun:sqlite";
import { randomInt } from "node:crypto";
import { setex, get, delKey } from "./redis";
import { sendVerificationEmail } from "./mail";

export const CODE_TTL = 300; // seconds (5 min)
export const SESSION_TTL = 60 * 60 * 24; // 24 hours, shared with the browser cookie.
const CODE_EMAIL_PREFIX = "auth:code:";
const TOKEN_EMAIL_PREFIX = "auth:token:";

/** Dispatch a safe database instance (registered in index.ts). */
let db: Database;
export function initAuth(database: Database) {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------- Verification codes ----------------

/** Generate and send a 6-digit code for an email; returns true if sent. */
export async function requestCode(email: string): Promise<{ ok: boolean; error?: string; devCode?: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return { ok: false, error: "Invalid email address" };
  if (await get("auth:cooldown:" + e)) return { ok: false, error: "Please wait one minute before requesting another code" };
  await setex("auth:cooldown:" + e, 60, "1");
  const code = String(randomInt(100000, 1000000));
  const sent = await sendVerificationEmail(e, code, CODE_TTL / 60);
  const localDevelopment = process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST;
  if (!sent && !localDevelopment) return { ok: false, error: "Email could not be sent. Please try again later" };
  await setex(CODE_EMAIL_PREFIX + e, CODE_TTL, code);
  await delKey("auth:code-attempts:" + e);
  return { ok: true, devCode: sent ? undefined : code };
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const key = "auth:code-attempts:" + e;
  const attempts = Number(await get(key) ?? "0");
  if (attempts >= 5) return false;
  const expected = await get(CODE_EMAIL_PREFIX + e);
  if (expected !== null && expected === code.trim()) return true;
  await setex(key, CODE_TTL, String(attempts + 1));
  return false;
}

export async function consumeCode(email: string): Promise<void> {
  await delKey(CODE_EMAIL_PREFIX + email.trim().toLowerCase());
}

// ---------------- Registration ----------------

export async function register(
  email: string,
  password: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Invalid email address" };
  if (password.length < 6 || password.length > 128) return { ok: false, error: "Password must be 6–128 characters" };

  const exists = db.query("SELECT id FROM users WHERE email = ?").get(e);
  if (exists) return { ok: false, error: "Email already registered" };

  const valid = await verifyCode(e, code);
  if (!valid) return { ok: false, error: "Invalid or expired verification code" };

  await consumeCode(e);
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  const inserted = db.query("INSERT INTO users (email, password_hash) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").run(e, passwordHash);
  return Number(inserted.changes) ? { ok: true } : { ok: false, error: "Email already registered" };
}

// ---------------- Login ----------------

export async function login(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; email?: string; token?: string }> {
  const e = email.trim().toLowerCase();
  const attemptKey = "auth:login-attempts:" + e;
  const attempts = Number(await get(attemptKey) ?? "0");
  if (attempts >= 10) return { ok: false, error: "Too many attempts. Please try again in 15 minutes" };
  await setex(attemptKey, 900, String(attempts + 1));
  const row = db
    .query("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(e) as { id: number; email: string; password_hash: string } | undefined;
  if (!row) return { ok: false, error: "Email or password is incorrect" };

  const ok = await Bun.password.verify(password, row.password_hash);
  if (!ok) return { ok: false, error: "Email or password is incorrect" };

  await delKey(attemptKey);
  const token = crypto.randomUUID().replace(/-/g, "");
  await setex(TOKEN_EMAIL_PREFIX + token, SESSION_TTL, row.email);
  return { ok: true, email: row.email, token };
}

// ---------------- Session ----------------

export async function resolveToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  return get(TOKEN_EMAIL_PREFIX + token);
}

export async function logout(token: string): Promise<void> {
  await delKey(TOKEN_EMAIL_PREFIX + token);
}
