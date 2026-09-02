import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import { readDb, resetDb, restoreDb, storageBackend } from "@/lib/bcc/store";
import type { Database } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await readDb();
  // The client shows this so it is always obvious whether writes are durable.
  return NextResponse.json({ ...db, storage: storageBackend() });
}

export async function POST(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    db?: Database;
  };

  if (body.action === "reset") {
    const db = await resetDb("demo");
    return NextResponse.json({ ...db, storage: storageBackend() });
  }

  if (body.action === "clear") {
    const db = await resetDb("empty");
    return NextResponse.json({ ...db, storage: storageBackend() });
  }

  if (body.action === "restore") {
    if (!body.db || !Array.isArray(body.db.projects)) {
      return NextResponse.json(
        { error: "That file does not look like a Bid Command Center backup." },
        { status: 400 },
      );
    }
    const db = await restoreDb(body.db);
    return NextResponse.json({ ...db, storage: storageBackend() });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
