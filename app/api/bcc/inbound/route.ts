import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { applyExtraction, shouldAccept } from "@/lib/bcc/intake/apply";
import { extractFromEmail } from "@/lib/bcc/intake/extract";
import { normalizeEmail } from "@/lib/bcc/intake/normalize";
import { mutate } from "@/lib/bcc/store";

export const dynamic = "force-dynamic";
// Extraction can take a few seconds; give it room on hosts that allow it.
export const maxDuration = 60;

/**
 * Inbound email endpoint. Forward a bid invitation to the address your mail
 * provider points here and the project appears on the board marked for review.
 *
 * Auth is a shared secret, since mail providers cannot log in: send it as
 * `?token=` or an `x-bcc-token` header. Without BCC_INBOUND_SECRET set the
 * endpoint refuses everything rather than accepting anonymous writes.
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

  const result = await extractFromEmail(email);

  if (!shouldAccept(result.extraction)) {
    // Not a bid invitation. Acknowledge so the provider stops retrying, but
    // do not put noise on the board.
    return NextResponse.json({
      status: "ignored",
      reason: "This did not look like a bid invitation.",
      subject: email.subject,
    });
  }

  // Forwarded mail is always real work, so it lands on the live board even
  // though the endpoint authenticates with its own secret rather than a login.
  const { result: project } = await mutate("live", (db) =>
    applyExtraction(db, email, result),
  );

  return NextResponse.json({
    status: "created",
    projectId: project.id,
    name: project.name,
    needsReview: true,
    extractedBy: result.extractedBy,
    confidence: result.extraction.confidence,
  });
}

/** A GET is handy for confirming the URL and secret are wired up correctly. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    status: "ready",
    extractor: process.env.ANTHROPIC_API_KEY ? "claude" : "heuristic only",
    model: process.env.BCC_EXTRACTION_MODEL || "claude-opus-5",
  });
}
