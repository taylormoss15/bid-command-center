import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import { mutate, newId } from "@/lib/bcc/store";
import type { BidRecipient } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

/** Add a GC to an existing project — a new bid path, not a new project. */
export async function POST(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as Partial<BidRecipient> & {
    organizationName?: string;
  };
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const { db } = await mutate((db) => {
    let orgId = body.organizationId;
    if (!orgId && body.organizationName) {
      const name = body.organizationName.trim();
      const existing = db.organizations.find(
        (o) => o.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        orgId = existing.id;
      } else {
        orgId = newId("org");
        db.organizations.push({
          id: orgId,
          name,
          type: "gc",
          relationship: "new",
          contacts: [],
        });
      }
    }
    if (!orgId) return;

    const { organizationName: _name, ...rest } = body;
    db.recipients.push({
      ...rest,
      id: newId("rec"),
      projectId: body.projectId!,
      organizationId: orgId,
      revisions: rest.revisions ?? [],
    } as BidRecipient);
  });

  return NextResponse.json(db);
}
