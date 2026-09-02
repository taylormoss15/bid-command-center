import { NextResponse } from "next/server";

import { ensureStorageResolved, storageBackend } from "@/lib/bcc/store";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated health check for the host's container monitor. It reports
 * only whether the app is up and which storage mode is active — never data,
 * never configuration values.
 */
export async function GET() {
  await ensureStorageResolved();
  return NextResponse.json({
    status: "ok",
    storage: storageBackend(),
    durable: storageBackend() !== "file",
  });
}
