import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { demoEnabled } from "@/lib/bcc/auth";
import { applyExtraction, intakeContext, shouldAccept } from "@/lib/bcc/intake/apply";
import { extractFromEmail } from "@/lib/bcc/intake/extract";
import { normalizeEmail } from "@/lib/bcc/intake/normalize";
import { defaultWorkspace, routeSender, senderRules } from "@/lib/bcc/intake/routing";
import { settingsOf, storedSenderRules, touchSender } from "@/lib/bcc/intake/senders";
import { sendIntakeReply, type IntakeReply } from "@/lib/bcc/notify/confirm";
import { appBaseUrl } from "@/lib/bcc/notify/theme";
import { mutate, readDb } from "@/lib/bcc/store";
import type { Workspace } from "@/lib/bcc/auth";
import type { Database } from "@/lib/bcc/types";

export const dynamic = "force-dynamic";
// Extraction can take a few seconds; give it room on hosts that allow it.
export const maxDuration = 60;

/**
 * Inbound email endpoint. Forward a bid invitation to the address your mail
 * provider points here and it appears on the board marked for review.
 *
 * Two separate questions, answered in this order:
 *
 *  1. Is this allowed at all? A shared secret, because mail providers cannot
 *     log in: send it as `?token=` or an `x-bcc-token` header. Without
 *     BCC_INBOUND_SECRET set the endpoint refuses everything rather than
 *     accepting anonymous writes.
 *
 *  2. Whose board is it? The From address decides — see
 *     lib/bcc/intake/routing.ts. That is routing, not authentication: a From
 *     header can be forged, so the secret above is what actually guards the
 *     door.
 */
function authorized(request: Request): boolean {
  const expected = process.env.BCC_INBOUND_SECRET;
  if (!expected) return false;

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("token") ?? request.headers.get("x-bcc-token") ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Replies to the forwarder, if this board wants confirmations and outbound
 * mail is configured. Never throws and never blocks the intake: a reply that
 * could not be sent is reported in the response, not raised.
 */
async function confirm(
  request: Request,
  db: Database,
  workspace: Workspace,
  reply: IntakeReply,
): Promise<string> {
  if (settingsOf(db).confirmIntake === false) return "off for this board";
  if (!process.env.RESEND_API_KEY) return "skipped: RESEND_API_KEY is not set";

  try {
    const result = await sendIntakeReply(reply, appBaseUrl(request));
    return result.sent ? `sent to ${reply.to}` : `not sent: ${result.reason}`;
  } catch (error) {
    console.error("bcc: confirmation reply failed", error);
    return "not sent: the mail service could not be reached";
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      // SendGrid Inbound Parse and Mailgun post multipart form data.
      const form = await request.formData();
      payload = Object.fromEntries(
        Array.from(form.entries()).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
      );
    }
  } catch {
    return NextResponse.json({ error: "could not read the payload" }, { status: 400 });
  }

  const email = normalizeEmail(payload);
  if (!email) {
    return NextResponse.json(
      { error: "no recognisable email in that payload" },
      { status: 400 },
    );
  }

  // Who forwarded it decides which board it lands on. Each board's own
  // approved list is asked first; the environment is the fallback.
  const route = routeSender(email.from, await storedSenderRules());
  if (!route.ok) {
    console.warn(`bcc: refused inbound mail from ${route.sender} — ${route.reason}`);
    return NextResponse.json(
      { status: "refused", sender: route.sender, reason: route.reason },
      { status: 403 },
    );
  }
  const workspace = route.workspace;

  // Read first so the extractor knows which GCs and projects already exist.
  const before = await readDb(workspace);
  const result = await extractFromEmail(email, intakeContext(before, email));

  if (!shouldAccept(result.extraction)) {
    // Not a bid invitation. Acknowledge so the provider stops retrying, but
    // do not put noise on the board.
    const reply = await confirm(request, before, workspace, {
      kind: "ignored",
      to: route.sender,
      subject: email.subject,
      messageId: email.messageId,
      extractedBy: result.extractedBy,
    });
    return NextResponse.json({
      status: "ignored",
      reason: "This did not look like a bid invitation.",
      workspace,
      subject: email.subject,
      confirmation: reply,
    });
  }

  const { db: after, result: outcome } = await mutate(workspace, (db) => {
    touchSender(db, route.sender, new Date().toISOString());
    return applyExtraction(db, email, result);
  });

  const bidPaths = after.recipients.filter(
    (r) => r.projectId === outcome.project.id,
  ).length;

  const confirmation =
    outcome.kind === "duplicate"
      ? "skipped: already confirmed"
      : await confirm(request, after, workspace, {
          kind: outcome.kind,
          to: route.sender,
          subject: email.subject,
          messageId: email.messageId,
          project: outcome.project,
          gc:
            outcome.kind === "created"
              ? (outcome.organization?.name ?? null)
              : outcome.kind === "recipient"
                ? outcome.organization.name
                : null,
          bidPaths,
          differences: outcome.kind === "update" ? outcome.differences : undefined,
          uncertainties: result.extraction.uncertainties,
          extractedBy: result.extractedBy,
        });

  const common = {
    workspace,
    sender: route.sender,
    confirmation,
    projectId: outcome.project.id,
    project: outcome.project.name,
    extractedBy: result.extractedBy,
    confidence: result.extraction.confidence,
  };

  switch (outcome.kind) {
    case "created":
      return NextResponse.json({
        ...common,
        status: "created",
        gc: outcome.organization?.name ?? null,
        needsReview: true,
      });
    case "recipient":
      return NextResponse.json({
        ...common,
        status: "recipient_added",
        detail: `${outcome.organization.name} added as another bid path on an existing project.`,
        recipientId: outcome.recipient.id,
        needsReview: true,
      });
    case "update":
      return NextResponse.json({
        ...common,
        status: "update_noted",
        detail: "Recorded against the bid we already track.",
        recipientId: outcome.recipient.id,
        differences: outcome.differences,
        needsReview: true,
      });
    case "noted":
      return NextResponse.json({
        ...common,
        status: "noted",
        detail: "Logged on the matching project; no GC was named in the email.",
      });
    case "duplicate":
      return NextResponse.json({
        ...common,
        status: "duplicate",
        detail: "This message is already waiting for review.",
      });
  }
}

/** A GET is handy for confirming the URL, secret, and routing are wired up. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stored = await storedSenderRules();
  const env = senderRules();
  const fallback = defaultWorkspace();
  const describe = (rules: typeof env) => rules.map((r) => `${r.pattern} → ${r.workspace}`);

  return NextResponse.json({
    status: "ready",
    extractor: process.env.ANTHROPIC_API_KEY ? "claude" : "heuristic only",
    model: process.env.BCC_EXTRACTION_MODEL || "claude-opus-5",
    approvedSenders:
      stored.length === 0
        ? "none — add them under Data & backup → Email intake"
        : describe(stored),
    sendersFromEnvironment:
      env.length === 0 ? "BCC_INBOUND_SENDERS is not set" : describe(env),
    unrecognisedSenders:
      stored.length === 0 && env.length === 0
        ? "routed to live — nothing is configured yet"
        : fallback
          ? `routed to ${fallback}`
          : "refused",
    confirmationReplies: process.env.RESEND_API_KEY
      ? `sent from ${process.env.BCC_NOTIFY_FROM || "onboarding@resend.dev"}`
      : "off — RESEND_API_KEY is not set",
    demoWorkspace: demoEnabled() ? "available" : "not configured",
  });
}
