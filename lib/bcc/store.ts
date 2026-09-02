import { constants as fsConstants, promises as fs } from "fs";
import os from "os";
import path from "path";
import lockfile from "proper-lockfile";

import type { Workspace } from "./auth";
import { kvAcquire, kvConfigured, kvDelete, kvGet, kvSet } from "./kv";
import { buildDemoSeed } from "./demo-seed";
import type { Database } from "./types";

// ---------------------------------------------------------------------------
// Persistence. The whole dataset is one JSON document, read in a single shot
// and written under a lock so two concurrent requests cannot clobber each
// other.
//
// Three backends, chosen automatically:
//
//   kv      when KV_REST_API_URL / UPSTASH_REDIS_REST_URL is set. For
//           serverless hosts (Vercel), where the filesystem is thrown away.
//   volume  when BCC_DATA_DIR is set. For a normal server — Coolify, Docker,
//           a VPS — where that path is a mounted volume that outlives the
//           container. Durable, and no external service to run.
//   file    neither. `./data` next to the source: zero setup for local work,
//           and NOT durable if the host replaces the filesystem on deploy.
//
// Nothing outside this file knows which one is live, and no caller reaches
// past `readDb` / `mutate`. Moving to Postgres later means reimplementing
// those two functions and nothing else.
// ---------------------------------------------------------------------------

/** Set BCC_DATA_DIR to a mounted volume when self-hosting. */
const CONFIGURED_DIR = process.env.BCC_DATA_DIR || path.join(process.cwd(), "data");

/**
 * A serverless host mounts the application directory read-only, so a first
 * deploy made before the KV store is connected would 500 on every request.
 * Fall back to the OS temp directory instead: the app comes up, stays usable,
 * and the amber "not durable" banner tells the truth about what is happening.
 */
let resolvedDir: string | null = null;
/** True once we have had to abandon the configured directory. */
let fellBackToTemp = false;

async function dataDir(): Promise<string> {
  if (resolvedDir) return resolvedDir;
  try {
    await fs.mkdir(CONFIGURED_DIR, { recursive: true });
    await fs.access(CONFIGURED_DIR, fsConstants.W_OK);
    resolvedDir = CONFIGURED_DIR;
  } catch {
    resolvedDir = path.join(os.tmpdir(), "bid-command-center");
    fellBackToTemp = true;
    await fs.mkdir(resolvedDir, { recursive: true });
    console.warn(
      `bcc: ${CONFIGURED_DIR} is not writable; falling back to ${resolvedDir}. ` +
        "Data will not survive a redeploy — connect a KV store or mount a volume.",
    );
  }
  return resolvedDir;
}

async function dbFile(ws: Workspace): Promise<string> {
  return path.join(await dataDir(), fileName(ws));
}
/**
 * Each workspace is a separate document. The live board starts empty — it is
 * for real work — while the demo board seeds itself with a generated pipeline.
 */
function kvKey(ws: Workspace): string {
  return ws === "demo" ? "bcc:demo:v1" : "bcc:db:v1";
}

function kvLockKey(ws: Workspace): string {
  return ws === "demo" ? "bcc:demo:lock" : "bcc:db:lock";
}

function fileName(ws: Workspace): string {
  return ws === "demo" ? "demo.json" : "db.json";
}

export type StorageBackend = "kv" | "volume" | "file";

export function storageBackend(): StorageBackend {
  if (kvConfigured()) return "kv";
  // A configured volume that turned out to be unwritable is not a volume.
  if (fellBackToTemp) return "file";
  return process.env.BCC_DATA_DIR ? "volume" : "file";
}

/**
 * Resolve the storage directory so `storageBackend()` reports the truth.
 * Only the health endpoint needs this — every other caller has already gone
 * through `readDb` or `mutate`.
 */
export async function ensureStorageResolved(): Promise<void> {
  if (!kvConfigured()) await dataDir();
}

/** Where writes actually land — surfaced in the UI so it is never a mystery. */
export function storageLocation(ws: Workspace = "live"): string {
  if (storageBackend() === "kv") return "hosted key-value store";
  return path.join(resolvedDir ?? CONFIGURED_DIR, fileName(ws));
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

async function fileRead(ws: Workspace): Promise<Database | null> {
  try {
    const raw = await fs.readFile(await dbFile(ws), "utf8");
    return normalize(JSON.parse(raw) as Database);
  } catch {
    return null;
  }
}

async function fileWrite(ws: Workspace, db: Database): Promise<void> {
  await fs.writeFile(await dbFile(ws), JSON.stringify(db, null, 2), "utf8");
}

// --- kv backend ------------------------------------------------------------

async function kvRead(ws: Workspace): Promise<Database | null> {
  const raw = await kvGet(kvKey(ws));
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw) as Database);
  } catch {
    return null;
  }
}

async function kvWrite(ws: Workspace, db: Database): Promise<void> {
  await kvSet(kvKey(ws), JSON.stringify(db));
}

/** Spin briefly for the write lock; a held lock expires on its own after 10s. */
async function kvLock(ws: Workspace): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (await kvAcquire(kvLockKey(ws), 10)) {
      return async () => {
        await kvDelete(kvLockKey(ws));
      };
    }
    await new Promise((r) => setTimeout(r, 60 + attempt * 20));
  }
  throw new Error("Could not acquire the write lock — try again in a moment.");
}

// --- public API ------------------------------------------------------------

/**
 * Read a workspace.
 *
 * The live board starts empty — it is for real work, and nothing should appear
 * in it that Taylor did not put there. The demo board seeds itself, and
 * reseeds whenever its data was generated on an earlier day, so every demo
 * opens on a pipeline with today's dates: things due today, bids closing this
 * week, installs running out across the next year.
 */
export async function readDb(ws: Workspace): Promise<Database> {
  const backend = storageBackend();
  const existing = backend === "kv" ? await kvRead(ws) : await fileRead(ws);

  if (ws === "demo") {
    const today = new Date().toISOString().slice(0, 10);
    if (!existing || existing.seededAt !== today) {
      const seeded = buildDemoSeed();
      seeded.seededAt = today;
      if (backend === "kv") await kvWrite(ws, seeded);
      else await fileWrite(ws, seeded);
      return seeded;
    }
    return existing;
  }

  return existing ?? emptyDb();
}

/** Read-modify-write under a lock. The mutator may return a value to pass back. */
export async function mutate<T>(
  ws: Workspace,
  fn: (db: Database) => T | Promise<T>,
): Promise<{ db: Database; result: T }> {
  const backend = storageBackend();
  const release = backend === "kv" ? await kvLock(ws) : await fileLock(ws);

  try {
    const db = await readDb(ws);
    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    if (backend === "kv") await kvWrite(ws, db);
    else await fileWrite(ws, db);
    return { db, result };
  } finally {
    await release();
  }
}

async function fileLock(ws: Workspace): Promise<() => Promise<void>> {
  const file = await dbFile(ws);
  try {
    await fs.access(file);
  } catch {
    await fileWrite(ws, emptyDb());
  }
  return lockfile.lock(file, {
    retries: { retries: 12, factor: 1.5, minTimeout: 40, maxTimeout: 1200 },
    stale: 10_000,
  });
}

/** Replace a workspace: `demo` rebuilds the sample pipeline, `empty` wipes it. */
export async function resetDb(
  ws: Workspace,
  mode: "demo" | "empty" = "demo",
): Promise<Database> {
  const next = mode === "empty" ? emptyDb() : buildDemoSeed();
  if (mode === "demo") next.seededAt = new Date().toISOString().slice(0, 10);
  if (storageBackend() === "kv") await kvWrite(ws, next);
  else await fileWrite(ws, next);
  return next;
}

/** Overwrite a workspace from a previously exported backup. */
export async function restoreDb(ws: Workspace, db: Database): Promise<Database> {
  const next = normalize(db);
  if (!next) throw new Error("Backup file is not a valid database");
  next.updatedAt = new Date().toISOString();
  if (storageBackend() === "kv") await kvWrite(ws, next);
  else await fileWrite(ws, next);
  return next;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}
