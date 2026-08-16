/**
 * English Reading - 本地静态服务器 + SQLite 数据库
 * 启动前会将前端 app.ts 编译打包为 public/dist/app.js
 * 运行：bun run index.ts
 *
 * API：
 *   GET    /api/entries           列出保存的文章（id, title, created_at）
 *   POST   /api/entries           保存文章（{ title, content }）
 *   GET    /api/entries/:id       获取单篇文章
 *   DELETE /api/entries/:id       删除一篇文章
 */

import { build } from "bun";
import { Database } from "bun:sqlite";

// 构建前端 bundle
console.log("▶ 构建前端 bundle...");
await build({
  entrypoints: ["./public/ts/main.ts"],
  outdir: "./public/dist",
  naming: "app.js",
  format: "esm",
  minify: false,
  sourcemap: "inline",
  target: "browser",
});
console.log("✓ 构建完成: public/dist/app.js");

// ---------------- SQLite 数据库 ----------------
const DB_PATH = "./data.db";
const db = new Database(DB_PATH, { create: true });
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
console.log(`✓ SQLite 就绪: ${DB_PATH}`);

const PORT = Number(process.env.PORT ?? 3000);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ---------------- API 路由 ----------------
async function handleApi(req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  // 文章列表
  if (path === "/api/entries" && method === "GET") {
    const rows = db
      .query("SELECT id, title, created_at FROM entries ORDER BY id DESC")
      .all();
    return json({ ok: true, entries: rows });
  }

  // 保存文章
  if (path === "/api/entries" && method === "POST") {
    let body: { title?: string; content?: string };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "无效的 JSON 请求体" }, 400);
    }
    const title = (body.title ?? "").trim();
    const content = (body.content ?? "").trim();
    if (!title || !content) {
      return json({ ok: false, error: "标题和内容不能为空" }, 400);
    }
    const info = db
      .query("INSERT INTO entries (title, content) VALUES (?, ?)")
      .run(title, content);
    return json({ ok: true, id: Number(info.lastInsertRowid), title }, 201);
  }

  // 获取 / 删除单篇文章
  const single = path.match(/^\/api\/entries\/(\d+)$/);
  if (single) {
    const id = Number(single[1]);
    if (method === "GET") {
      const row = db
        .query("SELECT id, title, content, created_at FROM entries WHERE id = ?")
        .get(id);
      if (!row) return json({ ok: false, error: "未找到该文章" }, 404);
      return json({ ok: true, entry: row });
    }
    if (method === "DELETE") {
      const info = db.query("DELETE FROM entries WHERE id = ?").run(id);
      if (Number(info.changes) === 0)
        return json({ ok: false, error: "未找到该文章" }, 404);
      return json({ ok: true, id });
    }
    if (method === "PUT") {
      // 更新文章内容（保留原标题）
      let body: { content?: string };
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: "无效的 JSON 请求体" }, 400);
      }
      const content = (body.content ?? "").trim();
      if (!content) {
        return json({ ok: false, error: "内容不能为空" }, 400);
      }
      const info = db
        .query("UPDATE entries SET content = ? WHERE id = ?")
        .run(content, id);
      if (Number(info.changes) === 0)
        return json({ ok: false, error: "未找到该文章" }, 404);
      return json({ ok: true, id });
    }
  }

  return json({ ok: false, error: "未知 API 请求" }, 404);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    // API 路由
    if (pathname.startsWith("/api/")) return handleApi(req, pathname);

    // 静态文件
    if (pathname === "/") pathname = "/index.html";
    const filePath = pathname.startsWith("/public/")
      ? pathname.slice(1)
      : `public${pathname}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const ext = filePath.substring(filePath.lastIndexOf("."));
      return new Response(file, {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
      });
    }

    return new Response("404 Not Found", { status: 404 });
  },
  error(error) {
    return new Response(`<pre>${error.message}</pre>`, {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`\n🚀 服务已启动: http://localhost:${PORT}`);
