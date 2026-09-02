import {
  HEALTH_RANK,
  followUpHealth,
  isActive,
  nextFollowUp,
  recipientsByProject,
} from "../calc";
import { daysBetween } from "../format";
import { suggestedReason } from "../suggest";
import type { Database, FollowUpHealth } from "../types";

// ---------------------------------------------------------------------------
// The morning digest.
//
// One email, early, listing only what actually needs a decision today:
// what is overdue, what is due, what is active with no next action booked,
// and which bids close this week. Everything else can wait for the dashboard.
// ---------------------------------------------------------------------------

/** How far ahead the digest looks for follow-ups already booked. */
export const LOOK_AHEAD_DAYS = Number(process.env.BCC_DIGEST_LOOKAHEAD_DAYS || 7);

export interface DigestItem {
  projectId: string;
  name: string;
  gc: string;
  value: number;
  stage: string;
  health: FollowUpHealth;
  dueDate: string | null;
  daysLate: number;
  reason: string;
  lastContact: string | null;
}

export interface DigestBid {
  projectId: string;
  name: string;
  gc: string;
  value: number;
  dueDate: string;
  daysAway: number;
}

export interface Digest {
  today: string;
  overdue: DigestItem[];
  dueToday: DigestItem[];
  unscheduled: DigestItem[];
  /** Booked for the next few days — a look-ahead, not a call to act today. */
  comingUp: DigestItem[];
  bidsDueSoon: DigestBid[];
  totals: { activeCount: number; actionValue: number };
}

/**
 * True when there is nothing worth an email.
 *
 * `comingUp` deliberately does not count. A follow-up booked for Thursday
 * would otherwise generate an identical email every morning until Thursday,
 * which is how a daily digest turns into wallpaper. The look-ahead rides
 * along when the email is going out anyway.
 */
export function isQuiet(digest: Digest): boolean {
  return (
    digest.overdue.length === 0 &&
    digest.dueToday.length === 0 &&
    digest.unscheduled.length === 0 &&
    digest.bidsDueSoon.length === 0
  );
}

export function buildDigest(db: Database, today: string): Digest {
  const byProject = recipientsByProject(db.recipients);
  const orgName = (id: string) =>
    db.organizations.find((o) => o.id === id)?.name ?? "No GC";

  const overdue: DigestItem[] = [];
  const dueToday: DigestItem[] = [];
  const unscheduled: DigestItem[] = [];
  const comingUp: DigestItem[] = [];
  const bidsDueSoon: DigestBid[] = [];

  const active = db.projects.filter((p) => isActive(p) && !p.needsReview);

  for (const project of active) {
    const recipients = byProject.get(project.id) ?? [];
    const health = followUpHealth(project, recipients, today);
    const next = nextFollowUp(recipients);
    const recipient = next
      ? recipients.find((r) => r.id === next.recipientId)
      : recipients[0];

    const item: DigestItem = {
      projectId: project.id,
      name: project.name,
      gc: recipient ? orgName(recipient.organizationId) : "No GC",
      value: project.expectedValue,
      stage: project.stage,
      health,
      dueDate: next?.date ?? null,
      daysLate: next?.date ? -(daysBetween(today, next.date) ?? 0) : 0,
      reason: suggestedReason(project, recipient, today),
      lastContact: recipient?.lastContactDate ?? null,
    };

    if (health === "overdue") overdue.push(item);
    else if (health === "due_today") dueToday.push(item);
    else if (health === "unscheduled") unscheduled.push(item);
    else if (next?.date) {
      const away = daysBetween(today, next.date);
      if (away != null && away > 0 && away <= LOOK_AHEAD_DAYS) comingUp.push(item);
    }

    const daysAway = daysBetween(today, project.bidDueDate);
    if (daysAway != null && daysAway >= 0 && daysAway <= 7) {
      bidsDueSoon.push({
        projectId: project.id,
        name: project.name,
        gc: item.gc,
        value: project.expectedValue,
        dueDate: project.bidDueDate!,
        daysAway,
      });
    }
  }

  // Most overdue first, then by size — the order you would actually work them.
  const order = (a: DigestItem, b: DigestItem) =>
    b.daysLate - a.daysLate || b.value - a.value;
  overdue.sort(order);
  dueToday.sort((a, b) => b.value - a.value);
  unscheduled.sort((a, b) => b.value - a.value);
  comingUp.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || b.value - a.value);
  bidsDueSoon.sort((a, b) => a.daysAway - b.daysAway || b.value - a.value);

  return {
    today,
    overdue,
    dueToday,
    unscheduled,
    comingUp,
    bidsDueSoon,
    totals: {
      activeCount: active.length,
      actionValue: [...overdue, ...dueToday, ...unscheduled].reduce(
        (sum, i) => sum + i.value,
        0,
      ),
    },
  };
}

export function sortByUrgency(items: DigestItem[]): DigestItem[] {
  return [...items].sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health]);
}

export function projectUrl(baseUrl: string, projectId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/?project=${encodeURIComponent(projectId)}`;
}

