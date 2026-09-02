import { newId } from "../store";
import type { Database, Intake, Project, StageId } from "../types";

import type { Extraction, ExtractionResult } from "./extract";
import type { NormalizedEmail } from "./normalize";
import { originalSender } from "./normalize";

// ---------------------------------------------------------------------------
// Turning an extraction into records.
//
// Everything lands in `identified` with `needsReview` set. Nothing an email
// says can move a project further up the board — a stage change is a judgement
// only Taylor makes.
// ---------------------------------------------------------------------------

const INTAKE_STAGE: StageId = "identified";

function cleanDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function applyExtraction(
  db: Database,
  email: NormalizedEmail,
  result: ExtractionResult,
): Project {
  const { extraction } = result;
  const now = new Date().toISOString();
  const year = new Date().getFullYear();

  const intake: Intake = {
    source: "email",
    receivedAt: email.receivedAt,
    from: originalSender(email),
    subject: email.subject,
    body: email.text.slice(0, 8_000),
    extractedBy: result.extractedBy,
    model: result.model ?? null,
    confidence: extraction.confidence,
    uncertainties: extraction.uncertainties,
    reviewedAt: null,
  };

  const bidDue = cleanDate(extraction.bidDueDate);

  const project: Project = {
    id: newId("prj"),
    code: `ER-${year}-${String(db.projects.length + 141).padStart(3, "0")}`,
    name: extraction.projectName.slice(0, 140) || "Untitled project",
    description: extraction.description ?? "",
    addressLine: extraction.addressLine ?? undefined,
    city: extraction.city ?? "",
    state: (extraction.state ?? "UT").slice(0, 2).toUpperCase(),
    projectType: extraction.projectType ?? "commercial",
    workType: extraction.workType ?? "new_construction",
    isPublic: extraction.isPublic ?? false,
    owner: extraction.owner ?? undefined,
    architect: extraction.architect ?? undefined,
    source: "Forwarded email",
    trelloUrl: null,
    bidPlatformUrl: extraction.bidPlatformUrl ?? null,
    stage: INTAKE_STAGE,
    probabilityOverride: null,
    expectedValue: extraction.estimatedValue ?? 0,
    materials: extraction.materials,
    scopeFlags: extraction.scopeFlags,
    roofAreaSqFt: extraction.roofAreaSqFt ?? null,
    invitationDate: email.receivedAt.slice(0, 10),
    siteWalkDate: cleanDate(extraction.siteWalkDate),
    rfiDeadline: cleanDate(extraction.rfiDeadline),
    bidDueDate: bidDue
      ? `${bidDue}T${/^\d{2}:\d{2}$/.test(extraction.bidDueTime ?? "") ? extraction.bidDueTime : "14:00"}`
      : null,
    installStart: cleanDate(extraction.installStart),
    installEnd: cleanDate(extraction.installEnd),
    dateConfidence: "unknown",
    lastActivityDate: now.slice(0, 10),
    estimator: "Taylor Moss",
    competitors: [],
    intake,
    needsReview: true,
    createdAt: now,
    updatedAt: now,
  };
  db.projects.push(project);

  // Attach the GC when the email names one, reusing an existing organization
  // so the same contractor never appears twice in Clients & GCs.
  const gcName = extraction.gcName?.trim();
  if (gcName) {
    let org = db.organizations.find(
      (o) => o.name.toLowerCase() === gcName.toLowerCase(),
    );
    if (!org) {
      org = {
        id: newId("org"),
        name: gcName,
        type: "gc",
        relationship: "new",
        contacts: [],
      };
      db.organizations.push(org);
    }
    if (
      extraction.contactName &&
      !org.contacts.some((c) => c.name === extraction.contactName)
    ) {
      org.contacts.push({
        name: extraction.contactName,
        email: extraction.contactEmail ?? undefined,
        phone: extraction.contactPhone ?? undefined,
      });
    }

    db.recipients.push({
      id: newId("rec"),
      projectId: project.id,
      organizationId: org.id,
      contactName: extraction.contactName ?? undefined,
      contactEmail: extraction.contactEmail ?? undefined,
      contactPhone: extraction.contactPhone ?? undefined,
      status: "Invitation received by email",
      lastContactDate: email.receivedAt.slice(0, 10),
      nextFollowUpDate: null,
      nextFollowUpType: null,
      signal: "neutral",
      revisions: [],
    });
  }

  db.activities.push({
    id: newId("act"),
    projectId: project.id,
    at: now,
    kind: "system",
    summary: `Created from a forwarded email — ${email.subject || "no subject"}`,
    note:
      extraction.uncertainties.length > 0
        ? `Needs checking: ${extraction.uncertainties.join(" · ")}`
        : undefined,
    author: "Inbox",
  });

  return project;
}

/** A quick sanity check before anything is written. */
export function shouldAccept(extraction: Extraction): boolean {
  return extraction.isBidInvitation && extraction.projectName.trim().length > 2;
}
