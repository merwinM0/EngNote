import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "engnote-startup-")); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
async function invoke(port: string, json: boolean) {
  const child = Bun.spawn([Bun.which("bun")!, "index.ts", ...(json ? ["--json"] : [])], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, NODE_ENV: "development", PORT: port, HOST: "127.0.0.1", DB_PATH: join(directory, "test.db"), REDIS_URL: "", SMTP_HOST: "", APP_ORIGIN: "", NO_COLOR: "1" },
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, code };
}
describe("actual source startup errors", () => {
  test("invalid ports report a problem and repair, without opening a database", async () => {
    const human = await invoke("invalid", false);
    expect(human.code).toBe(1); expect(human.stdout).toBe("");
    expect(human.stderr).toContain("端口设置无效"); expect(human.stderr).toContain("1–65535"); expect(human.stderr).toContain("╭─ 错误");
    const machine = await invoke("invalid", true);
    expect(machine.code).toBe(1); expect(machine.stderr).toBe("");
    expect(JSON.parse(machine.stdout)).toEqual({ ok: false, error: { code: "INVALID_PORT", message: "端口设置无效。", hint: "将 PORT 设为 1–65535 的整数后重试。" } });
    expect(existsSync(join(directory, "test.db"))).toBe(false);
  });
  test("occupied ports fail as a structured error instead of announcing a ready server", async () => {
    const blocker = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("reserved") });
    try {
      const result = await invoke(String(blocker.port), true);
      expect(result.code).toBe(1); expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);
      expect(output.ok).toBe(false); expect(output.error.code).toBe("PORT_IN_USE"); expect(output.error.hint).toContain("PORT");
      expect(result.stdout).not.toContain('"event":"ready"');
    } finally { await blocker.stop(true); }
  });
});
