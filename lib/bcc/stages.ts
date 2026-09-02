import type { PipelineTab, StageId } from "./types";

export interface StageDef {
  id: StageId;
  label: string;
  short: string;
  definition: string;
  /** Default win probability, 0–1. Always overridable per project. */
  defaultProbability: number;
  tab: Exclude<PipelineTab, "all">;
  /** Appears as a column on the bid board. */
  onBoard: boolean;
}

export const STAGES: StageDef[] = [
  {
    id: "identified",
    label: "Identified",
    short: "Identified",
    definition: "Potential opportunity, no complete invitation yet.",
    defaultProbability: 0.05,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "invited",
    label: "Invited to Bid",
    short: "Invited",
    definition: "Invitation and documents received.",
    defaultProbability: 0.1,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "estimating",
    label: "Estimating",
    short: "Estimating",
    definition: "Elite is actively preparing the bid.",
    defaultProbability: 0.15,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "submitted",
    label: "Bid Submitted",
    short: "Submitted",
    definition: "Proposal delivered; limited feedback.",
    defaultProbability: 0.2,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "active_followup",
    label: "Active Follow-up",
    short: "Follow-up",
    definition: "GC confirms the project remains active.",
    defaultProbability: 0.3,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "shortlisted",
    label: "Shortlisted / Pricing Confirmed",
    short: "Shortlisted",
    definition:
      "Clarifications, scope leveling, updated pricing, or meaningful signals.",
    defaultProbability: 0.5,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "apparent_low",
    label: "Apparent Low / Preferred",
    short: "Apparent Low",
    definition: "Strong indication Elite is the intended roofer.",
    defaultProbability: 0.7,
    tab: "bidding",
    onBoard: true,
  },
  {
    id: "verbal_award",
    label: "Verbal Award / Intent",
    short: "Verbal Award",
    definition: "Verbal selection without binding paperwork.",
    defaultProbability: 0.85,
    tab: "awarded",
    onBoard: true,
  },
  {
    id: "contract_received",
    label: "Contract / LOI Received",
    short: "Contract In",
    definition: "Written agreement received and pending execution.",
    defaultProbability: 0.95,
    tab: "awarded",
    onBoard: true,
  },
  {
    id: "contracted",
    label: "Contracted",
    short: "Contracted",
    definition: "Executed subcontract, PO, or binding LOI.",
    defaultProbability: 1,
    tab: "contracted",
    onBoard: true,
  },
  {
    id: "lost",
    label: "Lost",
    short: "Lost",
    definition: "Awarded elsewhere.",
    defaultProbability: 0,
    tab: "closed",
    onBoard: true,
  },
  {
    id: "cancelled",
    label: "Cancelled",
    short: "Cancelled",
    definition: "Project cancelled.",
    defaultProbability: 0,
    tab: "closed",
    onBoard: true,
  },
  {
    id: "dormant",
    label: "Dormant / Postponed",
    short: "Dormant",
    definition: "Not currently active; retained for future follow-up.",
    defaultProbability: 0,
    tab: "closed",
    onBoard: true,
  },
  {
    id: "no_bid",
    label: "No Bid",
    short: "No Bid",
    definition: "Elite declined to bid.",
    defaultProbability: 0,
    tab: "closed",
    onBoard: true,
  },
];

export const STAGE_MAP: Record<StageId, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<StageId, StageDef>;

export const STAGE_ORDER: StageId[] = STAGES.map((s) => s.id);

/** Stages that still represent live opportunity. */
export const ACTIVE_STAGES: StageId[] = STAGES.filter(
  (s) => s.tab === "bidding" || s.tab === "awarded",
).map((s) => s.id);

/** Selected but not yet contracted — "apparent awards". */
export const APPARENT_AWARD_STAGES: StageId[] = [
  "apparent_low",
  "verbal_award",
  "contract_received",
];

export const CLOSED_STAGES: StageId[] = STAGES.filter(
  (s) => s.tab === "closed",
).map((s) => s.id);

export const PIPELINE_TABS: {
  id: PipelineTab;
  label: string;
  stages: StageId[] | null;
  hint: string;
}[] = [
  {
    id: "bidding",
    label: "Bidding",
    stages: STAGES.filter((s) => s.tab === "bidding").map((s) => s.id),
    hint: "Identified through Apparent Low / Preferred",
  },
  {
    id: "awarded",
    label: "Awarded",
    stages: STAGES.filter((s) => s.tab === "awarded").map((s) => s.id),
    hint: "Selected, but no executed agreement yet",
  },
  {
    id: "contracted",
    label: "Contracted",
    stages: ["contracted"],
    hint: "Executed subcontract, PO, or binding LOI",
  },
  {
    id: "closed",
    label: "Closed",
    stages: STAGES.filter((s) => s.tab === "closed").map((s) => s.id),
    hint: "Lost, cancelled, dormant, and no-bid",
  },
  { id: "all", label: "All Projects", stages: null, hint: "Every record" },
];

export function stagesForTab(tab: PipelineTab): StageId[] | null {
  return PIPELINE_TABS.find((t) => t.id === tab)?.stages ?? null;
}

/** Moving into these stages is consequential enough to confirm first. */
export const CONFIRM_STAGES: StageId[] = ["contracted", "lost", "cancelled"];
