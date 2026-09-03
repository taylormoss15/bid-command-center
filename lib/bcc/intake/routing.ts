import type { Workspace } from "../auth";

// ---------------------------------------------------------------------------
// Which board does a forwarded email belong on?
//
// One address — bids@yourdomain.com — feeds every workspace, so the sender
// decides where the mail lands. Taylor forwards an invitation, it appears on
// the live board; a salesperson forwards one from the demo mailbox, it appears
// on the demo board and can never touch the real pipeline.
//
// The approved addresses live in each board's own data, managed in the app, so
// standing up a new account is a form rather than a deploy. BCC_INBOUND_SENDERS
// still works and is checked after them — useful for bootstrapping, and for
// keeping one address permanently allowed no matter what the data says.
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

/**
 * Canonical stored form of one rule: a bare "@domain", or a canonical address.
 * Returns null for anything that is not usable as either.
 */
export function normalizeSenderPattern(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.startsWith("@")) {
    const domain = trimmed.slice(1);
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? `@${domain}` : null;
  }

  const address = canonicalAddress(trimmed);
  return /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address) ? address : null;
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
    const pattern = normalizeSenderPattern(left);
    if (!pattern) continue;

    rules.push({ pattern, workspace });
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
 * `stored` is each board's own approved list and is checked first; the
 * environment is the fallback. Within either, an exact address beats a domain
 * rule, so one mailbox on a shared domain can be pointed at the demo board.
 *
 * With nothing configured anywhere, everything goes to the live board — which
 * is how this behaved before sender routing existed, and what a brand new
 * deployment needs in order to receive its first email at all.
 */
export function routeSender(from: string, stored: SenderRule[] = []): SenderRoute {
  const sender = bareAddress(from);
  const env = senderRules();

  if (stored.length === 0 && env.length === 0) {
    return { ok: true, workspace: "live", sender, matched: "no approved senders configured" };
  }
  if (!sender.includes("@")) {
    return { ok: false, sender, reason: "The message had no usable From address." };
  }

  const canonical = canonicalAddress(sender);
  const domain = `@${domainOf(canonical)}`;

  for (const rules of [stored, env]) {
    const exact = rules.find((r) => r.pattern === canonical);
    if (exact) return { ok: true, workspace: exact.workspace, sender, matched: exact.pattern };

    const byDomain = rules.find((r) => r.pattern === domain);
    if (byDomain) {
      return { ok: true, workspace: byDomain.workspace, sender, matched: byDomain.pattern };
    }
  }

  const fallback = defaultWorkspace();
  if (fallback) {
    return { ok: true, workspace: fallback, sender, matched: "BCC_INBOUND_DEFAULT_WORKSPACE" };
  }

  return {
    ok: false,
    sender,
    reason: `${sender} is not an approved sender. Add it under Data & backup → Email intake to let it post to a board.`,
  };
}
