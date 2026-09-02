import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import { STAGE_MAP } from "@/lib/bcc/stages";
import { mutate, newId } from "@/lib/bcc/store";
import type {
  ContactMethod,
  FollowUpType,
  Signal,
  StageId,
} from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

interface LogPayload {
  projectId: string;
  recipientId?: string | null;
  at?: string;
  method?: ContactMethod | null;
  contact?: string | null;
  note?: string;
  signal?: Signal | null;
  /** Optional in-line updates so one interaction is one save. */
  stage?: StageId;
  probability?: number | null;
  nextFollowUpDate?: string | null;
  nextFollowUpType?: FollowUpType | null;
  waitingOn?: string | null;
  kind?: "touch" | "note";
}

/**
 * Log one interaction. This is the single busiest write in the product, so it
 * does everything a completed follow-up implies in one round trip: records the
 * touch, moves the stage, updates probability, and books the next commitment.
 */
export async function POST(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as LogPayload;

  const { db, result } = await mutate((db) => {
    const project = db.projects.find((p) => p.id === body.projectId);
    if (!project) return false;

    const at = body.at ?? new Date().toISOString();
    const day = at.slice(0, 10);
    const recipient = body.recipientId
      ? db.recipients.find((r) => r.id === body.recipientId)
      : undefined;
    const org = recipient
      ? db.organizations.find((o) => o.id === recipient.organizationId)
      : undefined;

    const methodLabel: Record<ContactMethod, string> = {
      call: "Called",
      email: "Emailed",
      text: "Texted",
      meeting: "Met with",
      portal: "Portal update for",
    };

    const summary =
      body.kind === "note" || !body.method
        ? "Note added"
        : `${methodLabel[body.method]} ${recipient?.contactName ?? org?.name ?? "contact"}${
            org && recipient?.contactName ? ` at ${org.name}` : ""
          }`;

    db.activities.push({
      id: newId("act"),
      projectId: project.id,
      recipientId: recipient?.id ?? null,
      at,
      kind: body.kind === "note" ? "note" : "touch",
      method: body.method ?? null,
      contact: body.contact ?? recipient?.contactName ?? null,
      note: body.note,
      signal: body.signal ?? null,
      summary,
      author: "Taylor Moss",
    });

    project.lastActivityDate = day;
    project.updatedAt = new Date().toISOString();

    if (recipient) {
      recipient.lastContactDate = day;
      if (body.signal !== undefined) recipient.signal = body.signal;
      if (body.nextFollowUpDate !== undefined) {
        recipient.nextFollowUpDate = body.nextFollowUpDate;
      }
      if (body.nextFollowUpType !== undefined) {
        recipient.nextFollowUpType = body.nextFollowUpType;
      }
      if (body.waitingOn !== undefined) recipient.waitingOn = body.waitingOn;
    }

    if (body.probability !== undefined) {
      project.probabilityOverride = body.probability;
    }

    if (body.stage && body.stage !== project.stage) {
      const previous = project.stage;
      project.stage = body.stage;
      db.activities.push({
        id: newId("act"),
        projectId: project.id,
        at,
        kind: "stage_change",
        summary: `Stage changed from ${STAGE_MAP[previous].label} to ${STAGE_MAP[body.stage].label}`,
        author: "Taylor Moss",
      });
    }

    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  return NextResponse.json(db);
}
