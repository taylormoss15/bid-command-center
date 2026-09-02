import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Passcode gate with two workspaces.
//
//   live   BCC_PASSCODE       Elite's actual pipeline.
//   demo   BCC_DEMO_PASSCODE  A sandbox full of generated projects, for
//                             showing the product. Completely separate
//                             storage — nothing done in a demo can touch or
//                             even see the real board.
//
// The workspace is decided at login by which passcode was typed, and is
// carried in the signed session cookie. Swap this for real per-user auth when
// more than one person needs an account.
// ---------------------------------------------------------------------------

export type Workspace = "live" | "demo";

export const SESSION_COOKIE = "bcc_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function livePasscode(): string {
  return process.env.BCC_PASSCODE || "elite";
}

/** Demo access is off unless a passcode is configured for it. */
function demoPasscode(): string | null {
  const value = process.env.BCC_DEMO_PASSCODE;
  return value && value.length > 0 ? value : null;
}

export function demoEnabled(): boolean {
  return demoPasscode() !== null;
}

function secret(): string {
  return process.env.BCC_SESSION_SECRET || `bcc:${livePasscode()}`;
}

/** True when the deployment is still running on the built-in default passcode. */
export function usingDefaultPasscode(): boolean {
  return !process.env.BCC_PASSCODE;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function issueToken(workspace: Workspace): string {
  const payload = `${workspace}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the workspace the token grants, or null if it is not valid. */
export function verifyToken(token: string | undefined): Workspace | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [workspace, issued, mac] = parts;
  if (workspace !== "live" && workspace !== "demo") return null;

  const expected = sign(`${workspace}.${issued}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const age = (Date.now() - Number(issued)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE) return null;

  // A demo session is worthless once demo access is switched off.
  if (workspace === "demo" && !demoEnabled()) return null;
  return workspace;
}

function matches(input: string, expected: string): boolean {
  const a = Buffer.from(input ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Which workspace this passcode opens, or null if it opens nothing. */
export function workspaceForPasscode(input: string): Workspace | null {
  // Check both regardless of the first result, so timing says nothing about
  // which passcode was closer.
  const isLive = matches(input, livePasscode());
  const demo = demoPasscode();
  const isDemo = demo !== null && matches(input, demo);
  if (isLive) return "live";
  if (isDemo) return "demo";
  return null;
}

/** The workspace for the current request, or null when not signed in. */
export function currentWorkspace(): Workspace | null {
  return verifyToken(cookies().get(SESSION_COOKIE)?.value);
}

export function isAuthed(): boolean {
  return currentWorkspace() !== null;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  secure: process.env.NODE_ENV === "production",
};
