import type Redis from "ioredis";

// ---------------------------------------------------------------------------
// Redis access, over whichever transport the host actually provides.
//
//   REST  Upstash / Vercel KV inject KV_REST_API_URL + KV_REST_API_TOKEN (or
//         the UPSTASH_REDIS_REST_* naming). Preferred on serverless: stateless
//         HTTP, no connection to keep alive between invocations.
//   TCP   Redis Cloud, Coolify's own Redis service, or any self-hosted server
//         hand out a redis:// or rediss:// URL. Used when no REST credentials
//         are present.
//
// Whichever is available, the four operations the product needs look the same
// to `store.ts`. With neither, every call throws and the store falls back to
// its file backend.
// ---------------------------------------------------------------------------

type Transport = "rest" | "tcp" | "none";

function restCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

function tcpUrl(): string | null {
  const url =
    process.env.REDIS_URL ||
    process.env.KV_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_REDIS_URL;
  if (!url) return null;
  return /^rediss?:\/\//.test(url) ? url : null;
}

export function transport(): Transport {
  if (restCredentials()) return "rest";
  if (tcpUrl()) return "tcp";
  return "none";
}

export function kvConfigured(): boolean {
  return transport() !== "none";
}

// --- REST ------------------------------------------------------------------

async function restCommand(args: (string | number)[]): Promise<unknown> {
  const creds = restCredentials()!;
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis request failed (${res.status})`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result ?? null;
}

// --- TCP -------------------------------------------------------------------

// One connection per process, reused across invocations on a warm instance.
let client: Redis | null = null;

async function tcpClient(): Promise<Redis> {
  if (client) return client;
  const { default: IORedis } = await import("ioredis");
  client = new IORedis(tcpUrl()!, {
    // Fail fast rather than hanging a request behind an endless retry loop.
    maxRetriesPerRequest: 2,
    connectTimeout: 8_000,
    lazyConnect: false,
    enableOfflineQueue: true,
  });
  client.on("error", (err) => console.error("bcc: redis connection error", err));
  return client;
}

// --- public API ------------------------------------------------------------

export async function kvGet(key: string): Promise<string | null> {
  if (transport() === "rest") {
    const result = await restCommand(["GET", key]);
    return typeof result === "string" ? result : null;
  }
  return (await tcpClient()).get(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (transport() === "rest") {
    await restCommand(["SET", key, value]);
    return;
  }
  await (await tcpClient()).set(key, value);
}

/** SET … NX EX — true only if this caller took the lock. */
export async function kvAcquire(key: string, ttlSeconds: number): Promise<boolean> {
  if (transport() === "rest") {
    return (await restCommand(["SET", key, "1", "NX", "EX", ttlSeconds])) === "OK";
  }
  const result = await (await tcpClient()).set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function kvDelete(key: string): Promise<void> {
  if (transport() === "rest") {
    await restCommand(["DEL", key]);
    return;
  }
  await (await tcpClient()).del(key);
}
