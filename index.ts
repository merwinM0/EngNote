/** Source entry point. Development: bun dev. Production: bun start. */
import { parseArgs } from "node:util";
import { httpUrl, resolvePort } from "./backend/config";
import { cliErrorOutput, startupPanel, terminalColor, terminalJSON } from "./backend/terminal";
import { createServer, openDatabase } from "./backend/server";
import { closeStore } from "./backend/redis";

let db: ReturnType<typeof openDatabase> | undefined, server: ReturnType<typeof createServer> | undefined;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  await server?.stop();
  await closeStore();
  db?.close();
  clearTimeout(timeout);
  process.exit(0);
}
const args = Bun.argv.slice(2), json = args.includes("--json");
try {
  parseArgs({ args: args[0] === "--" ? args.slice(1) : args, strict: true, options: { json: { type: "boolean" } } });
  const port = resolvePort(), production = process.env.NODE_ENV === "production";
  db = openDatabase();
  server = createServer({ db, port });
  const info = { port: server.port ?? port, pid: process.pid, bunVersion: Bun.version, production };
  const ready = { ok: true, event: "ready", url: httpUrl("localhost", info.port), mode: production ? "production" : "development", pid: info.pid, bunVersion: info.bunVersion, hmr: !production };
  console.log(json ? terminalJSON(ready) : startupPanel(info, process.stdout.columns));
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
} catch (error) {
  await server?.stop(true);
  await closeStore();
  db?.close();
  const output = cliErrorOutput(error, "startup", json, process.stderr.columns, terminalColor(process.stderr.isTTY));
  if (json) console.log(output); else console.error(output);
  process.exitCode = 1;
}
