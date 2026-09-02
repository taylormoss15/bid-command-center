import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/bcc/auth";
import {
  currentContractValue,
  estimatedGrossProfit,
  estimatedMargin,
  followUpHealth,
  nextFollowUp,
  probabilityOf,
  recipientsByProject,
  remainingBacklog,
  weightedValue,
} from "@/lib/bcc/calc";
import { HEALTH_LABEL } from "@/lib/bcc/calc";
import { todayISO } from "@/lib/bcc/format";
import { STAGE_MAP } from "@/lib/bcc/stages";
import { readDb } from "@/lib/bcc/store";
import { FOLLOW_UP_TYPE_MAP, materialLabel } from "@/lib/bcc/taxonomy";

export const dynamic = "force-dynamic";

type Cell = string | number | null | undefined;

function csv(rows: Cell[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell == null) return "";
          const s = String(cell);
          // Guard against spreadsheet formula injection on untrusted text.
          const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Full-fidelity CSV export — no vendor lock-in, everything leaves in one click. */
export async function GET(request: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const entity = new URL(request.url).searchParams.get("entity") ?? "projects";
  const db = await readDb();
  const today = todayISO();
  const orgName = (id: string) =>
    db.organizations.find((o) => o.id === id)?.name ?? "";
  const projectName = (id: string) =>
    db.projects.find((p) => p.id === id)?.name ?? "";

  let rows: Cell[][];
  let filename: string;

  if (entity === "recipients") {
    filename = "bid-recipients";
    rows = [
      [
        "Project", "Project Code", "GC / Client", "Contact", "Email", "Phone",
        "Submitted Amount", "Submitted Date", "Revisions", "Status",
        "Last Contact", "Next Follow-up", "Follow-up Type", "Signal",
        "Waiting On", "Clarifications", "Feedback",
      ],
      ...db.recipients.map((r) => {
        const p = db.projects.find((x) => x.id === r.projectId);
        return [
          p?.name, p?.code, orgName(r.organizationId), r.contactName,
          r.contactEmail, r.contactPhone, r.submittedAmount, r.submittedDate,
          r.revisions.length, r.status, r.lastContactDate, r.nextFollowUpDate,
          r.nextFollowUpType ? FOLLOW_UP_TYPE_MAP[r.nextFollowUpType] : "",
          r.signal, r.waitingOn, r.clarifications, r.feedback,
        ];
      }),
    ];
  } else if (entity === "activities") {
    filename = "activity-log";
    rows = [
      ["Date", "Project", "Kind", "Summary", "Method", "Contact", "Signal", "Note", "Author"],
      ...[...db.activities]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .map((a) => [
          a.at, projectName(a.projectId), a.kind, a.summary, a.method,
          a.contact, a.signal, a.note, a.author,
        ]),
    ];
  } else if (entity === "organizations") {
    filename = "clients-and-gcs";
    rows = [
      ["Name", "Type", "City", "State", "Relationship", "Payment Speed", "Contacts", "Notes"],
      ...db.organizations.map((o) => [
        o.name, o.type, o.city, o.state, o.relationship, o.paymentSpeed,
        o.contacts.map((c) => `${c.name}${c.title ? ` (${c.title})` : ""}`).join("; "),
        o.notes,
      ]),
    ];
  } else {
    filename = "projects";
    const byProject = recipientsByProject(db.recipients);
    rows = [
      [
        "Project Code", "Project Name", "Stage", "Win Probability",
        "Expected Project Value", "Weighted Value", "Estimated Cost",
        "Estimated Gross Profit", "Estimated Gross Margin %",
        "Current Contract Value", "Revenue Earned", "Remaining Backlog",
        "Bid Due", "Bid Submitted", "Anticipated Award", "Expected Contract",
        "Install Start", "Install End", "Date Confidence",
        "City", "State", "Address", "Project Type", "Work Type", "Public",
        "Materials", "Manufacturer", "Warranty", "Roof Area SF", "Squares",
        "Buildings", "Stories", "Scope Flags",
        "GC Count", "GCs", "Raw Proposal Volume",
        "Next Follow-up", "Follow-up Health", "Last Activity",
        "Estimator", "Project Manager", "Owner", "Architect",
        "Competition", "Competitors", "Pricing Position", "Relationship",
        "Priority", "Fit Score", "Win Reason", "Primary Risk",
        "Outcome", "Outcome Date", "Awarded To", "Winning Amount",
        "Outcome Reason", "Lessons Learned", "Trello URL", "Bid Platform URL",
      ],
      ...db.projects.map((p) => {
        const recs = byProject.get(p.id) ?? [];
        const next = nextFollowUp(recs);
        return [
          p.code, p.name, STAGE_MAP[p.stage].label, probabilityOf(p),
          p.expectedValue, Math.round(weightedValue(p)), p.estimatedCost,
          estimatedGrossProfit(p), estimatedMargin(p),
          currentContractValue(p), p.contract?.revenueEarned,
          remainingBacklog(p),
          p.bidDueDate, p.bidSubmittedDate, p.anticipatedAwardDate,
          p.expectedContractDate, p.installStart, p.installEnd, p.dateConfidence,
          p.city, p.state, p.addressLine, p.projectType, p.workType,
          p.isPublic ? "Public" : "Private",
          p.materials.map(materialLabel).join("; "), p.manufacturer, p.warranty,
          p.roofAreaSqFt, p.roofAreaSqFt ? Math.round(p.roofAreaSqFt / 100) : "",
          p.buildings, p.stories, p.scopeFlags.join("; "),
          recs.length, recs.map((r) => orgName(r.organizationId)).join("; "),
          recs.reduce((s, r) => s + (r.submittedAmount ?? 0), 0),
          next?.date, HEALTH_LABEL[followUpHealth(p, recs, today)],
          p.lastActivityDate, p.estimator, p.projectManager, p.owner, p.architect,
          p.competition, (p.competitors ?? []).join("; "), p.pricingPosition,
          p.relationship, p.priority, p.fitScore, p.winReason, p.primaryRisk,
          p.outcome?.result, p.outcome?.date, p.outcome?.awardedTo,
          p.outcome?.winningAmount, p.outcome?.reason, p.outcome?.lessons,
          p.trelloUrl, p.bidPlatformUrl,
        ];
      }),
    ];
  }

  // BOM keeps Excel honest about UTF-8.
  return new NextResponse(`﻿${csv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="elite-${filename}-${today}.csv"`,
    },
  });
}
