// ---------------------------------------------------------------------------
// Bid Command Center — core domain types.
//
// The central modelling rule: a Project is the unique physical opportunity. A
// BidRecipient is one proposal path from that project to one GC/client. Value
// and probability live on the Project so pipeline totals never double-count;
// submitted amounts and follow-ups live on the BidRecipient.
// ---------------------------------------------------------------------------

export type StageId =
  | "identified"
  | "invited"
  | "estimating"
  | "submitted"
  | "active_followup"
  | "shortlisted"
  | "apparent_low"
  | "verbal_award"
  | "contract_received"
  | "contracted"
  | "lost"
  | "cancelled"
  | "dormant"
  | "no_bid";

/** Saved filtered views over Stage. Stage stays the authoritative field. */
export type PipelineTab = "bidding" | "awarded" | "contracted" | "closed" | "all";

export type ProjectType =
  | "commercial"
  | "multifamily"
  | "municipal"
  | "institutional"
  | "residential"
  | "service";

export type WorkType = "new_construction" | "reroof" | "repair" | "restoration";

export type DateConfidence = "firm" | "probable" | "rough" | "unknown";

export type Signal =
  | "strong_positive"
  | "positive"
  | "neutral"
  | "negative"
  | "strong_negative";

export type FollowUpType =
  | "confirm_receipt"
  | "confirm_scope"
  | "bid_leveling"
  | "pricing_confirmation"
  | "scope_clarification"
  | "addendum"
  | "value_engineering"
  | "award_timing"
  | "contract_status"
  | "schedule_confirmation"
  | "submittals"
  | "relationship"
  | "other";

export type ContactMethod = "call" | "email" | "text" | "meeting" | "portal";

export type FollowUpHealth =
  | "overdue"
  | "due_today"
  | "due_soon"
  | "scheduled"
  | "unscheduled"
  | "waiting"
  | "closed";

export type Competition = "low" | "medium" | "high" | "unknown";
export type PricingPosition = "low" | "competitive" | "high" | "unknown";
export type Relationship = "new" | "developing" | "strong" | "preferred";
export type Priority = "must_win" | "high" | "normal" | "low";
export type CashFlowRisk = "low" | "medium" | "high";
export type Outcome = "won" | "lost" | "cancelled" | "postponed" | "no_bid";

export interface BidRevision {
  id: string;
  revision: number;
  amount: number;
  date: string; // ISO date
  note?: string;
}

export interface BidRecipient {
  id: string;
  projectId: string;
  organizationId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  /** Latest amount actually submitted to this GC. */
  submittedAmount?: number | null;
  submittedDate?: string | null;
  status?: string;
  clarifications?: string;
  lastContactDate?: string | null;
  nextFollowUpDate?: string | null;
  nextFollowUpType?: FollowUpType | null;
  /** Intentionally waiting on a known future event — suppresses "unscheduled". */
  waitingOn?: string | null;
  signal?: Signal | null;
  feedback?: string;
  revisions: BidRevision[];
}

export interface Contract {
  executedValue: number;
  changeOrders: number;
  revenueEarned: number;
  retainagePct: number;
  contractDate?: string | null;
  bondIncluded?: boolean;
  bondCost?: number | null;
}

export interface ProjectOutcome {
  result: Outcome;
  date?: string | null;
  awardedTo?: string | null;
  winningAmount?: number | null;
  reason?: string;
  competitor?: string | null;
  lessons?: string;
  eligibleForRebid?: boolean;
}

/** Provenance for a project that arrived by forwarded email rather than by hand. */
export interface Intake {
  source: "email";
  receivedAt: string;
  from: string;
  subject: string;
  /** The original message, kept so the reviewer can check the extraction. */
  body: string;
  extractedBy: "claude" | "heuristic";
  model?: string | null;
  confidence: "high" | "medium" | "low";
  /** What the extractor was unsure about — shown to the reviewer verbatim. */
  uncertainties: string[];
  reviewedAt?: string | null;
}

export interface Project {
  id: string;
  code: string; // human-facing project ID, e.g. ER-2026-041
  name: string;
  description?: string;

  // Identity / location
  addressLine?: string;
  city: string;
  state: string;
  zip?: string;
  projectType: ProjectType;
  workType: WorkType;
  isPublic?: boolean;
  owner?: string;
  architect?: string;
  source?: string;
  trelloUrl?: string | null;
  bidPlatformUrl?: string | null;

  // Sales position
  stage: StageId;
  /** null = use the stage default. Any number = explicit manual override. */
  probabilityOverride: number | null;

  // Money — all values are for the unique project, never per-recipient.
  expectedValue: number;
  valueRangeLow?: number | null;
  valueRangeHigh?: number | null;
  estimatedCost?: number | null;
  retainagePct?: number | null;
  cashFlowRisk?: CashFlowRisk;

  // Scope
  materials: string[];
  manufacturer?: string;
  warranty?: string;
  roofAreaSqFt?: number | null;
  buildings?: number | null;
  stories?: number | null;
  scopeFlags: string[];

  // Dates
  invitationDate?: string | null;
  siteWalkDate?: string | null;
  rfiDeadline?: string | null;
  bidDueDate?: string | null; // ISO datetime when a time was entered
  bidSubmittedDate?: string | null;
  originalAwardDate?: string | null;
  anticipatedAwardDate?: string | null;
  expectedContractDate?: string | null;
  installStart?: string | null;
  installEnd?: string | null;
  dateConfidence: DateConfidence;
  lastActivityDate?: string | null;

  // People
  estimator: string;
  projectManager?: string;

  // Intelligence
  competition?: Competition;
  competitors?: string[];
  pricingPosition?: PricingPosition;
  relationship?: Relationship;
  priority?: Priority;
  fitScore?: number | null;
  winReason?: string;
  primaryRisk?: string;
  valueEngineering?: string;
  scopeCompared?: boolean;
  bidLeveled?: boolean;
  pricingCurrent?: boolean;

  contract?: Contract | null;
  outcome?: ProjectOutcome | null;

  /** Set when the project came in from the inbox and has not been confirmed. */
  intake?: Intake | null;
  needsReview?: boolean;

  createdAt: string;
  updatedAt: string;
}

export type ActivityKind =
  | "touch"
  | "stage_change"
  | "note"
  | "bid_submitted"
  | "system";

export interface Activity {
  id: string;
  projectId: string;
  recipientId?: string | null;
  at: string; // ISO datetime
  kind: ActivityKind;
  method?: ContactMethod | null;
  contact?: string | null;
  note?: string;
  signal?: Signal | null;
  /** Human-readable summary rendered in the timeline. */
  summary: string;
  author?: string;
}

export interface Organization {
  id: string;
  name: string;
  type: "gc" | "owner" | "developer" | "architect" | "supplier";
  city?: string;
  state?: string;
  relationship: Relationship;
  notes?: string;
  paymentSpeed?: string;
  contacts: { name: string; title?: string; email?: string; phone?: string }[];
}

export interface Database {
  projects: Project[];
  recipients: BidRecipient[];
  organizations: Organization[];
  activities: Activity[];
  updatedAt: string;
}
