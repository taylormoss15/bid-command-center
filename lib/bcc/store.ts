import { promises as fs } from "fs";
import path from "path";
import lockfile from "proper-lockfile";

import { buildSeed } from "./seed";
import type { Database } from "./types";

// ---------------------------------------------------------------------------
// Persistence. A single JSON document on disk, guarded by an advisory lock so
// two concurrent requests can't clobber each other's write.
//
// This is deliberately boring: the whole dataset is a few hundred KB, it reads
// in one shot, and it exports cleanly. Swapping this file for Postgres later
// means reimplementing `readDb` / `mutate` and nothing else — no caller
// reaches past these two functions.
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

async function ensureDb(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    const seeded = buildSeed();
    await fs.writeFile(DB_FILE, JSON.stringify(seeded, null, 2), "utf8");
  }
}

export async function readDb(): Promise<Database> {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Database;
    return {
      projects: parsed.projects ?? [],
      recipients: parsed.recipients ?? [],
      organizations: parsed.organizations ?? [],
      activities: parsed.activities ?? [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    // A corrupt file should not take the app down — rebuild from seed.
    const seeded = buildSeed();
    await fs.writeFile(DB_FILE, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }
}

/** Read-modify-write under a lock. The mutator may return a value to pass back. */
export async function mutate<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<{ db: Database; result: T }> {
  await ensureDb();
  const release = await lockfile.lock(DB_FILE, {
    retries: { retries: 12, factor: 1.5, minTimeout: 40, maxTimeout: 1200 },
    stale: 10_000,
  });
  try {
    const db = await readDb();
    const result = await fn(db);
    db.updatedAt = new Date().toISOString();
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    return { db, result };
  } finally {
    await release();
  }
}

/** Wipe the local store and rebuild the demo pipeline against today's date. */
export async function resetDb(): Promise<Database> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const seeded = buildSeed();
  await fs.writeFile(DB_FILE, JSON.stringify(seeded, null, 2), "utf8");
  return seeded;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}
