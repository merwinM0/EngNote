import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { defaultDatabasePath } from "../backend/database";
import { deleteUserWithArticles, findUser, listUsers, openAdminDatabase, previewUser, userArticles, viewArticle, USER_PAGE_SIZE, type AdminArticle, type AdminUser } from "../backend/userAdmin";
import { CliError, cliErrorOutput, statusPanel, successLine, terminalColor, terminalJSON, terminalPanel, terminalText, type TerminalRow } from "../backend/terminal";
import { readDefinitionViews } from "../public/ts/definitions/definitionViews";
import { wordExportText } from "../public/ts/word/wordExport";
import { runUserLogs, userLogOptions } from "./userLogs";

export type AdminIO = { columns?: number; color?: boolean; write(text: string): void; readLine(prompt: string): Promise<string | undefined> };
const helpRows = [
  "bun users [选项] [命令]；不带命令进入交互",
  "",
  ["list [邮箱/ID] [页码]  用户列表", "show <邮箱/ID>  用户与文章列表"],
  ["article <文章ID>  文章全文", "delete <邮箱/ID>  删除账号数据"],
  ["help  帮助", "quit  退出"],
  ["logs  查看用户日志", "logs export  导出 JSON"],
  "",
  ["--db 路径  指定数据库", "--backup-dir 目录  私有备份目录"],
  "--json  只读命令输出 JSON，不进入交互",
  "",
  `用户列表每页 ${USER_PAGE_SIZE} 人。`,
  "删除用户会一并删除全部文章及释义。",
  "删除前备份整个数据库，需输入 DELETE 邮箱确认。",
  "",
  "logs [--user ID] [--since 7d] [--event 类型] [--page 页码]",
  "logs export --out 文件 [--user ID] [--since 7d] [--event 类型]",
] as const satisfies readonly TerminalRow[];
const line = (io: AdminIO, text = "") => io.write(text + "\n");
const panel = (io: AdminIO, title: string, rows: readonly TerminalRow[]) => line(io, terminalPanel(title, rows, io.columns));
const showHelp = (io: AdminIO, json = false) => json
  ? line(io, terminalJSON({ ok: true, command: "help", help: helpRows.flat().join("\n") }))
  : panel(io, "用户管理 / 帮助", helpRows);
const singleLine = (value: string) => terminalText(value).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
function showUser(io: AdminIO, user: AdminUser, articles: AdminArticle[]) {
  panel(io, `用户 #${user.id}`, [
    `邮箱  ${singleLine(user.email)}`, `注册  ${singleLine(user.created_at)}`, `文章  ${user.article_count} 篇`, null,
    ...(articles.length ? articles.map(article => `#${article.id}  ${singleLine(article.title)} · ${article.characters} 字符 · ${singleLine(article.created_at)}`) : ["暂无文章。"]),
  ]);
}
async function command(dbPath: string, backupDirectory: string, args: string[], io: AdminIO, json = false) {
  const [action, target, pageValue] = args;
  if (action === "help") { showHelp(io, json); return; }
  if (!["list", "show", "article", "delete"].includes(action ?? "")) throw new CliError("未知命令。", "运行 bun users --help 查看可用命令。");
  if (action !== "list" && (!target || args.length !== 2) || action === "list" && args.length > 3) throw new CliError("命令参数不正确。", "运行 bun users --help 核对参数。");
  if (json && action === "delete") throw new CliError("JSON 模式不执行删除。", "使用 bun users delete <用户> 预览并手动确认。", "INTERACTIVE_REQUIRED");
  const db = openAdminDatabase(dbPath);
  try {
    if (action === "list") {
      const page = pageValue === undefined ? 1 : Number(pageValue);
      const users = listUsers(db, target, page);
      if (json) line(io, terminalJSON({ ok: true, command: "list", page, pageSize: USER_PAGE_SIZE, users }));
      else {
        panel(io, `用户列表 / 第 ${page} 页`, users.length ? users.map(user => `#${user.id}  ${singleLine(user.email)} | ${user.article_count} 篇 | ${singleLine(user.created_at)}`) : ["没有匹配的用户。"]);
        if (users.length === USER_PAGE_SIZE) line(io, `下一页：list ${singleLine(target || '""')} ${page + 1}`);
      }
    } else if (action === "show") {
      const user = findUser(db, target!); if (!user) throw new Error("用户不存在。");
      const articles = userArticles(db, user);
      if (json) line(io, terminalJSON({ ok: true, command: "show", user, articles })); else showUser(io, user, articles);
    } else if (action === "article") {
      const article = viewArticle(db, Number(target)); if (!article) throw new Error("文章不存在。");
      let definitions: ReturnType<typeof readDefinitionViews> = [];
      try { definitions = readDefinitionViews(JSON.parse(article.definitions), article.content); } catch { /* Old malformed metadata does not hide readable text. */ }
      const content = wordExportText(article.content, definitions);
      if (json) line(io, terminalJSON({ ok: true, command: "article", article: { id: article.id, title: article.title, owner_email: article.owner_email, created_at: article.created_at, content } }));
      else panel(io, `文章 #${article.id}`, [singleLine(article.title), `作者  ${singleLine(article.owner_email ?? "无作者历史文章")}`, `保存  ${singleLine(article.created_at)}`, null, content]);
    } else {
      const preview = previewUser(db, target!); if (!preview) throw new Error("用户不存在。");
      showUser(io, preview.user, preview.articles);
      line(io, statusPanel("删除确认", [`永久删除此用户及全部 ${preview.user.article_count} 篇文章、${preview.vocabulary} 条释义。`, "无法撤回；删除前备份整个数据库。"], "warning", io.columns, io.color));
      const answer = await io.readLine(`输入 DELETE ${singleLine(preview.user.email)} 确认，其他输入取消：`);
      if (answer !== `DELETE ${preview.user.email}`) { line(io, "已取消，未修改数据。"); return; }
      const writer = openAdminDatabase(dbPath, true);
      try {
        const result = deleteUserWithArticles(writer, preview, backupDirectory);
        line(io, successLine(`已删除用户 #${preview.user.id} 及 ${result.articles} 篇文章、${result.vocabulary} 条释义。`, io.color));
        line(io, `备份  ${singleLine(result.backup)}`);
      } finally { writer.close(); }
    }
  } finally { db.close(); }
}
export async function runUserAdmin(argv: string[], io: AdminIO): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv[0] === "--" ? argv.slice(1) : argv, allowPositionals: true, strict: true, options: { db: { type: "string" }, "backup-dir": { type: "string" }, help: { type: "boolean", short: "h" }, json: { type: "boolean" }, ...userLogOptions } });
  if (values.help || positionals[0] === "help") { showHelp(io, values.json); return; }
  if (values.db !== undefined && !values.db.trim()) throw new CliError("数据库路径为空。", "为 --db 指定已有数据库文件路径。");
  if (positionals[0] === "logs") {
    if (values["backup-dir"] !== undefined) throw new CliError("日志命令不使用 --backup-dir。", "导出日志时用 --out 指定文件。");
    runUserLogs(resolve(values.db || defaultDatabasePath()), positionals.slice(1), values, io);
    return;
  }
  if (Object.keys(userLogOptions).some(option => Object.hasOwn(values, option))) throw new CliError("日志筛选及导出选项仅用于 logs。", "运行 bun users --help 查看用法。");
  if (values.json && !positionals.length) throw new CliError("JSON 模式需要指定命令。", "例如：bun users list --json。");
  const path = resolve(values.db || defaultDatabasePath()), backups = resolve(values["backup-dir"] || join(dirname(path), ".engnote-backups"));
  if (positionals.length) { if (!values.json) line(io, `数据库：${singleLine(path)}`); await command(path, backups, positionals, io, values.json); return; }
  panel(io, "EngNote 用户管理", [
    `数据库  ${singleLine(path)}`,
    "",
    ["list 列表", "show <用户> 详情"],
    ["article <ID> 正文", "delete <用户> 删除"],
    ["help 帮助", "quit 退出"],
    ["logs 日志", "logs export 导出"],
  ]);
  while (true) {
    const input = await io.readLine("users> ");
    if (input === undefined || ["quit", "exit", "q"].includes(input.trim())) break;
    // Quoted empty search permits paging all users: list "" 2.
    const args = input.trim().match(/"[^"]*"|[^\s]+/g)?.map(value => value.startsWith('"') ? value.slice(1, -1) : value) ?? [];
    if (!args.length) continue;
    try {
      if (args[0] === "logs") {
        const { values, positionals } = parseArgs({ args: args.slice(1), allowPositionals: true, options: userLogOptions });
        runUserLogs(path, positionals, values, io);
      } else await command(path, backups, args, io);
    }
    catch (error) { line(io, cliErrorOutput(error, "users", false, io.columns, io.color)); }
  }
}
if (import.meta.main) {
  let reader: ReturnType<typeof createInterface> | undefined, iterator: AsyncIterator<string> | undefined;
  try {
    await runUserAdmin(Bun.argv.slice(2), {
      columns: process.stdout.columns, color: terminalColor(process.stdout.isTTY),
      write: text => { process.stdout.write(text); },
      readLine: async prompt => {
        if (!reader) { reader = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY && !!process.stdout.isTTY, crlfDelay: Infinity }); iterator = reader[Symbol.asyncIterator](); }
        process.stdout.write(prompt);
        try {
          const next = await iterator!.next();
          if (!process.stdin.isTTY || !process.stdout.isTTY) process.stdout.write("\n");
          return next.done ? undefined : next.value;
        } catch { return undefined; }
      },
    });
  } catch (error) {
    const json = Bun.argv.slice(2).includes("--json");
    const output = cliErrorOutput(error, "users", json, process.stderr.columns, terminalColor(process.stderr.isTTY));
    if (json) console.log(output); else console.error(output);
    process.exitCode = 1;
  }
  finally { reader?.close(); }
}
