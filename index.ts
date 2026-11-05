/** Source entry point. Development: bun dev. Production: bun start. */
import { networkInterfaces } from "node:os";
import { createServer, openDatabase } from "./backend/server";
import { closeStore } from "./backend/redis";

const rawPort = process.env.PORT ?? "3000";
const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
const db = openDatabase();
const server = createServer({ db, port });
console.log(`EngNote · http://localhost:${server.port}`);
console.log(process.env.NODE_ENV === "production" ? "Production mode · source execution" : "Development mode · Bun frontend HMR enabled");
if (server.hostname === "0.0.0.0") {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const net of interfaces ?? []) if (net.family === "IPv4" && !net.internal) console.log(`LAN · http://${net.address}:${server.port}`);
  }
}
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  await server.stop();
  await closeStore();
  db.close();
  clearTimeout(timeout);
  process.exit(0);
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
