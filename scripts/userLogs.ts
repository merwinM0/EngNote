import { closeSync, fsyncSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readUserLogs, USER_LOG_EVENTS, type UserLogFilter, type UserLogRecord } from "../backend/userLogs";
import { openAdminDatabase } from "../backend/userAdmin";
import { CliError, successLine, terminalJSON, terminalPanel } from "../backend/terminal";
import type { AdminIO } from "./users";

export const userLogOptions = {
  user: { type: "string" }, since: { type: "string" }, event: { type: "string" },
  page: { type: "string" }, out: { type: "string" },
} as const;
type LogOptions = Partial<Record<keyof typeof userLogOptions, string>> & { json?: boolean };
const PAGE_SIZE = 50;
const usage = "运行 bun users --help 查看日志命令用法。";
const logUsage = (message: string) => new CliError(message, usage);
function positiveInteger(value: string, label: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw logUsage(`${label}必须是正安全整数。`);
  return number;
}

function exportLogs(path: string, logs: Iterable<UserLogRecord>): number {
  let fd: number;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") throw new CliError("导出路径已存在，不会覆盖。", "请为 --out 指定新的文件路径。", "EXPORT_EXISTS");
    throw new CliError("无法创建日志导出文件。", "检查 --out 的父目录是否存在且可写。", "EXPORT_OPEN_FAILED");
  }
  let count = 0;
  try {
    try {
      let chunk = '{"ok":true,"command":"logs export","logs":[';
      for (const log of logs) {
        chunk += (count++ ? ",\n" : "\n") + terminalJSON(log);
        if (chunk.length >= 64 * 1024) { writeFileSync(fd, chunk); chunk = ""; }
      }
      writeFileSync(fd, `${chunk}\n],"count":${count}}\n`);
      fsyncSync(fd);
    } finally { closeSync(fd); }
  } catch (error) {
    try { unlinkSync(path); }
    catch { throw new CliError("导出失败，未能清理不完整文件。", "请手动删除未完成的导出文件并检查目录权限。", "EXPORT_INCOMPLETE"); }
    throw error;
  }
  return count;
}

export function runUserLogs(dbPath: string, args: string[], options: LogOptions, io: AdminIO): void {
  const exporting = args.length === 1 && args[0] === "export";
  if (args.length && !exporting) throw logUsage("日志子命令不正确。");
  if (exporting && (!options.out?.trim() || options.page !== undefined)) throw logUsage("导出需指定 --out 文件路径，不能指定页码。");
  if (!exporting && options.out !== undefined) throw logUsage("--out 仅用于 logs export。");

  const now = Date.now(), filter: UserLogFilter = {};
  if (options.user !== undefined) filter.userId = positiveInteger(options.user, "用户 ID");
  if (options.since !== undefined) {
    if (!/^\d+d$/.test(options.since)) throw logUsage("时间范围须使用天数，例如 --since 7d。");
    const days = positiveInteger(options.since.slice(0, -1), "天数");
    if (days > 366) throw logUsage("时间范围最多 366 天；查询仍只返回保留期内的日志。");
    filter.since = now - days * 24 * 60 * 60 * 1000;
  }
  if (options.event !== undefined) {
    const event = USER_LOG_EVENTS.find(value => value === options.event);
    if (!event) throw new CliError("未知日志事件。", `可用类型：${USER_LOG_EVENTS.join("、")}。`);
    filter.event = event;
  }
  const page = options.page === undefined ? 1 : positiveInteger(options.page, "页码");
  const offset = (page - 1) * PAGE_SIZE;
  if (!Number.isSafeInteger(offset)) throw logUsage("页码超出范围。");

  const db = openAdminDatabase(dbPath);
  try {
    if (exporting) {
      const path = resolve(options.out!);
      const count = exportLogs(path, readUserLogs(db, filter, undefined, now));
      const result = options.json ? terminalJSON({ ok: true, command: "logs export", path, count })
        : successLine(`已导出 ${count} 条日志：${path.replace(/[\n\t]/g, " ")}`, io.color);
      io.write(result + "\n");
      return;
    }
    const logs = Array.from(readUserLogs(db, filter, { limit: PAGE_SIZE + 1, offset }, now));
    const hasMore = logs.length > PAGE_SIZE;
    if (hasMore) logs.pop();
    if (options.json) io.write(terminalJSON({ ok: true, command: "logs", page, pageSize: PAGE_SIZE, hasMore, logs }) + "\n");
    else {
      const rows = logs.map(log => [
        log.time, log.event, log.outcome === "success" ? "成功" : `失败 (${log.reason})`,
        log.userId === null ? "" : `用户 #${log.userId}`, log.articleId === null ? "" : `文章 #${log.articleId}`,
      ].filter(Boolean).join("  "));
      io.write(terminalPanel(`用户日志 / 第 ${page} 页`, rows.length ? rows : ["没有匹配的日志。"], io.columns) + "\n");
      if (hasMore) io.write(`还有更多日志，请使用相同筛选条件及 --page ${page + 1}。\n`);
    }
  } finally { db.close(); }
}
