import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { demoEnabled } from "@/lib/bcc/auth";
import { applyExtraction, intakeContext, shouldAccept } from "@/lib/bcc/intake/apply";
import { extractFromEmail } from "@/lib/bcc/intake/extract";
import { normalizeEmail } from "@/lib/bcc/intake/normalize";
import { defaultWorkspace, routeSender, senderRules } from "@/lib/bcc/intake/routing";
import { mutate, readDb } from "@/lib/bcc/store";

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

  // Who forwarded it decides which board it lands on.
  const route = routeSender(email.from);
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
    return NextResponse.json({
      status: "ignored",
      reason: "This did not look like a bid invitation.",
      workspace,
      subject: email.subject,
    });
  }

  const { result: outcome } = await mutate(workspace, (db) =>
    applyExtraction(db, email, result),
  );

  const common = {
    workspace,
    sender: route.sender,
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

  const rules = senderRules();
  const fallback = defaultWorkspace();

  return NextResponse.json({
    status: "ready",
    extractor: process.env.ANTHROPIC_API_KEY ? "claude" : "heuristic only",
    model: process.env.BCC_EXTRACTION_MODEL || "claude-opus-5",
    senders:
      rules.length === 0
        ? "no rules set — every sender routes to the live board"
        : rules.map((r) => `${r.pattern} → ${r.workspace}`),
    unrecognisedSenders: fallback ? `routed to ${fallback}` : "refused",
    demoWorkspace: demoEnabled() ? "available" : "not configured",
  });
}
