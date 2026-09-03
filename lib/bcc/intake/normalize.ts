// ---------------------------------------------------------------------------
// Inbound email normalisation.
//
// Every inbound-email provider posts a different JSON shape. Rather than tie
// Elite to one vendor, accept the common ones and reduce them to the four
// fields the extractor actually needs. Adding a provider is one more branch.
// ---------------------------------------------------------------------------

export interface NormalizedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  receivedAt: string;
  provider: string;
  /** The original Message-ID, so a confirmation reply threads with the forward. */
  messageId?: string | null;
}

type Payload = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstString(payload: Payload, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/** Crude but effective HTML→text, for providers that only send a body part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addressOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return addressOf(value[0]);
  if (value && typeof value === "object") {
    const obj = value as Payload;
    return str(obj.email) || str(obj.address) || str(obj.Email) || "";
  }
  return "";
}

/**
 * Recognises Postmark, SendGrid Inbound Parse, Mailgun, Resend, Cloudflare
 * Email Workers, and a plain `{from, subject, text}` shape for anything else.
 */
export function normalizeEmail(payload: Payload): NormalizedEmail | null {
  // Mailgun nests everything under `event-data` for some webhooks.
  const body = (payload["event-data"] as Payload) ?? payload;
  const data = (body.data as Payload) ?? body;

  const from =
    addressOf(data.from) ||
    addressOf(data.From) ||
    addressOf(data.sender) ||
    addressOf(data.FromFull) ||
    firstString(data, ["from_email", "envelope_from"]);

  const to =
    addressOf(data.to) ||
    addressOf(data.To) ||
    addressOf(data.recipient) ||
    firstString(data, ["to_email", "envelope_to"]);

  const subject = firstString(data, ["subject", "Subject", "headers.subject"]);

  let text = firstString(data, [
    "text",
    "TextBody",
    "body-plain",
    "stripped-text",
    "plain",
  ]);

  if (!text) {
    const html = firstString(data, ["html", "HtmlBody", "body-html"]);
    if (html) text = htmlToText(html);
  }

  if (!from && !subject && !text) return null;

  const provider =
    "TextBody" in data || "FromFull" in data
      ? "postmark"
      : "body-plain" in data || "stripped-text" in data
        ? "mailgun"
        : "envelope" in data
          ? "sendgrid"
          : "resend";

  return {
    from: from.trim(),
    to: to.trim(),
    subject: subject.trim(),
    // Guard against a runaway thread: the useful details are near the top.
    text: text.slice(0, 24_000).trim(),
    receivedAt: firstString(data, ["Date", "date", "timestamp"]) || new Date().toISOString(),
    provider,
    messageId:
      firstString(data, ["MessageID", "message-id", "Message-Id", "messageId"]) || null,
  };
}

/**
 * Forwarded mail buries the real sender in the quoted header block. Pull it
 * out so the project is attributed to the GC, not to Taylor's own mailbox.
 */
export function originalSender(email: NormalizedEmail): string {
  const match = /^\s*from:\s*(.+)$/im.exec(email.text);
  if (!match) return email.from;
  const line = match[1].trim();
  const angled = /<([^>]+@[^>]+)>/.exec(line);
  if (angled) return angled[1].trim();
  const bare = /([\w.+-]+@[\w.-]+\.\w+)/.exec(line);
  return bare ? bare[1] : email.from;
}
