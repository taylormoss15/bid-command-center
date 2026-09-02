// ---------------------------------------------------------------------------
// Minimal Redis-over-REST client for Vercel KV / Upstash.
//
// Dependency-free on purpose: the whole product needs four commands. If no
// credentials are present every call returns null and `store.ts` falls back to
// the local JSON file, so a fresh clone runs with no setup at all.
//
// Vercel's KV integration injects KV_REST_API_URL / KV_REST_API_TOKEN; the
// Upstash marketplace variant uses UPSTASH_REDIS_REST_URL / _TOKEN.
// ---------------------------------------------------------------------------

function credentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function kvConfigured(): boolean {
  return credentials() !== null;
}

async function command(args: (string | number)[]): Promise<unknown> {
  const creds = credentials();
  if (!creds) return null;
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV request failed (${res.status})`);
  }
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV error: ${json.error}`);
  return json.result ?? null;
}

export async function kvGet(key: string): Promise<string | null> {
  const result = await command(["GET", key]);
  return typeof result === "string" ? result : null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await command(["SET", key, value]);
}

/** SET … NX EX — returns true only if this caller took the lock. */
export async function kvAcquire(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await command(["SET", key, "1", "NX", "EX", ttlSeconds]);
  return result === "OK";
}

export async function kvDelete(key: string): Promise<void> {
  await command(["DEL", key]);
}
