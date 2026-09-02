import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { currentWorkspace } from "@/lib/bcc/auth";
import { todayISO } from "@/lib/bcc/format";
import { buildDigest, isQuiet } from "@/lib/bcc/notify/digest";
import { sendDigestEmail } from "@/lib/bcc/notify/email";
import { readDb } from "@/lib/bcc/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Where the email's links should point. */
function baseUrl(request: Request): string {
  const configured = process.env.BCC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(request.url).origin;
}

function matchesSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The morning digest.
 *
 * Two ways in: the scheduler, which presents CRON_SECRET as a bearer token,
 * and a signed-in person pressing "Send me one now" — so the wiring can be
 * checked without waiting until tomorrow.
 */
async function run(request: Request, options: { force: boolean }) {
  const today = todayISO();
  const db = await readDb("live");
  const digest = buildDigest(db, today);

  if (isQuiet(digest) && !options.force) {
    // A daily email that says "nothing to do" trains you to ignore it.
    return NextResponse.json({
      status: "skipped",
      reason: "Nothing overdue, due today, unscheduled, or closing this week.",
      today,
    });
  }

  const result = await sendDigestEmail(digest, baseUrl(request));
  return NextResponse.json({
    status: result.sent ? "sent" : "not-sent",
    reason: result.reason,
    id: result.id,
    today,
    counts: {
      overdue: digest.overdue.length,
      dueToday: digest.dueToday.length,
      unscheduled: digest.unscheduled.length,
      comingUp: digest.comingUp.length,
      bidsDueSoon: digest.bidsDueSoon.length,
    },
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Vercel Cron presents CRON_SECRET. Without one configured, refuse rather
  // than leaving an unauthenticated endpoint that sends mail.
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so the scheduled digest is disabled." },
      { status: 503 },
    );
  }
  if (!matchesSecret(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return run(request, { force: false });
}

/** Manual send from inside the app, for checking the wiring. */
export async function POST(request: Request) {
  if (currentWorkspace() !== "live") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return run(request, { force: true });
}
