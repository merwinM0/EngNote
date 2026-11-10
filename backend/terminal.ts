import { httpUrl } from "./config";

export type TerminalStatus = "error" | "warning" | "success";
const statusColors = { error: 31, warning: 33, success: 32 } as const;
export const terminalColor = (isTTY: boolean | undefined, env: Readonly<Record<string, string | undefined>> = process.env) => !!isTTY && env.NO_COLOR === undefined && env.TERM !== "dumb";
const statusLabel = (label: string, status: TerminalStatus, color: boolean) => color ? `\x1b[${statusColors[status]}m${label}\x1b[0m` : label;
export function statusPanel(title: string, lines: ReadonlyArray<string | null>, status: TerminalStatus, columns = 80, color = false): string {
  const panel = terminalPanel(title, lines, columns);
  return color ? panel.replace(title, statusLabel(title, status, true)) : panel;
}
export const successLine = (message: string, color = false) => `${statusLabel("完成", "success", color)}  ${terminalText(message)}`;
/** Keep JSON lossless while escaping invisible format controls for terminal/log safety. */
export function terminalJSON(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(/\p{Cf}/gu, character => character.split("").map(unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
}
export class CliError extends Error {
  constructor(message: string, readonly hint: string, readonly code = "USAGE") { super(message); }
}
export function cliProblem(error: unknown, context: "startup" | "users") {
  if (error instanceof CliError) return { code: error.code, message: error.message, hint: error.hint };
  const message = error instanceof Error ? error.message : "操作失败。";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "FAILED";
  if (code.startsWith("ERR_PARSE_ARGS")) return { code: "USAGE", message, hint: context === "users" ? "运行 bun users --help 查看用法。" : "启动选项仅支持 --json；监听地址等配置使用环境变量。" };
  if (/PORT must/.test(message)) return { code: "INVALID_PORT", message: "端口设置无效。", hint: "将 PORT 设为 1–65535 的整数后重试。" };
  if (code === "EADDRINUSE" || /address.*in use|port.*in use/i.test(message)) return { code: "PORT_IN_USE", message: "端口已被占用。", hint: "停止占用端口的进程，或修改 PORT 后重试。" };
  if (code === "ENOENT" || /unable to open database/i.test(message)) return { code: "DATABASE_PATH", message: "无法打开数据库路径。", hint: context === "users" ? "检查 --db 或 DB_PATH；首次使用请先启动应用创建数据库。" : "检查 DB_PATH，并确保父目录已创建且可写。" };
  if (code === "EACCES" || code === "EPERM") return { code: "PERMISSION", message, hint: "检查数据库文件及备份目录的归属和权限，不要开放公共读写权限。" };
  if (/私有目录/.test(message)) return { code: "UNSAFE_BACKUP", message, hint: "使用权限为 700 的非符号链接目录后重试。" };
  if (/不会自动迁移/.test(message)) return { code: "DATABASE_SCHEMA", message, hint: "先启动应用迁移数据库，再运行管理命令。" };
  if (/用户不存在/.test(message)) return { code: "NOT_FOUND", message, hint: "运行 bun users list 核对用户 ID 或邮箱。" };
  if (/文章不存在/.test(message)) return { code: "NOT_FOUND", message, hint: "运行 bun users show <用户> 查看文章 ID。" };
  if (/预览后发生变化/.test(message)) return { code: "PREVIEW_CHANGED", message, hint: "重新运行 delete 查看最新内容，再确认删除。" };
  return { code, message, hint: context === "users" ? "运行 bun users --help 核对用法，并检查数据库及备份目录。" : "检查 HOST、PORT 和 DB_PATH 配置后重试。" };
}
export function cliErrorOutput(error: unknown, context: "startup" | "users", json: boolean, columns = 80, color = false): string {
  const problem = cliProblem(error, context);
  return json ? terminalJSON({ ok: false, error: problem }) : statusPanel("错误", [problem.message, `处理  ${problem.hint}`], "error", columns, color);
}

/** Escape terminal commands and bidi/invisible controls while retaining readable multiline content. */
export function terminalText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, character => character === "\n" || character === "\t" ? character : `\\u{${character.codePointAt(0)!.toString(16)}}`);
}
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function wrapLine(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "", length = 0, breakAt = 0;
  for (const { segment } of graphemes.segment(text)) {
    const size = Bun.stringWidth(segment);
    while (length + size > width && line) {
      const cut = breakAt || line.length;
      lines.push(line.slice(0, cut)); line = line.slice(cut);
      length = Bun.stringWidth(line); breakAt = 0;
    }
    line += segment; length += size;
    if (/\s/u.test(segment)) breakAt = line.length;
  }
  lines.push(line);
  return lines;
}

/** Plain, injection-safe panels; null separates sections. No article content is truncated. */
export function terminalPanel(title: string, content: ReadonlyArray<string | null>, columns = 80): string {
  const available = Math.max(6, Math.min(88, Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 80));
  const heading = terminalText(title).replace(/\n/g, " ").replace(/\t/g, "    ");
  const lines = content.flatMap(line => line === null ? [null] : terminalText(line).replace(/\t/g, "    ").split("\n"));
  let desired = Math.max(40, Bun.stringWidth(heading) + 5);
  for (const line of lines) if (line !== null) desired = Math.max(desired, Bun.stringWidth(line) + 4);
  const width = Math.min(available, desired), inner = width - 4;
  const divider = `├${"─".repeat(width - 2)}┤`;
  const row = (text: string) => `│ ${text}${" ".repeat(Math.max(0, inner - Bun.stringWidth(text)))} │`;
  const output: string[] = [];
  if (Bun.stringWidth(heading) <= width - 5) output.push(`╭─ ${heading} ${"─".repeat(width - Bun.stringWidth(heading) - 5)}╮`);
  else {
    output.push(`╭${"─".repeat(width - 2)}╮`);
    for (const part of wrapLine(heading, inner)) output.push(row(part));
    output.push(divider);
  }
  for (const line of lines) {
    if (line === null) output.push(divider);
    else for (const part of wrapLine(line, inner)) output.push(row(part));
  }
  output.push(`╰${"─".repeat(width - 2)}╯`);
  return output.join("\n");
}

export function startupPanel(info: { port: number; pid: number; bunVersion: string; production: boolean }, columns = 80): string {
  return terminalPanel("EngNote", [
    `地址  ${httpUrl("localhost", info.port)}`,
    `模式  ${info.production ? "生产 / HMR 关闭" : "开发 / HMR 开启"}`,
    `PID   ${info.pid}`,
    `Bun   ${info.bunVersion}`,
  ], columns);
}
