import type { Workspace } from "../auth";

// ---------------------------------------------------------------------------
// Which board does a forwarded email belong on?
//
// One address — bids@yourdomain.com — feeds every workspace, so the sender
// decides where the mail lands. Taylor forwards an invitation, it appears on
// the live board; a salesperson forwards one from the demo mailbox, it appears
// on the demo board and can never touch the real pipeline.
//
// A word on what this is and is not. A From header is trivially forgeable, so
// this is ROUTING, not authentication. The shared secret on the endpoint is
// the authentication. What sender matching buys is that a mail provider
// pointed at the wrong URL, a stray newsletter, or a GC who found the address
// on a bid tab cannot silently fill the board with junk.
// ---------------------------------------------------------------------------

export interface SenderRule {
  /** A full address, or a domain written as "@example.com". */
  pattern: string;
  workspace: Workspace;
}

export type SenderRoute =
  | { ok: true; workspace: Workspace; sender: string; matched: string }
  | { ok: false; sender: string; reason: string };

/** Strips a display name, angle brackets, and case. */
export function bareAddress(input: string): string {
  const angled = /<([^>]+)>/.exec(input);
  const raw = (angled ? angled[1] : input).trim().toLowerCase();
  // Some providers hand over "Taylor Moss taylor@x.com" with no brackets.
  const found = /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(raw);
  return (found ? found[1] : raw).replace(/[.,;]+$/, "");
}

/**
 * Canonical form for comparison. Drops "+tag" suffixes, which people use for
 * filtering and which should not stop their own mail being recognised, and
 * ignores dots in the local part on Google-hosted mailboxes, where they carry
 * no meaning. Everything else is left alone.
 */
export function canonicalAddress(input: string): string {
  const address = bareAddress(input);
  const at = address.lastIndexOf("@");
  if (at < 1) return address;

  let local = address.slice(0, at);
  const domain = address.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1);
}

/** The sender's email domain, e.g. "wasatchbuilders.com". Empty if unknown. */
export function senderDomain(input: string): string {
  return domainOf(bareAddress(input));
}

function parseWorkspace(value: string | undefined): Workspace | null {
  const v = value?.trim().toLowerCase();
  if (v === "live" || v === "demo") return v;
  return null;
}

/**
 * Parses BCC_INBOUND_SENDERS. Entries are separated by commas or newlines;
 * each is an address or an "@domain", optionally followed by "=live" or
 * "=demo". Without a workspace suffix an entry routes to the live board.
 *
 *   BCC_INBOUND_SENDERS="taylor@eliteroofing.com, @eliteroofing.com, sales@x.com=demo"
 */
export function senderRules(): SenderRule[] {
  const raw = process.env.BCC_INBOUND_SENDERS;
  if (!raw || !raw.trim()) return [];

  const rules: SenderRule[] = [];
  for (const entry of raw.split(/[,\n;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const [left, right] = trimmed.split("=");
    const workspace = parseWorkspace(right) ?? "live";
    const pattern = left.trim().toLowerCase();
    if (!pattern) continue;

    rules.push({
      pattern: pattern.startsWith("@") ? pattern : canonicalAddress(pattern),
      workspace,
    });
  }
  return rules;
}

/** Set to route mail from an unrecognised sender somewhere instead of refusing it. */
export function defaultWorkspace(): Workspace | null {
  return parseWorkspace(process.env.BCC_INBOUND_DEFAULT_WORKSPACE);
}

/**
 * Decides the workspace for a forwarded email, matching on the address that
 * sent it to us — the person forwarding, not the GC quoted inside.
 *
 * With no rules configured everything goes to the live board, which is how
 * this behaved before sender routing existed.
 */
export function routeSender(from: string): SenderRoute {
  const sender = bareAddress(from);
  const rules = senderRules();

  if (rules.length === 0) {
    return { ok: true, workspace: "live", sender, matched: "no sender rules configured" };
  }
  if (!sender.includes("@")) {
    return { ok: false, sender, reason: "The message had no usable From address." };
  }

  const canonical = canonicalAddress(sender);
  const domain = `@${domainOf(canonical)}`;

  // An exact address wins over a domain rule, so one mailbox on a shared
  // domain can be pointed at the demo board.
  const exact = rules.find((r) => r.pattern === canonical);
  if (exact) return { ok: true, workspace: exact.workspace, sender, matched: exact.pattern };

  const byDomain = rules.find((r) => r.pattern === domain);
  if (byDomain) return { ok: true, workspace: byDomain.workspace, sender, matched: byDomain.pattern };

  const fallback = defaultWorkspace();
  if (fallback) {
    return { ok: true, workspace: fallback, sender, matched: "BCC_INBOUND_DEFAULT_WORKSPACE" };
  }

  return {
    ok: false,
    sender,
    reason: `${sender} is not a recognised sender. Add it to BCC_INBOUND_SENDERS to let it post to a board.`,
  };
}
