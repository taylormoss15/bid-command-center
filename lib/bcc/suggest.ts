import { daysBetween } from "./format";
import type { BidRecipient, FollowUpType, Project, StageId } from "./types";
import { FOLLOW_UP_TYPE_MAP } from "./taxonomy";

/** What this stage usually needs next, when nothing more specific is recorded. */
const STAGE_DEFAULT_TYPE: Record<StageId, FollowUpType> = {
  identified: "relationship",
  invited: "confirm_scope",
  estimating: "scope_clarification",
  submitted: "confirm_receipt",
  active_followup: "bid_leveling",
  shortlisted: "pricing_confirmation",
  apparent_low: "award_timing",
  verbal_award: "contract_status",
  contract_received: "contract_status",
  contracted: "schedule_confirmation",
  lost: "relationship",
  cancelled: "relationship",
  dormant: "relationship",
  no_bid: "relationship",
};

/**
 * A short, specific reason to make the call. Prefers what was actually booked,
 * then falls back to what the stage and elapsed time imply.
 */
export function suggestedReason(
  project: Project,
  recipient: BidRecipient | undefined,
  today: string,
): string {
  if (recipient?.waitingOn) return `Waiting on ${recipient.waitingOn}`;

  if (recipient?.nextFollowUpType) {
    return FOLLOW_UP_TYPE_MAP[recipient.nextFollowUpType];
  }

  const sinceContact = recipient?.lastContactDate
    ? -(daysBetween(today, recipient.lastContactDate) ?? 0)
    : null;

  const awardSlipped =
    project.anticipatedAwardDate &&
    (daysBetween(today, project.anticipatedAwardDate) ?? 1) < 0;

  if (awardSlipped) return "Award date has passed — get a new one";
  if (sinceContact != null && sinceContact >= 21) return "No contact in three weeks";
  if (project.stage === "submitted" && sinceContact == null) return "Confirm bid receipt";
  if (project.pricingCurrent === false) return "Reconfirm pricing before it goes stale";

  return FOLLOW_UP_TYPE_MAP[STAGE_DEFAULT_TYPE[project.stage]];
}

/** One-line nudge for the stale list — useful, never accusatory. */
export function staleReason(project: Project, today: string): string {
  const since = project.lastActivityDate
    ? -(daysBetween(today, project.lastActivityDate) ?? 0)
    : null;
  if (since == null) return "No activity recorded yet";
  if (project.stage === "estimating") return `Estimating for ${since} days without an update`;
  if (project.stage === "submitted") return `Submitted, then quiet for ${since} days`;
  return `Quiet for ${since} days`;
}
