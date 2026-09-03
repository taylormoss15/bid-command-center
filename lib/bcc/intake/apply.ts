import { newId } from "../store";
import type {
  BidRecipient,
  Database,
  Intake,
  Organization,
  Project,
  StageId,
} from "../types";

import type { Extraction, ExtractionContext, ExtractionResult } from "./extract";
import type { NormalizedEmail } from "./normalize";
import { originalSender } from "./normalize";
import { findExistingProject, findOrganization, isFreeMailDomain } from "./match";
import { senderDomain } from "./routing";

// ---------------------------------------------------------------------------
// Turning an extraction into records.
//
// Three shapes of arrival, one rule behind all of them: nothing an email says
// moves a project. A new job lands in `identified` marked for review; a second
// GC on a job already on the board becomes another bid recipient, not another
// project — that is the whole point of the model; and an addendum on a bid we
// already track is recorded as something to look at, with any disagreement
// between the email and the board spelled out.
// ---------------------------------------------------------------------------

const INTAKE_STAGE: StageId = "identified";

export type IntakeOutcome =
  /** A job we had never heard of. */
  | { kind: "created"; project: Project; organization: Organization | null }
  /** A job already on the board, invited by a GC we had not recorded on it. */
  | { kind: "recipient"; project: Project; recipient: BidRecipient; organization: Organization }
  /** An update to a bid path we already track — an addendum, a date change. */
  | { kind: "update"; project: Project; recipient: BidRecipient; differences: string[] }
  /** A job we know, but nothing in the email identifies which GC it came from. */
  | { kind: "noted"; project: Project }
  /** The same email a second time. Nothing written. */
  | { kind: "duplicate"; project: Project };

/**
 * The next free ER-<year>-<n> code. Counting projects is not enough — deleting
 * one, or a project arriving on a board seeded with codes of its own, hands
 * out a number that is already taken.
 */
function nextProjectCode(db: Database, year: number): string {
  const prefix = `ER-${year}-`;
  const taken = new Set(db.projects.map((p) => p.code));

  let highest = 140;
  for (const project of db.projects) {
    if (!project.code.startsWith(prefix)) continue;
    const n = Number(project.code.slice(prefix.length));
    if (Number.isFinite(n) && n > highest) highest = n;
  }

  let next = highest + 1;
  while (taken.has(`${prefix}${String(next).padStart(3, "0")}`)) next += 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function cleanDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** The person or company the invitation actually came from. */
function sourceAddress(email: NormalizedEmail, extraction?: Extraction): string {
  const quoted = originalSender(email);
  return quoted || extraction?.contactEmail || email.from;
}

/** What we already know, so the extractor can line up with it. */
export function intakeContext(db: Database, email: NormalizedEmail): ExtractionContext {
  const domain = senderDomain(sourceAddress(email));
  return {
    knownOrganizations: db.organizations
      .filter((o) => o.type === "gc" || o.type === "owner" || o.type === "developer")
      .map((o) => o.name),
    senderDomain: domain && !isFreeMailDomain(domain) ? domain : null,
  };
}

function buildIntake(
  email: NormalizedEmail,
  result: ExtractionResult,
  differences: string[] = [],
): Intake {
  return {
    source: "email",
    receivedAt: email.receivedAt,
    from: sourceAddress(email, result.extraction),
    subject: email.subject,
    body: email.text.slice(0, 8_000),
    extractedBy: result.extractedBy,
    model: result.model ?? null,
    confidence: result.extraction.confidence,
    uncertainties: result.extraction.uncertainties,
    differences: differences.length > 0 ? differences : undefined,
    reviewedAt: null,
  };
}

function bidDueDateTime(extraction: Extraction): string | null {
  const date = cleanDate(extraction.bidDueDate);
  if (!date) return null;
  const time = /^\d{2}:\d{2}$/.test(extraction.bidDueTime ?? "")
    ? extraction.bidDueTime
    : "14:00";
  return `${date}T${time}`;
}

/**
 * Finds or creates the organization the invitation came from, preferring one
 * we already have so the same GC never appears twice in Clients & GCs.
 */
function resolveOrganization(
  db: Database,
  extraction: Extraction,
  fromAddress: string,
): Organization | null {
  const gcName = extraction.gcName?.trim();
  const contactEmail = extraction.contactEmail ?? fromAddress;

  const existing = findOrganization(db, gcName, contactEmail);
  if (existing) return existing;
  if (!gcName) return null;

  const org: Organization = {
    id: newId("org"),
    name: gcName,
    type: "gc",
    relationship: "new",
    contacts: [],
  };
  db.organizations.push(org);
  return org;
}

function attachContact(org: Organization, extraction: Extraction, fromAddress: string) {
  const name = extraction.contactName?.trim();
  if (!name) return;
  const already = org.contacts.some(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
  if (already) return;

  const email = extraction.contactEmail ?? (fromAddress.includes("@") ? fromAddress : undefined);
  org.contacts.push({
    name,
    email: email ?? undefined,
    phone: extraction.contactPhone ?? undefined,
  });
}

function newRecipient(
  projectId: string,
  organizationId: string,
  email: NormalizedEmail,
  extraction: Extraction,
): BidRecipient {
  return {
    id: newId("rec"),
    projectId,
    organizationId,
    contactName: extraction.contactName ?? undefined,
    contactEmail: extraction.contactEmail ?? undefined,
    contactPhone: extraction.contactPhone ?? undefined,
    status: "Invitation received by email",
    lastContactDate: email.receivedAt.slice(0, 10),
    nextFollowUpDate: null,
    nextFollowUpType: null,
    signal: "neutral",
    revisions: [],
  };
}

/**
 * Where the email disagrees with the board. Reported, never applied — a
 * moved bid date is Taylor's call to make, and he can only make it if he can
 * see both numbers.
 */
function describeDifferences(project: Project, extraction: Extraction): string[] {
  const out: string[] = [];

  const incomingDue = cleanDate(extraction.bidDueDate);
  const currentDue = project.bidDueDate?.slice(0, 10) ?? null;
  if (incomingDue && currentDue && incomingDue !== currentDue) {
    out.push(`This email says bids are due ${incomingDue}; the board says ${currentDue}.`);
  } else if (incomingDue && !currentDue) {
    out.push(`This email gives a bid due date of ${incomingDue}; the board has none.`);
  }

  const incomingWalk = cleanDate(extraction.siteWalkDate);
  if (incomingWalk && incomingWalk !== (project.siteWalkDate ?? null)) {
    out.push(
      project.siteWalkDate
        ? `Site walk in this email is ${incomingWalk}; the board says ${project.siteWalkDate}.`
        : `This email gives a site walk of ${incomingWalk}; the board has none.`,
    );
  }

  const incomingRfi = cleanDate(extraction.rfiDeadline);
  if (incomingRfi && incomingRfi !== (project.rfiDeadline ?? null)) {
    out.push(
      project.rfiDeadline
        ? `RFI deadline in this email is ${incomingRfi}; the board says ${project.rfiDeadline}.`
        : `This email gives an RFI deadline of ${incomingRfi}; the board has none.`,
    );
  }

  if (
    extraction.estimatedValue &&
    project.expectedValue > 0 &&
    Math.abs(extraction.estimatedValue - project.expectedValue) /
      project.expectedValue >
      0.15
  ) {
    out.push(
      `This email implies about $${extraction.estimatedValue.toLocaleString()}; the board carries $${project.expectedValue.toLocaleString()}.`,
    );
  }

  return out;
}

/** True when this exact message has already been recorded and not yet cleared. */
function alreadySeen(intake: Intake | null | undefined, email: NormalizedEmail): boolean {
  if (!intake || intake.reviewedAt) return false;
  return (
    intake.subject === email.subject &&
    intake.receivedAt.slice(0, 10) === email.receivedAt.slice(0, 10)
  );
}

export function applyExtraction(
  db: Database,
  email: NormalizedEmail,
  result: ExtractionResult,
): IntakeOutcome {
  const { extraction } = result;
  const now = new Date().toISOString();
  const from = sourceAddress(email, extraction);

  const match = findExistingProject(db, {
    projectName: extraction.projectName,
    city: extraction.city,
    addressLine: extraction.addressLine,
  });

  // ---------------------------------------------------------------------
  // A job already on the board.
  // ---------------------------------------------------------------------
  if (match) {
    const project = match.project;
    const org = resolveOrganization(db, extraction, from);
    const differences = describeDifferences(project, extraction);

    if (!org) {
      const summary = `Email about this project — ${email.subject || "no subject"}`;
      const logged = db.activities.some(
        (a) =>
          a.projectId === project.id &&
          a.summary === summary &&
          a.at.slice(0, 10) === now.slice(0, 10),
      );
      if (logged) return { kind: "duplicate", project };

      db.activities.push({
        id: newId("act"),
        projectId: project.id,
        at: now,
        kind: "system",
        summary,
        note: [
          `From ${from}. No general contractor named, so nothing was added.`,
          ...differences,
        ].join(" "),
        author: "Inbox",
      });
      project.lastActivityDate = now.slice(0, 10);
      project.updatedAt = now;
      return { kind: "noted", project };
    }

    const existing = db.recipients.find(
      (r) => r.projectId === project.id && r.organizationId === org.id,
    );

    if (existing) {
      if (alreadySeen(existing.intake, email)) return { kind: "duplicate", project };

      existing.intake = buildIntake(email, result, differences);
      existing.needsReview = true;
      existing.lastContactDate = email.receivedAt.slice(0, 10);
      attachContact(org, extraction, from);

      db.activities.push({
        id: newId("act"),
        projectId: project.id,
        recipientId: existing.id,
        at: now,
        kind: "system",
        summary: `Email from ${org.name} — ${email.subject || "no subject"}`,
        note:
          differences.length > 0
            ? `Does not match the board: ${differences.join(" ")}`
            : undefined,
        author: "Inbox",
      });
      project.lastActivityDate = now.slice(0, 10);
      project.updatedAt = now;
      return { kind: "update", project, recipient: existing, differences };
    }

    // A second GC bidding the same job. One project, two proposal paths —
    // $350K of pipeline, $700K of proposal activity.
    const recipient = newRecipient(project.id, org.id, email, extraction);
    recipient.intake = buildIntake(email, result, differences);
    recipient.needsReview = true;
    db.recipients.push(recipient);
    attachContact(org, extraction, from);

    db.activities.push({
      id: newId("act"),
      projectId: project.id,
      recipientId: recipient.id,
      at: now,
      kind: "system",
      summary: `${org.name} invited us on this project too — by email`,
      note: [`Matched by ${match.why}.`, ...differences].join(" "),
      author: "Inbox",
    });
    project.lastActivityDate = now.slice(0, 10);
    project.updatedAt = now;
    return { kind: "recipient", project, recipient, organization: org };
  }

  // ---------------------------------------------------------------------
  // A job we have never seen.
  // ---------------------------------------------------------------------
  const year = new Date().getFullYear();
  const bidDue = bidDueDateTime(extraction);

  const project: Project = {
    id: newId("prj"),
    code: nextProjectCode(db, year),
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
    bidDueDate: bidDue,
    installStart: cleanDate(extraction.installStart),
    installEnd: cleanDate(extraction.installEnd),
    dateConfidence: "unknown",
    lastActivityDate: now.slice(0, 10),
    estimator: "Taylor Moss",
    competitors: [],
    intake: buildIntake(email, result),
    needsReview: true,
    createdAt: now,
    updatedAt: now,
  };
  db.projects.push(project);

  const org = resolveOrganization(db, extraction, from);
  if (org) {
    attachContact(org, extraction, from);
    db.recipients.push(newRecipient(project.id, org.id, email, extraction));
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

  return { kind: "created", project, organization: org };
}

/** A quick sanity check before anything is written. */
export function shouldAccept(extraction: Extraction): boolean {
  return extraction.isBidInvitation && extraction.projectName.trim().length > 2;
}
