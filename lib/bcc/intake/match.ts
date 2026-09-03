import type { Database, Organization, Project } from "../types";

import { senderDomain } from "./routing";

// ---------------------------------------------------------------------------
// Recognising what we already know.
//
// The whole model rests on one project per physical opportunity, however many
// GCs bid it. So when a second invitation arrives for a job already on the
// board, the right answer is a new bid recipient on the existing project — not
// a second project quietly doubling the pipeline.
//
// Matching is deliberately cautious. A miss costs a duplicate card Taylor can
// merge by hand; a false match attaches a GC to the wrong job.
// ---------------------------------------------------------------------------

/** Words that carry no identifying weight in a roofing project name. */
const NOISE = new Set([
  "project", "projects", "job", "bid", "bids", "roof", "roofing", "roofs",
  "reroof", "re", "replacement", "replace", "new", "the", "and", "at", "of",
  "for", "phase", "building", "bldg", "construction", "invitation", "itb",
  "rfp", "addendum", "add", "no", "package", "pkg", "scope", "division",
  "div", "section", "update", "updated", "revised", "rev", "fwd", "re",
]);

/**
 * Legal-entity suffixes only. Run after punctuation has gone, so "Inc." and
 * "L.L.C." arrive here as bare words — hence no dotted variants.
 *
 * Trade words stay: "Wasatch Builders" and "Wasatch Construction" are two
 * different companies, and guessing otherwise merges two GCs into one.
 */
const LEGAL_SUFFIX = /\b(inc|incorporated|llc|l\s*l\s*c|ltd|limited|co|corp|corporation|company)\b/g;

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Identifying tokens only — the words that would let a person tell two jobs apart. */
export function nameTokens(value: string): Set<string> {
  return new Set(words(value).filter((w) => w.length > 1 && !NOISE.has(w)));
}

/** Sørensen–Dice over token sets: 1 is identical, 0 is nothing in common. */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function normalizedAddress(value: string | null | undefined): string {
  if (!value) return "";
  return words(value)
    .map((w) =>
      w
        .replace(/^(north|n)$/, "n")
        .replace(/^(south|s)$/, "s")
        .replace(/^(east|e)$/, "e")
        .replace(/^(west|w)$/, "w")
        .replace(/^(street|st)$/, "st")
        .replace(/^(avenue|ave)$/, "ave")
        .replace(/^(road|rd)$/, "rd")
        .replace(/^(drive|dr)$/, "dr")
        .replace(/^(boulevard|blvd)$/, "blvd")
        .replace(/^(parkway|pkwy)$/, "pkwy")
        .replace(/^(lane|ln)$/, "ln"),
    )
    .join(" ");
}

/** Stages where a new invitation means a genuinely new opportunity, not this one. */
const CLOSED = new Set(["lost", "cancelled", "contracted", "no_bid"]);

export interface ProjectMatch {
  project: Project;
  score: number;
  /** Plain-language reason, shown to the reviewer. */
  why: string;
}

export interface MatchInput {
  projectName: string;
  city?: string | null;
  addressLine?: string | null;
}

/**
 * Finds the project a forwarded invitation is about, if it is already on the
 * board. Only open projects touched in the last six months are considered — a
 * job lost last spring coming round again is a new opportunity.
 */
export function findExistingProject(
  db: Database,
  input: MatchInput,
  today = new Date().toISOString().slice(0, 10),
): ProjectMatch | null {
  const incoming = nameTokens(input.projectName);
  if (incoming.size === 0) return null;

  const incomingAddress = normalizedAddress(input.addressLine);
  const incomingCity = (input.city ?? "").trim().toLowerCase();
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);

  let best: ProjectMatch | null = null;

  for (const project of db.projects) {
    if (CLOSED.has(project.stage)) continue;
    if (new Date(project.updatedAt) < cutoff) continue;

    const city = project.city.trim().toLowerCase();
    const sameCity = Boolean(incomingCity) && incomingCity === city;
    const cityConflict = Boolean(incomingCity) && Boolean(city) && incomingCity !== city;

    const address = normalizedAddress(project.addressLine);
    if (incomingAddress && address && incomingAddress === address) {
      const match = { project, score: 1, why: `same address as ${project.code}` };
      if (!best || match.score > best.score) best = match;
      continue;
    }

    const score = tokenOverlap(incoming, nameTokens(project.name));

    // An exact name is enough on its own. A partial name needs the city to
    // agree, or at least not to disagree.
    const accepted =
      score >= 0.99 ||
      (score >= 0.7 && sameCity) ||
      (score >= 0.82 && !cityConflict);

    if (accepted && (!best || score > best.score)) {
      best = {
        project,
        score,
        why:
          score >= 0.99
            ? `same name as ${project.code}`
            : sameCity
              ? `close name match to ${project.code}, same city`
              : `close name match to ${project.code}`,
      };
    }
  }

  return best;
}

function withoutLegalSuffix(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds the organization a GC name or email address refers to. Tries the name
 * as written, then the name with "Inc"/"LLC"/"Construction" and friends
 * stripped, then the email domain of anyone already on file — which is how a
 * GC who emails from a new person's mailbox still lands under the right
 * company.
 */
export function findOrganization(
  db: Database,
  gcName: string | null | undefined,
  contactEmail?: string | null,
): Organization | null {
  const gcs = db.organizations;

  const name = gcName?.trim();
  if (name) {
    const exact = gcs.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;

    const stripped = withoutLegalSuffix(name);
    if (stripped.length > 3) {
      const loose = gcs.find((o) => withoutLegalSuffix(o.name) === stripped);
      if (loose) return loose;
    }
  }

  const domain = contactEmail ? senderDomain(contactEmail) : "";
  if (domain && !isFreeMailDomain(domain)) {
    const byDomain = gcs.find((o) =>
      o.contacts.some((c) => c.email && senderDomain(c.email) === domain),
    );
    if (byDomain) return byDomain;
  }

  return null;
}

/** A shared mailbox tells you nothing about which company someone works for. */
export function isFreeMailDomain(domain: string): boolean {
  return [
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "comcast.net",
    "protonmail.com", "proton.me", "mac.com", "sbcglobal.net",
  ].includes(domain);
}
