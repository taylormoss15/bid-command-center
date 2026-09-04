import { addBusinessDays, toWeekday } from "./format";
import type { Activity, BidRecipient, FollowUpType, Organization, Project } from "./types";

// ---------------------------------------------------------------------------
// The follow-up cadence.
//
// Three messages after a bid goes out, then stop guessing and work to the GC's
// own date. On a $350K–$1M package the GC may still be levelling trades,
// waiting on the owner, or negotiating the prime contract — consistent without
// becoming the roofer asking for an update every four days.
//
//   bid due → 1½ weeks → 3 days → 1 week → ask when to come back → their timeline
//
// The third message is the one that matters. It stops asking "any news?" and
// asks them to name a date, which turns an open-ended chase into a booking and
// buys the right to leave them alone until then.
//
// Counted in business days, because that is how a GC's week runs.
// ---------------------------------------------------------------------------

export interface MessageContext {
  contactName?: string | null;
  projectName: string;
  /** Preferred where the GC is someone Taylor already knows well. */
  familiar?: boolean;
}

export interface CadenceStep {
  step: 1 | 2 | 3;
  label: string;
  /** What this message is for, in one line. */
  goal: string;
  type: FollowUpType;
  /** Business days after the previous touch — or after the bid due date, for step 1. */
  businessDays: number;
  subject: (ctx: MessageContext) => string;
  /** Taylor's wording, verbatim. Not paraphrased, not regenerated. */
  body: (ctx: MessageContext) => string;
}

/**
 * The one-liner for a GC you already know. Offered next to any step rather
 * than swapped in automatically — which of the two to send is a read on the
 * relationship, and that is not a call the software should make.
 */
export function shortVersion(ctx: MessageContext): string {
  const name = ctx.contactName ? ctx.contactName.split(" ")[0] : "there";
  return `Hey ${name} — any movement on ${ctx.projectName}? If it's still a ways out, just give me a date to circle back and I'll get out of your hair until then.`;
}

function greeting(ctx: MessageContext): string {
  return ctx.contactName ? `Hi ${ctx.contactName.split(" ")[0]},` : "Hi,";
}

export const CADENCE: CadenceStep[] = [
  {
    step: 1,
    label: "First follow-up",
    goal: "Confirm they have everything. Do not ask whether you won.",
    type: "confirm_receipt",
    businessDays: 6,
    subject: (c) => `Roofing bid — ${c.projectName}`,
    body: (c) =>
      [
        greeting(c),
        "",
        `Just circling back on our roofing bid for ${c.projectName}. Wanted to make sure you have everything you need from us as you're reviewing numbers.`,
        "",
        "Happy to answer any questions, clarify scope, or look at any alternates if helpful.",
        "",
        "Thanks,",
        "Taylor",
      ].join("\n"),
  },
  {
    step: 2,
    label: "Second follow-up",
    goal: "Now it is fair to ask where things stand.",
    type: "bid_leveling",
    businessDays: 3,
    subject: (c) => `Roofing package — ${c.projectName}`,
    body: (c) =>
      [
        greeting(c),
        "",
        `Wanted to check back in on the roofing package for ${c.projectName}. Have you started leveling the roofing bids yet?`,
        "",
        "If you have any questions on our scope or there's anything we need to tighten up to make sure we're apples-to-apples, let me know.",
        "",
        "Thanks,",
        "Taylor",
      ].join("\n"),
  },
  {
    step: 3,
    label: "Ask for a date",
    goal: "Stop chasing. Get them to name when to come back, then honour it.",
    type: "award_timing",
    businessDays: 5,
    subject: (c) => `${c.projectName} — when should I circle back?`,
    body: (c) =>
      [
        greeting(c),
        "",
        `Checking back on ${c.projectName}. I know these larger projects can take a while to work through.`,
        "",
        "If the roofing award is still a ways out, no problem at all. Do you have a rough date you'd like me to circle back with you? I'll make a note on my end and follow up then.",
        "",
        "Thanks,",
        "Taylor",
      ].join("\n"),
  },
];

/**
 * Once a GC is actually engaged — asking questions, requesting revisions,
 * checking pricing is still good — the three-message cadence no longer
 * applies. Answer them immediately, and chase every week or so if it goes
 * quiet.
 */
export const ENGAGED_BUSINESS_DAYS = 6;

/**
 * Once the three messages are spent and no date was ever offered, come back on
 * a slow rhythm rather than stopping altogether — the midpoint of 5–10.
 */
export const AFTER_CADENCE_BUSINESS_DAYS = 7;

/** Where the three scripted messages actually make sense. */
const CADENCE_STAGE = "submitted";

/** They are talking to you. Answer fast, chase weekly, skip the script. */
const ENGAGED_STAGES = new Set(["active_followup", "shortlisted", "apparent_low"]);

/** Won on the phone, chasing paper. A different conversation again. */
const AWARD_STAGES = new Set(["verbal_award", "contract_received"]);

export interface CadencePlan {
  /** null once the cadence is spent — work to the GC's own date from here. */
  step: CadenceStep | null;
  date: string;
  type: FollowUpType;
  /** Why this date, in words, for the person about to accept it. */
  why: string;
  /** True when the GC is engaged and the generic cadence is set aside. */
  engaged: boolean;
}

/** How many cadence touches have already been made on this bid path. */
export function touchesSince(
  activities: Activity[],
  recipientId: string,
  since: string | null | undefined,
): number {
  return activities.filter(
    (a) =>
      a.recipientId === recipientId &&
      a.kind === "touch" &&
      (!since || a.at.slice(0, 10) >= since),
  ).length;
}

/** When the proposal actually went out. Used to decide which touches count. */
export function submittedOn(project: Project, recipient?: BidRecipient | null): string | null {
  return recipient?.submittedDate ?? project.bidSubmittedDate ?? null;
}

/**
 * The day the first follow-up counts forward from: the later of the bid due
 * date and the day it was sent.
 *
 * Submitting a week early must not mean chasing a week early — until the due
 * date passes the GC has nothing to level against, so a call then is noise. A
 * revision sent after the due date does move the clock, because that is the
 * number they are now looking at.
 */
export function cadenceAnchor(
  project: Project,
  recipient?: BidRecipient | null,
): string | null {
  const due = project.bidDueDate?.slice(0, 10) ?? null;
  const sent = submittedOn(project, recipient);
  if (due && sent) return due > sent ? due : sent;
  return due ?? sent;
}

/**
 * What to book next, and why.
 *
 * `from` is the day the cadence counts forward from — normally today, but the
 * bid due date when nothing has been sent yet, so a bid submitted early still
 * gets its first chase a week after the due date rather than a week after
 * submission.
 */
export function nextInCadence(
  project: Project,
  recipient: BidRecipient | null | undefined,
  activities: Activity[],
  today: string,
): CadencePlan {
  const engaged = ENGAGED_STAGES.has(project.stage) || Boolean(recipient?.waitingOn);

  if (recipient?.waitingOn) {
    return {
      step: null,
      date: recipient.nextFollowUpDate ?? toWeekday(addBusinessDays(today, ENGAGED_BUSINESS_DAYS)),
      type: recipient.nextFollowUpType ?? "award_timing",
      why: `Waiting on ${recipient.waitingOn} — keep their date, do not chase.`,
      engaged: true,
    };
  }

  if (engaged) {
    return {
      step: null,
      date: toWeekday(addBusinessDays(today, ENGAGED_BUSINESS_DAYS)),
      type: recipient?.nextFollowUpType ?? "bid_leveling",
      why: "They're engaged — answer anything they ask straight away, and chase about weekly if it goes quiet.",
      engaged: true,
    };
  }

  if (AWARD_STAGES.has(project.stage)) {
    return {
      step: null,
      date: toWeekday(addBusinessDays(today, ENGAGED_BUSINESS_DAYS)),
      type: "contract_status",
      why: "Awarded but not papered. Chase the contract, not the bid — weekly until it is signed.",
      engaged: true,
    };
  }

  // Before a bid goes out there is nothing to chase, so the scripted cadence
  // stays out of the way rather than proposing a bid-receipt email for a job
  // still being estimated.
  if (project.stage !== CADENCE_STAGE) {
    return {
      step: null,
      date: toWeekday(addBusinessDays(today, ENGAGED_BUSINESS_DAYS)),
      type: recipient?.nextFollowUpType ?? "confirm_scope",
      why: "The bid follow-up cadence starts once a proposal has gone out. Until then, book what this stage needs.",
      engaged: false,
    };
  }

  const anchor = cadenceAnchor(project, recipient);
  const done = recipient
    ? touchesSince(activities, recipient.id, submittedOn(project, recipient))
    : 0;
  const step = CADENCE[Math.min(done, CADENCE.length - 1)];

  // Nothing sent yet: count from the bid due date, so submitting early does
  // not mean chasing early.
  if (done === 0 && anchor) {
    const date = toWeekday(addBusinessDays(anchor, step.businessDays));
    const due = project.bidDueDate?.slice(0, 10) ?? null;
    const from = anchor === due ? "the bid was due" : "it went out";
    return {
      step,
      date: date > today ? date : toWeekday(addBusinessDays(today, 1)),
      type: step.type,
      why:
        date > today
          ? `${step.label} — about a week after ${from}.`
          : `${step.label} — already past due, so first thing tomorrow.`,
      engaged: false,
    };
  }

  if (done >= CADENCE.length) {
    return {
      step: null,
      date: toWeekday(addBusinessDays(today, AFTER_CADENCE_BUSINESS_DAYS)),
      type: "award_timing",
      why: "Three messages sent. Do not keep guessing — use the date they gave you. If they never gave one, back in a week or two.",
      engaged: false,
    };
  }

  return {
    step,
    date: toWeekday(addBusinessDays(today, step.businessDays)),
    type: step.type,
    why: `${step.label} — ${step.businessDays} business days on.`,
    engaged: false,
  };
}

/** The message to send for a plan, ready to paste into an email. */
export function messageFor(
  plan: CadencePlan,
  project: Project,
  recipient: BidRecipient | null | undefined,
  organization: Organization | null | undefined,
): { subject: string; body: string; short: string; familiar: boolean } | null {
  if (!plan.step) return null;
  const familiar =
    organization?.relationship === "strong" || organization?.relationship === "preferred";
  const ctx: MessageContext = {
    contactName: recipient?.contactName,
    projectName: project.name,
    familiar,
  };
  return {
    subject: plan.step.subject(ctx),
    body: plan.step.body(ctx),
    short: shortVersion(ctx),
    familiar,
  };
}
