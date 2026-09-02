import { NextResponse } from "next/server";

import { currentWorkspace, demoEnabled } from "@/lib/bcc/auth";
import { readDb, resetDb, restoreDb, storageBackend, storageLocation } from "@/lib/bcc/store";
import type { Database } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await readDb(ws);
  // The client shows these so it is always obvious which board you are on and
  // whether what you type into it is being kept.
  return NextResponse.json({
    ...db,
    workspace: ws,
    demoAvailable: demoEnabled(),
    storage: storageBackend(),
    storageLocation: storageLocation(ws),
  });
}

export async function POST(request: Request) {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    db?: Database;
  };

  const respond = (db: Database) =>
    NextResponse.json({
      ...db,
      workspace: ws,
      demoAvailable: demoEnabled(),
      storage: storageBackend(),
      storageLocation: storageLocation(ws),
    });

  if (body.action === "reset") {
    return respond(await resetDb(ws, "demo"));
  }

  if (body.action === "clear") {
    return respond(await resetDb(ws, "empty"));
  }

  if (body.action === "restore") {
    if (!body.db || !Array.isArray(body.db.projects)) {
      return NextResponse.json(
        { error: "That file does not look like a Bid Command Center backup." },
        { status: 400 },
      );
    }
    return respond(await restoreDb(ws, body.db));
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
