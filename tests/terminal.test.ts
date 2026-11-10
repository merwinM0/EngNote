import { describe, expect, test } from "bun:test";
import { CliError, cliErrorOutput, cliProblem, startupPanel, statusPanel, successLine, terminalColor, terminalJSON, terminalPanel } from "../backend/terminal";

function aligned(output: string, columns: number) {
  const widths = output.split("\n").map(line => Bun.stringWidth(line));
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeLessThanOrEqual(columns);
}
describe("plain terminal panels", () => {
  test("aligns CJK, combining characters and emoji without decorative colors", () => {
    for (const columns of [12, 20, 40, 80, 120]) {
      const output = terminalPanel("用户管理", ["English 中文 🌿 e\u0301", null, "完整内容"], columns);
      aligned(output, Math.min(columns, 88));
      expect(output).toContain("e\u0301"); expect(output).not.toContain("\x1b");
    }
  });
  test("wraps long titles and complete article bodies instead of truncating", () => {
    const title = "用户".repeat(30), body = "w".repeat(100000);
    const output = terminalPanel(title, [body], 20);
    aligned(output, 20);
    const text = output.split("\n").filter(line => line.startsWith("│ ")).map(line => line.slice(2, -2).trimEnd()).join("");
    expect(text).toBe(title + body);
  });
  test("preserves paragraph gaps, expands tabs and escapes terminal injection", () => {
    const output = terminalPanel("正文", ["first\n\nlast\tword\x1b[2J\u202E"]);
    expect(output).toContain("last    word\\u{1b}[2J\\u{202e}");
    expect(output).not.toContain("\x1b"); expect(output).not.toContain("\u202E");
    expect(output.split("\n").filter(line => /^│ +│$/.test(line))).toHaveLength(1);
  });
  test("prefers whitespace boundaries so short commands and IDs are not split", () => {
    const output = terminalPanel("错误", ["处理  运行 bun users list 核对用户 ID 或邮箱。"], 40);
    aligned(output, 40); expect(output).toContain("ID");
    expect(output.split("\n").some(line => line.includes(" I ") && !line.includes("ID"))).toBe(false);
  });
  test("handles invalid terminal dimensions without negative padding", () => {
    for (const columns of [0, -1, NaN, Infinity, 6]) aligned(terminalPanel("标题", ["正文"], columns), columns === 6 ? 6 : 80);
  });
});
describe("semantic statuses and machine output", () => {
  test("only enables semantic colors on a capable TTY without NO_COLOR", () => {
    expect(terminalColor(true, {})).toBe(true);
    expect(terminalColor(false, {})).toBe(false);
    expect(terminalColor(undefined, {})).toBe(false);
    expect(terminalColor(true, { NO_COLOR: "" })).toBe(false);
    expect(terminalColor(true, { TERM: "dumb" })).toBe(false);
    expect(statusPanel("删除确认", ["删除前备份。"], "warning", 40, true)).toContain("\x1b[33m删除确认\x1b[0m");
    expect(successLine("已删除。", true)).toBe("\x1b[32m完成\x1b[0m  已删除。");
    expect(successLine("已删除。")).toBe("完成  已删除。");
  });
  test("errors explain the problem and a specific repair without icons or stacks", () => {
    const scenarios = [
      [new Error("PORT must be an integer between 1 and 65535."), "1–65535"],
      [Object.assign(new Error("address already in use"), { code: "EADDRINUSE" }), "修改 PORT"],
      [Object.assign(new Error("not found"), { code: "ENOENT" }), "DB_PATH"],
      [new Error("用户不存在。"), "bun users list"],
      [new Error("文章不存在。"), "bun users show"],
      [new Error("备份目录必须是非符号链接的私有目录；未删除数据。"), "700"],
    ] as const;
    for (const [error, hint] of scenarios) {
      const output = cliErrorOutput(error, "users", false);
      expect(output).toContain("错误"); expect(output).toContain("处理"); expect(output).toContain(hint);
      expect(output).not.toContain(" at "); expect(output).not.toMatch(/[✓✗⚠✅❌]/u);
    }
    expect(cliProblem(new CliError("需要命令。", "使用 list。", "USAGE"), "users")).toEqual({ code: "USAGE", message: "需要命令。", hint: "使用 list。" });
  });
  test("JSON is a single lossless document, with no panels or raw terminal controls", () => {
    const data = { text: "中文\n\t\x1b[2J\u202E\u200d", ok: true };
    const output = terminalJSON(data);
    expect(JSON.parse(output)).toEqual(data);
    expect(output).not.toMatch(/[\n\t\x1b\u202E\u200d]/u);
    const error = JSON.parse(cliErrorOutput(new Error("用户不存在。"), "users", true, 40, true));
    expect(error).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "用户不存在。", hint: "运行 bun users list 核对用户 ID 或邮箱。" } });
  });
});
describe("startup display", () => {
  test("shows only the localhost link with actual runtime metadata", () => {
    const output = startupPanel({ port: 3000, pid: 4321, bunVersion: "1.3.14", production: false });
    expect(output.match(/http:\/\/[^\s]+/g)).toEqual(["http://localhost:3000"]);
    for (const value of ["EngNote", "PID   4321", "Bun   1.3.14", "开发 / HMR 开启"]) expect(output).toContain(value);
    expect(output).not.toContain("LAN"); expect(output).not.toContain("\x1b"); aligned(output, 80);
  });
  test("production and narrow terminals retain correct mode, port and alignment", () => {
    const output = startupPanel({ port: 80, pid: 4321, bunVersion: "1.3.14", production: true }, 32);
    expect(output).toContain("http://localhost"); expect(output).not.toContain(":80"); expect(output).toContain("生产 / HMR 关闭"); aligned(output, 32);
  });
});
