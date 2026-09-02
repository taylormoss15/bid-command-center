import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import { readDb, resetDb } from "@/lib/bcc/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await readDb();
  return NextResponse.json(db);
}

/** Rebuild the demo pipeline against today's date. */
export async function POST(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "reset") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const db = await resetDb();
  return NextResponse.json(db);
}
