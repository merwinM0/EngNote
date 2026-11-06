/** Source entry point. Development: bun dev. Production: bun start. */
import { networkInterfaces } from "node:os";
import { httpUrl, resolvePort } from "./backend/config";
import { createServer, openDatabase } from "./backend/server";
import { closeStore } from "./backend/redis";

const port = resolvePort();
const db = openDatabase();
const server = createServer({ db, port });
const listeningPort = server.port ?? port;
console.log(`EngNote · ${httpUrl("localhost", listeningPort)}`);
console.log(process.env.NODE_ENV === "production" ? "Production mode · source execution" : "Development mode · Bun frontend HMR enabled");
if (server.hostname === "0.0.0.0") {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const net of interfaces ?? []) if (net.family === "IPv4" && !net.internal) console.log(`LAN · ${httpUrl(net.address, listeningPort)}`);
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
