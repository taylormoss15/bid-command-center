import { NextResponse } from "next/server";

import { currentWorkspace } from "@/lib/bcc/auth";
import { normalizeSenderPattern } from "@/lib/bcc/intake/routing";
import { buildApprovedSender, settingsOf } from "@/lib/bcc/intake/senders";
import { mutate } from "@/lib/bcc/store";

export const dynamic = "force-dynamic";

/**
 * Board settings — currently who may forward mail in, and whether they get a
 * reply about it. Kept in the data rather than the environment so setting up
 * an account is a form, not a redeploy.
 */
type Patch = {
  addSender?: { address: string; label?: string };
  removeSenderId?: string;
  confirmIntake?: boolean;
};

export async function PATCH(request: Request) {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let patch: Patch;
  try {
    patch = (await request.json()) as Patch;
  } catch {
    return NextResponse.json({ error: "could not read the request" }, { status: 400 });
  }

  if (patch.addSender && !normalizeSenderPattern(patch.addSender.address)) {
    return NextResponse.json(
      {
        error:
          "That is not an email address or a domain. Use taylor@example.com, or @example.com for everyone at a company.",
      },
      { status: 400 },
    );
  }

  const { db, result } = await mutate(ws, (db) => {
    db.settings = settingsOf(db);

    if (patch.addSender) {
      const sender = buildApprovedSender(patch.addSender.address, patch.addSender.label);
      if (!sender) return "invalid";

      const already = db.settings.approvedSenders.some(
        (s) => normalizeSenderPattern(s.address) === sender.address,
      );
      if (already) return "duplicate";
      db.settings.approvedSenders.push(sender);
    }

    if (patch.removeSenderId) {
      db.settings.approvedSenders = db.settings.approvedSenders.filter(
        (s) => s.id !== patch.removeSenderId,
      );
    }

    if (typeof patch.confirmIntake === "boolean") {
      db.settings.confirmIntake = patch.confirmIntake;
    }
    return "ok";
  });

  if (result === "invalid") {
    return NextResponse.json({ error: "that address could not be read" }, { status: 400 });
  }
  if (result === "duplicate") {
    return NextResponse.json({ error: "that sender is already approved" }, { status: 409 });
  }
  return NextResponse.json(db);
}
