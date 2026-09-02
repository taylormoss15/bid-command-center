import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import { mutate, newId } from "@/lib/bcc/store";
import type { Activity, BidRecipient, Project } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";

/** Create a project, optionally with its first GC recipient in the same call. */
export async function POST(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    project: Partial<Project>;
    recipient?: Partial<BidRecipient> & { organizationName?: string };
  };

  const { db } = await mutate((db) => {
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const seq = db.projects.length + 1;

    const project: Project = {
      id: newId("prj"),
      code: `ER-${year}-${String(seq + 140).padStart(3, "0")}`,
      name: "Untitled project",
      city: "",
      state: "UT",
      projectType: "commercial",
      workType: "new_construction",
      stage: "identified",
      probabilityOverride: null,
      expectedValue: 0,
      materials: [],
      scopeFlags: [],
      dateConfidence: "unknown",
      estimator: "Taylor Moss",
      competitors: [],
      lastActivityDate: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      ...body.project,
    };
    db.projects.push(project);

    if (body.recipient?.organizationId || body.recipient?.organizationName) {
      let orgId = body.recipient.organizationId;
      if (!orgId && body.recipient.organizationName) {
        const name = body.recipient.organizationName.trim();
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
      if (orgId) {
        const { organizationName: _name, ...rest } = body.recipient;
        const recipient: BidRecipient = {
          ...rest,
          id: newId("rec"),
          projectId: project.id,
          organizationId: orgId,
          revisions: rest.revisions ?? [],
        };
        db.recipients.push(recipient);
      }
    }

    const activity: Activity = {
      id: newId("act"),
      projectId: project.id,
      at: now,
      kind: "system",
      summary: "Project created",
      author: "Taylor Moss",
    };
    db.activities.push(activity);

    return project;
  });

  return NextResponse.json(db);
}
