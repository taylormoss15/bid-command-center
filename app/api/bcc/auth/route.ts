import { NextResponse } from "next/server";

import {
  COOKIE_OPTIONS,
  SESSION_COOKIE,
  checkPasscode,
  issueToken,
} from "@/lib/bcc/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    passcode?: string;
    action?: string;
  };

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return res;
  }

  if (!checkPasscode(body.passcode ?? "")) {
    // Constant-ish delay so a wrong passcode isn't obviously faster.
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, issueToken(), COOKIE_OPTIONS);
  return res;
}
