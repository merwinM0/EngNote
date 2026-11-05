/**
 * redis.ts - Redis client wrapper for email verification codes.
 *
 * Uses the `redis` npm package. If Redis is unreachable (e.g. server not
 * installed), it gracefully falls back to an in-memory Map so the app still
 * runs. The fallback is clearly NOT persistent and only intended for dev.
 */

import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// Fallback in-memory store: Map<key, { value, expiresAt }>
const memory = new Map<string, { value: string; expiresAt: number }>();

let client: RedisClientType | null = null;
let usingMemory = true;
let connectPromise: Promise<boolean> | null = null;

// Nil-safety: the `redis` package's error events
async function getClient(): Promise<RedisClientType | null> {
  if (client) return client;
  if (REDIS_URL === "") {
    if (process.env.NODE_ENV === "production") throw new Error("Production sessions require Redis.");
    return null;
  }
  if (!connectPromise) {
    connectPromise = (async () => {
      const c = createClient({
        url: REDIS_URL,
        socket: {
          // 连不上时快速失败，而不是无限重试挂起
          connectTimeout: 2000,
          reconnectStrategy: () => false, // 禁止自动重连，失败即降级内存
        },
        disableOfflineQueue: true,
        pingInterval: 0,
      });
      c.on("error", () => {
        /* ignore; will fall back to memory */
      });
      try {
        await c.connect();
        // 连接成功后再 ping 确认可用
        await c.ping();
        client = c;
        usingMemory = false;
        console.log("✓ Redis 就绪");
        return true;
      } catch {
        usingMemory = true;
        console.warn("⚠ Redis 不可用，验证码/会话将存入内存（仅开发用）");
        try {
          c.destroy();
        } catch {
          /* ignore */
        }
        return false;
      }
    })();
  }
  await connectPromise;
  if (!client && process.env.NODE_ENV === "production") throw new Error("Production sessions require Redis.");
  return client;
}

/** Whether Redis (true) or in-memory (false) is currently used. */
export function usingRedis(): boolean {
  return !usingMemory;
}

/** Store a value with a TTL (seconds). */
export async function setex(key: string, ttlSeconds: number, value: string): Promise<void> {
  const c = await getClient();
  if (c) {
    await c.setEx(key, ttlSeconds, value);
    return;
  }
  for (const [storedKey, item] of memory) if (item.expiresAt <= Date.now()) memory.delete(storedKey);
  if (memory.size >= 10000 && !memory.has(key)) throw new Error("Development session store is full.");
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Fetch a value, or null if missing or expired. */
export async function get(key: string): Promise<string | null> {
  const c = await getClient();
  if (c) {
    return c.get(key);
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

/** Delete a key. */
export async function delKey(key: string): Promise<void> {
  const c = await getClient();
  if (c) {
    await c.del(key);
    return;
  }
  memory.delete(key);
}

/** Release sockets when the source server restarts or shuts down. */
export async function closeStore(): Promise<void> {
  if (client) client.destroy();
  client = null;
  connectPromise = null;
  usingMemory = true;
}
