import { NextResponse } from "next/server";

import { currentWorkspace } from "@/lib/bcc/auth";
import { STAGE_MAP } from "@/lib/bcc/stages";
import { mutate, newId } from "@/lib/bcc/store";
import type { Project } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const ws = currentWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const patch = (await request.json()) as Partial<Project>;

  const { db, result } = await mutate(ws, (db) => {
    const project = db.projects.find((p) => p.id === params.id);
    if (!project) return false;

    const previousStage = project.stage;
    Object.assign(project, patch);
    project.updatedAt = new Date().toISOString();

    // A stage move is worth a line in the timeline — that's the story of the
    // deal, not an audit trail entry.
    if (patch.stage && patch.stage !== previousStage) {
      project.lastActivityDate = new Date().toISOString().slice(0, 10);
      db.activities.push({
        id: newId("act"),
        projectId: project.id,
        at: new Date().toISOString(),
        kind: "stage_change",
        summary: `Stage changed from ${STAGE_MAP[previousStage].label} to ${STAGE_MAP[patch.stage].label}`,
        author: "Taylor Moss",
      });
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
    db.projects = db.projects.filter((p) => p.id !== params.id);
    db.recipients = db.recipients.filter((r) => r.projectId !== params.id);
    db.activities = db.activities.filter((a) => a.projectId !== params.id);
  });
  return NextResponse.json(db);
}
