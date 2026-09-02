import { promises as fs } from "fs";
import path from "path";
import lockfile from "proper-lockfile";

import { kvAcquire, kvConfigured, kvDelete, kvGet, kvSet } from "./kv";
import { buildSeed } from "./seed";
import type { Database } from "./types";

// ---------------------------------------------------------------------------
// Persistence. The whole dataset is one JSON document, read in a single shot
// and written under a lock so two concurrent requests cannot clobber each
// other.
//
// Two backends, chosen automatically:
//
//   KV     when KV_REST_API_URL / UPSTASH_REDIS_REST_URL is set. This is what
//          production uses — a serverless filesystem is ephemeral, so a
//          file-backed store would silently lose work between deploys.
//   file   otherwise. Zero setup, so `git clone && npm run dev` just works.
//
// Nothing outside this file knows which one is live, and no caller reaches
// past `readDb` / `mutate`. Moving to Postgres later means reimplementing
// those two functions and nothing else.
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const KV_KEY = "bcc:db:v1";
const KV_LOCK = "bcc:db:lock";

export function storageBackend(): "kv" | "file" {
  return kvConfigured() ? "kv" : "file";
}

function normalize(parsed: Partial<Database> | null): Database | null {
  if (!parsed) return null;
  return {
    projects: parsed.projects ?? [],
    recipients: parsed.recipients ?? [],
    organizations: parsed.organizations ?? [],
    activities: parsed.activities ?? [],
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

/** An empty database — what you want when the demo pipeline has served its purpose. */
export function emptyDb(): Database {
  return {
    projects: [],
    recipients: [],
    organizations: [],
    activities: [],
    updatedAt: new Date().toISOString(),
  };
}

// --- file backend ----------------------------------------------------------

async function fileRead(): Promise<Database | null> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return normalize(JSON.parse(raw) as Database);
  } catch {
    return null;
  }
}

async function fileWrite(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

// --- kv backend ------------------------------------------------------------

async function kvRead(): Promise<Database | null> {
  const raw = await kvGet(KV_KEY);
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw) as Database);
  } catch {
    return null;
  }
}

async function kvWrite(db: Database): Promise<void> {
  await kvSet(KV_KEY, JSON.stringify(db));
}

/** Spin briefly for the write lock; a held lock expires on its own after 10s. */
async function kvLock(): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (await kvAcquire(KV_LOCK, 10)) {
      return async () => {
        await kvDelete(KV_LOCK);
      };
    }
    await new Promise((r) => setTimeout(r, 60 + attempt * 20));
  }
  throw new Error("Could not acquire the write lock — try again in a moment.");
}

// --- public API ------------------------------------------------------------

/**
 * Read the database, seeding the demo pipeline the very first time. Seeding
 * happens once per store: after that an empty database stays empty, so
 * clearing the demo data does not bring it back on the next request.
 */
export async function readDb(): Promise<Database> {
  const backend = storageBackend();
  const existing = backend === "kv" ? await kvRead() : await fileRead();
  if (existing) return existing;

  const seeded = buildSeed();
  if (backend === "kv") await kvWrite(seeded);
  else await fileWrite(seeded);
  return seeded;
}

/** Read-modify-write under a lock. The mutator may return a value to pass back. */
export async function mutate<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<{ db: Database; result: T }> {
  const backend = storageBackend();
  const release =
    backend === "kv" ? await kvLock() : await fileLock();

  try {
    const db = await readDb();
    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    if (backend === "kv") await kvWrite(db);
    else await fileWrite(db);
    return { db, result };
  } finally {
    await release();
  }
}

async function fileLock(): Promise<() => Promise<void>> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fileWrite(buildSeed());
  }
  return lockfile.lock(DB_FILE, {
    retries: { retries: 12, factor: 1.5, minTimeout: 40, maxTimeout: 1200 },
    stale: 10_000,
  });
}

/** Replace everything: `demo` rebuilds the sample pipeline, `empty` wipes it. */
export async function resetDb(mode: "demo" | "empty" = "demo"): Promise<Database> {
  const next = mode === "empty" ? emptyDb() : buildSeed();
  if (storageBackend() === "kv") await kvWrite(next);
  else await fileWrite(next);
  return next;
}

/** Overwrite the store from a previously exported backup. */
export async function restoreDb(db: Database): Promise<Database> {
  const next = normalize(db);
  if (!next) throw new Error("Backup file is not a valid database");
  next.updatedAt = new Date().toISOString();
  if (storageBackend() === "kv") await kvWrite(next);
  else await fileWrite(next);
  return next;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}
