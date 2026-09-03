// ---------------------------------------------------------------------------
// The palette every outbound email shares, so the digest and a confirmation
// reply look like they came from the same place. Mail clients strip stylesheets
// and many ignore CSS variables, so these are plain hex constants inlined at
// render time.
// ---------------------------------------------------------------------------

export const INK = "#0B0B0C";
export const MUTED = "#71717A";
export const LINE = "#E9E8E5";
export const VOLT = "#C8F235";
export const OK = "#0E7C57";
export const DANGER = "#C0272D";
export const WARN = "#B45309";

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Where an email's links should point. */
export function appBaseUrl(request?: Request): string {
  const configured = process.env.BCC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return request ? new URL(request.url).origin : "";
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  id?: string;
}

/** Resend's endpoint. Overridable so mail can be exercised against a stand-in. */
export function resendEndpoint(): string {
  return `${(process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "")}/emails`;
}

export function fromAddress(): string {
  return process.env.BCC_NOTIFY_FROM || "Bid Command Center <onboarding@resend.dev>";
}

export interface OutboundEmail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Send through Resend. Missing configuration is reported, never thrown. */
export async function send(message: OutboundEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY is not set" };
  if (message.to.length === 0) return { sent: false, reason: "no recipient" };

  let res: Response;
  try {
    res = await fetch(resendEndpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), ...message }),
    });
  } catch (error) {
    return {
      sent: false,
      reason: `Could not reach the mail service. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, reason: `Resend returned ${res.status}. ${detail.slice(0, 200)}` };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: body.id };
}
