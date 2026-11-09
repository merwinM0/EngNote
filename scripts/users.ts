import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { defaultDatabasePath } from "../backend/database";
import { deleteUserWithArticles, findUser, listUsers, openAdminDatabase, previewUser, terminalText, userArticles, viewArticle, USER_PAGE_SIZE, type AdminArticle, type AdminUser } from "../backend/userAdmin";
import { readDefinitionViews } from "../public/ts/definitionViews";
import { wordExportText } from "../public/ts/wordExport";

export type AdminIO = { write(text: string): void; readLine(prompt: string): Promise<string | undefined> };
const help = `EngNote 终端用户与文章管理（仅本机数据库权限，不提供网络管理接口）
用法：bun run users [--db 路径] [--backup-dir 私有目录] [命令]
  list [邮箱片段或ID] [页码]   查看用户，每页 ${USER_PAGE_SIZE} 人
  show <用户ID或邮箱>          查看用户及其全部文章列表
  article <文章ID>             直接查看保存的全文与当前语言释义
  delete <用户ID或邮箱>        确认后删除用户及其全部文章，先创建备份
  help / quit                 帮助 / 退出交互
不带命令进入交互模式。删除必须输入 DELETE 加目标邮箱；不会自动确认。
备份包含完整私有数据，目录权限必须为 700，备份文件为 600。`;
const line = (io: AdminIO, text = "") => io.write(text + "\n");
const singleLine = (value: string) => terminalText(value).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
function showUser(io: AdminIO, user: AdminUser, articles: AdminArticle[]) {
  line(io, `用户 #${user.id}  ${singleLine(user.email)}  注册：${singleLine(user.created_at)}  文章：${user.article_count}`);
  for (const article of articles) line(io, `  #${article.id}  ${singleLine(article.title)}  ${singleLine(article.created_at)}  ${article.characters} 字符`);
  if (!articles.length) line(io, "  没有保存的文章。");
}
async function command(dbPath: string, backupDirectory: string, args: string[], io: AdminIO) {
  const [action, target, pageValue] = args;
  if (action === "help") { line(io, help); return; }
  if (!["list", "show", "article", "delete"].includes(action ?? "")) throw new Error("未知命令，请输入 help。");
  if (action !== "list" && (!target || args.length !== 2) || action === "list" && args.length > 3) throw new Error("参数不正确，请输入 help 查看用法。");
  const db = openAdminDatabase(dbPath);
  try {
    if (action === "list") {
      const page = pageValue === undefined ? 1 : Number(pageValue);
      const users = listUsers(db, target, page);
      line(io, `用户列表 · 第 ${page} 页（每页 ${USER_PAGE_SIZE} 人）`);
      for (const user of users) line(io, `#${user.id}  ${singleLine(user.email)}  文章：${user.article_count}  注册：${singleLine(user.created_at)}`);
      if (!users.length) line(io, "没有匹配的用户。");
      if (users.length === USER_PAGE_SIZE) line(io, `可用 list ${target || '""'} ${page + 1} 查看下一页。`);
    } else if (action === "show") {
      const user = findUser(db, target!); if (!user) throw new Error("用户不存在。");
      showUser(io, user, userArticles(db, user));
    } else if (action === "article") {
      const article = viewArticle(db, Number(target)); if (!article) throw new Error("文章不存在。");
      let definitions: ReturnType<typeof readDefinitionViews> = [];
      try { definitions = readDefinitionViews(JSON.parse(article.definitions), article.content); } catch { /* Old malformed metadata does not hide readable text. */ }
      line(io, `文章 #${article.id}  ${singleLine(article.title)}\n作者：${singleLine(article.owner_email ?? "无作者历史文章")}\n保存：${singleLine(article.created_at)}\n--- 正文 ---`);
      line(io, terminalText(wordExportText(article.content, definitions)));
      line(io, "--- 正文结束 ---");
    } else {
      const preview = previewUser(db, target!); if (!preview) throw new Error("用户不存在。");
      showUser(io, preview.user, preview.articles);
      line(io, "危险操作：将永久删除该用户及以上全部文章，不能在网页撤回；执行前会备份整个数据库。");
      const answer = await io.readLine(`请输入 DELETE ${singleLine(preview.user.email)} 确认（其他输入或 EOF 取消）：`);
      if (answer !== `DELETE ${preview.user.email}`) { line(io, "已取消，未修改数据。"); return; }
      const writer = openAdminDatabase(dbPath, true);
      try {
        const result = deleteUserWithArticles(writer, preview, backupDirectory);
        line(io, `已删除用户 #${preview.user.id} 及 ${result.articles} 篇文章；该账号的旧会话已失效。`);
        line(io, `一致性备份：${singleLine(result.backup)}`);
      } finally { writer.close(); }
    }
  } finally { db.close(); }
}
export async function runUserAdmin(argv: string[], io: AdminIO): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv[0] === "--" ? argv.slice(1) : argv, allowPositionals: true, strict: true, options: { db: { type: "string" }, "backup-dir": { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals[0] === "help") { line(io, help); return; }
  if (values.db !== undefined && !values.db.trim()) throw new Error("数据库路径不能为空。");
  const path = resolve(values.db || defaultDatabasePath()), backups = resolve(values["backup-dir"] || join(dirname(path), ".engnote-backups"));
  line(io, `数据库：${singleLine(path)}`);
  if (positionals.length) { await command(path, backups, positionals, io); return; }
  line(io, help);
  while (true) {
    const input = await io.readLine("users> ");
    if (input === undefined || ["quit", "exit", "q"].includes(input.trim())) break;
    // Quoted empty search permits paging all users: list "" 2.
    const args = input.trim().match(/"[^"]*"|[^\s]+/g)?.map(value => value.startsWith('"') ? value.slice(1, -1) : value) ?? [];
    if (!args.length) continue;
    try { await command(path, backups, args, io); }
    catch (error) { line(io, `错误：${singleLine(error instanceof Error ? error.message : "操作失败。")}`); }
  }
}
if (import.meta.main) {
  let reader: ReturnType<typeof createInterface> | undefined, iterator: AsyncIterator<string> | undefined;
  try {
    await runUserAdmin(Bun.argv.slice(2), {
      write: text => { process.stdout.write(text); },
      readLine: async prompt => {
        if (!reader) { reader = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY && !!process.stdout.isTTY, crlfDelay: Infinity }); iterator = reader[Symbol.asyncIterator](); }
        process.stdout.write(prompt);
        try { const next = await iterator!.next(); return next.done ? undefined : next.value; } catch { return undefined; }
      },
    });
  } catch (error) { console.error(`错误：${singleLine(error instanceof Error ? error.message : "操作失败。")}`); process.exitCode = 1; }
  finally { reader?.close(); }
}
