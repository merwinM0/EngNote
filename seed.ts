/**
 * seed.ts - 创建三个测试账号
 *   账号: test1@test.com / test2@test.com / test3@test.com
 *   密码: 均为 123456（Argon2id 慢哈希后存入 SQLite）
 * 运行: bun run seed.ts
 */
import { Database } from "bun:sqlite";
import { initAuth } from "./backend/auth";

const DB_PATH = "./data.db";
const db = new Database(DB_PATH, { create: true });
initAuth(db);

const ACCOUNTS = [
  "test1@test.com",
  "test2@test.com",
  "test3@test.com",
];
const PASSWORD = "123456";

for (const email of ACCOUNTS) {
  const exists = db.query("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) {
    console.log(`已存在，跳过: ${email}`);
    continue;
  }
  // Argon2id 慢哈希
  const hash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });
  db.query("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
  console.log(`已创建: ${email}  (密码: ${PASSWORD})`);
}

console.log("\n测试账号就绪，可在网页上用邮箱+密码 123456 登录。");
