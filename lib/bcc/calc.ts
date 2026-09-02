import {
  ACTIVE_STAGES,
  APPARENT_AWARD_STAGES,
  CLOSED_STAGES,
  STAGE_MAP,
} from "./stages";
import type {
  BidRecipient,
  Database,
  FollowUpHealth,
  FollowUpType,
  Project,
  StageId,
} from "./types";
import { daysBetween } from "./format";

// ---------------------------------------------------------------------------
// The numbers. Four money figures are kept deliberately separate and are never
// summed together, because they mean different things:
//
//   rawProposalVolume    every proposal to every GC — estimating output
//   uniquePipeline       expected value, once per underlying project
//   weightedPipeline     unique value × win probability
//   apparentAwards       selected, not yet contracted
//   contractedBacklog    signed value still to perform
// ---------------------------------------------------------------------------

/**
 * Unconfirmed inbox arrivals are drafts. They stay out of every total, board
 * column, and queue until someone accepts them.
 */
export function isPendingReview(p: Project): boolean {
  return Boolean(p.needsReview);
}

export function isActive(p: Project): boolean {
  return !isPendingReview(p) && ACTIVE_STAGES.includes(p.stage);
}

export function isClosed(p: Project): boolean {
  return CLOSED_STAGES.includes(p.stage);
}

/** Manual override when present, otherwise the stage default. */
export function probabilityOf(p: Project): number {
  return p.probabilityOverride ?? STAGE_MAP[p.stage].defaultProbability;
}

export function isProbabilityOverridden(p: Project): boolean {
  return (
    p.probabilityOverride != null &&
    Math.abs(p.probabilityOverride - STAGE_MAP[p.stage].defaultProbability) > 1e-9
  );
}

export function weightedValue(p: Project): number {
  return p.expectedValue * probabilityOf(p);
}

export function estimatedGrossProfit(p: Project): number | null {
  if (p.estimatedCost == null) return null;
  return p.expectedValue - p.estimatedCost;
}

export function estimatedMargin(p: Project): number | null {
  const gp = estimatedGrossProfit(p);
  if (gp == null || !p.expectedValue) return null;
  return gp / p.expectedValue;
}

export function weightedGrossProfit(p: Project): number | null {
  const gp = estimatedGrossProfit(p);
  if (gp == null) return null;
  return gp * probabilityOf(p);
}

export function currentContractValue(p: Project): number | null {
  if (!p.contract) return null;
  return p.contract.executedValue + p.contract.changeOrders;
}

export function remainingBacklog(p: Project): number | null {
  const ccv = currentContractValue(p);
  if (ccv == null) return null;
  return Math.max(0, ccv - (p.contract?.revenueEarned ?? 0));
}

/** Every proposal sent to every recipient. Estimating volume, not forecast. */
export function rawProposalVolume(recipients: BidRecipient[]): number {
  return recipients.reduce((sum, r) => sum + (r.submittedAmount ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export interface NextFollowUp {
  date: string;
  type: FollowUpType | null;
  recipientId: string;
  organizationId: string;
}

/** The soonest commitment across every GC this project was bid to. */
export function nextFollowUp(recipients: BidRecipient[]): NextFollowUp | null {
  const dated = recipients
    .filter((r) => r.nextFollowUpDate)
    .sort((a, b) => (a.nextFollowUpDate! < b.nextFollowUpDate! ? -1 : 1));
  const first = dated[0];
  if (!first) return null;
  return {
    date: first.nextFollowUpDate!,
    type: first.nextFollowUpType ?? null,
    recipientId: first.id,
    organizationId: first.organizationId,
  };
}

export function followUpHealthForDate(
  today: string,
  date: string | null | undefined,
): Exclude<FollowUpHealth, "unscheduled" | "waiting" | "closed"> | null {
  const diff = daysBetween(today, date);
  if (diff == null) return null;
  if (diff < 0) return "overdue";
  if (diff === 0) return "due_today";
  if (diff <= 3) return "due_soon";
  return "scheduled";
}

/**
 * Project-level follow-up health. Closed projects are exempt; anything active
 * without a next action is surfaced as `unscheduled` rather than hidden.
 */
export function followUpHealth(
  p: Project,
  recipients: BidRecipient[],
  today: string,
): FollowUpHealth {
  if (isClosed(p)) return "closed";
  const next = nextFollowUp(recipients);
  if (!next) {
    const waiting = recipients.some((r) => r.waitingOn);
    return waiting ? "waiting" : "unscheduled";
  }
  return followUpHealthForDate(today, next.date) ?? "scheduled";
}

export const HEALTH_RANK: Record<FollowUpHealth, number> = {
  overdue: 0,
  due_today: 1,
  unscheduled: 2,
  due_soon: 3,
  scheduled: 4,
  waiting: 5,
  closed: 6,
};

export const HEALTH_LABEL: Record<FollowUpHealth, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  due_soon: "Due soon",
  scheduled: "Scheduled",
  unscheduled: "Unscheduled",
  waiting: "Waiting",
  closed: "Closed",
};

/** Days since the last logged activity. */
export function daysSinceActivity(p: Project, today: string): number | null {
  const diff = daysBetween(today, p.lastActivityDate);
  return diff == null ? null : -diff;
}

/** Active, submitted, and quiet for a while — worth a nudge, not a scolding. */
export function isStale(p: Project, today: string, thresholdDays = 14): boolean {
  if (!isActive(p)) return false;
  const since = daysSinceActivity(p, today);
  return since != null && since >= thresholdDays;
}

// ---------------------------------------------------------------------------
// Roll-ups
// ---------------------------------------------------------------------------

export interface Summary {
  uniquePipeline: number;
  weightedPipeline: number;
  apparentAwards: number;
  contractedBacklog: number;
  weightedGrossProfit: number;
  contractedGrossProfit: number;
  rawProposalVolume: number;
  activeCount: number;
  proposalCount: number;
  followUpsDue: number;
  followUpsOverdue: number;
  unscheduled: number;
  bidsDueSoon: number;
  staleCount: number;
  staleValue: number;
}

export function summarize(db: Database, today: string): Summary {
  const byProject = recipientsByProject(db.recipients);
  const active = db.projects.filter(isActive);

  let uniquePipeline = 0;
  let weightedPipeline = 0;
  let wgp = 0;
  for (const p of active) {
    uniquePipeline += p.expectedValue;
    weightedPipeline += weightedValue(p);
    wgp += weightedGrossProfit(p) ?? 0;
  }

  const apparentAwards = db.projects
    .filter((p) => APPARENT_AWARD_STAGES.includes(p.stage))
    .reduce((s, p) => s + p.expectedValue, 0);

  const contracted = db.projects.filter((p) => p.stage === "contracted");
  const contractedBacklog = contracted.reduce(
    (s, p) => s + (remainingBacklog(p) ?? p.expectedValue),
    0,
  );
  const contractedGrossProfit = contracted.reduce(
    (s, p) => s + (estimatedGrossProfit(p) ?? 0),
    0,
  );

  let followUpsDue = 0;
  let followUpsOverdue = 0;
  let unscheduled = 0;
  for (const p of active) {
    const health = followUpHealth(p, byProject.get(p.id) ?? [], today);
    if (health === "overdue") followUpsOverdue += 1;
    if (health === "due_today") followUpsDue += 1;
    if (health === "unscheduled") unscheduled += 1;
  }

  const bidsDueSoon = active.filter((p) => {
    const d = daysBetween(today, p.bidDueDate);
    return d != null && d >= 0 && d <= 7;
  }).length;

  const stale = active.filter((p) => isStale(p, today));

  return {
    uniquePipeline,
    weightedPipeline,
    apparentAwards,
    contractedBacklog,
    weightedGrossProfit: wgp,
    contractedGrossProfit,
    rawProposalVolume: rawProposalVolume(
      db.recipients.filter((r) => {
        const p = db.projects.find((x) => x.id === r.projectId);
        return p ? isActive(p) : false;
      }),
    ),
    activeCount: active.length,
    proposalCount: db.recipients.filter((r) => {
      const p = db.projects.find((x) => x.id === r.projectId);
      return p ? isActive(p) && r.submittedAmount != null : false;
    }).length,
    followUpsDue,
    followUpsOverdue,
    unscheduled,
    bidsDueSoon,
    staleCount: stale.length,
    staleValue: stale.reduce((s, p) => s + p.expectedValue, 0),
  };
}

export function recipientsByProject(
  recipients: BidRecipient[],
): Map<string, BidRecipient[]> {
  const map = new Map<string, BidRecipient[]>();
  for (const r of recipients) {
    const list = map.get(r.projectId);
    if (list) list.push(r);
    else map.set(r.projectId, [r]);
  }
  return map;
}

export interface StageRollup {
  stage: StageId;
  count: number;
  value: number;
  weighted: number;
}

export function pipelineByStage(projects: Project[]): StageRollup[] {
  const map = new Map<StageId, StageRollup>();
  for (const p of projects) {
    const entry = map.get(p.stage) ?? {
      stage: p.stage,
      count: 0,
      value: 0,
      weighted: 0,
    };
    entry.count += 1;
    entry.value += p.expectedValue;
    entry.weighted += weightedValue(p);
    map.set(p.stage, entry);
  }
  return Array.from(map.values());
}

/**
 * Prior-period comparison. We do not keep value snapshots, so "change" is
 * measured against the projects that existed a period ago — honest and cheap.
 */
export function changeSince(
  projects: Project[],
  today: string,
  days: number,
  value: (p: Project) => number,
): { current: number; previous: number; delta: number } {
  const current = projects.reduce((s, p) => s + value(p), 0);
  const previous = projects
    .filter((p) => {
      const age = daysBetween(today, p.createdAt.slice(0, 10));
      return age != null && -age >= days;
    })
    .reduce((s, p) => s + value(p), 0);
  return { current, previous, delta: current - previous };
}
