import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Single-passcode gate. Enough to keep a live pipeline off the open internet;
// swap for real per-user auth when more than one person needs an account.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "bcc_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function passcode(): string {
  return process.env.BCC_PASSCODE || "elite";
}

function secret(): string {
  return process.env.BCC_SESSION_SECRET || `bcc:${passcode()}`;
}

/** True when the deployment is still running on the built-in default passcode. */
export function usingDefaultPasscode(): boolean {
  return !process.env.BCC_PASSCODE;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function issueToken(): string {
  const issued = String(Date.now());
  return `${issued}.${sign(issued)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [issued, mac] = token.split(".");
  if (!issued || !mac) return false;
  const expected = sign(issued);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  const age = (Date.now() - Number(issued)) / 1000;
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE;
}

export function checkPasscode(input: string): boolean {
  const expected = passcode();
  const a = Buffer.from(input ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAuthed(): boolean {
  return verifyToken(cookies().get(SESSION_COOKIE)?.value);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  secure: process.env.NODE_ENV === "production",
};
