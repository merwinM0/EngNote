/**
 * auth.ts - Email registration / login.
 *
 * - Passwords are stored as slow-hashed (Argon2id via Bun.password).
 * - Verification codes are stored in Redis (or in-memory fallback).
 * - Sessions are stored in Redis (or in-memory fallback) as random tokens.
 */

import { Database } from "bun:sqlite";
import { setex, get, delKey } from "./redis";
import { sendVerificationEmail } from "./mail";

export const CODE_TTL = 300; // seconds (5 min)
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
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
  if (!EMAIL_RE.test(e)) return { ok: false, error: "Invalid email address" };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await setex(CODE_EMAIL_PREFIX + e, CODE_TTL, code);
  const sent = await sendVerificationEmail(e, code);
  return { ok: true, devCode: sent ? undefined : code };
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const expected = await get(CODE_EMAIL_PREFIX + e);
  return expected !== null && expected === code.trim();
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
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters" };

  const exists = db.query("SELECT id FROM users WHERE email = ?").get(e);
  if (exists) return { ok: false, error: "Email already registered" };

  const valid = await verifyCode(e, code);
  if (!valid) return { ok: false, error: "Invalid or expired verification code" };

  // Slow hash (Argon2id)
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(e, passwordHash);
  await consumeCode(e);
  return { ok: true };
}

// ---------------- Login ----------------

export async function login(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; email?: string; token?: string }> {
  const e = email.trim().toLowerCase();
  const row = db
    .query("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(e) as { id: number; email: string; password_hash: string } | undefined;
  if (!row) return { ok: false, error: "Email or password is incorrect" };

  const ok = await Bun.password.verify(password, row.password_hash);
  if (!ok) return { ok: false, error: "Email or password is incorrect" };

  const token = crypto.randomUUID().replace(/-/g, "");
  await setex(TOKEN_EMAIL_PREFIX + token, SESSION_TTL, row.email);
  return { ok: true, email: row.email, token };
}

// ---------------- Session ----------------

export async function resolveToken(token: string): Promise<string | null> {
  if (!token) return null;
  return get(TOKEN_EMAIL_PREFIX + token);
}

export async function logout(token: string): Promise<void> {
  await delKey(TOKEN_EMAIL_PREFIX + token);
}
