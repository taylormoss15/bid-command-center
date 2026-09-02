import { NextResponse } from "next/server";

import { currentWorkspace } from "@/lib/bcc/auth";
import { mutate, newId } from "@/lib/bcc/store";
import type { BidRecipient } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const patch = (await request.json()) as Partial<BidRecipient> & {
    /** Convenience: record a new submitted amount as an immutable revision. */
    newRevision?: { amount: number; date: string; note?: string };
  };

  const { db, result } = await mutate(ws, (db) => {
    const recipient = db.recipients.find((r) => r.id === params.id);
    if (!recipient) return false;

    const { newRevision, ...rest } = patch;
    Object.assign(recipient, rest);

    if (newRevision) {
      const revision = recipient.revisions.length;
      recipient.revisions.push({
        id: newId("rev"),
        revision,
        amount: newRevision.amount,
        date: newRevision.date,
        note: newRevision.note,
      });
      recipient.submittedAmount = newRevision.amount;
      recipient.submittedDate = newRevision.date;

      const project = db.projects.find((p) => p.id === recipient.projectId);
      const org = db.organizations.find((o) => o.id === recipient.organizationId);
      if (project) {
        project.lastActivityDate = newRevision.date;
        db.activities.push({
          id: newId("act"),
          projectId: project.id,
          recipientId: recipient.id,
          at: new Date().toISOString(),
          kind: "bid_submitted",
          summary:
            revision === 0
              ? `Proposal submitted to ${org?.name ?? "GC"}`
              : `Revision ${revision} submitted to ${org?.name ?? "GC"}`,
          note: newRevision.note,
          author: "Taylor Moss",
        });
      }
    }
    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(db);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { db } = await mutate(ws, (db) => {
    db.recipients = db.recipients.filter((r) => r.id !== params.id);
  });
  return NextResponse.json(db);
}
