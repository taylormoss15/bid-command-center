import type {
  ContactMethod,
  FollowUpType,
  ProjectType,
  Signal,
  WorkType,
} from "./types";

/** Roofing systems. `abbr` is what fits on a board card. */
export const MATERIALS: { id: string; label: string; abbr: string }[] = [
  { id: "tpo", label: "TPO", abbr: "TPO" },
  { id: "epdm", label: "EPDM", abbr: "EPDM" },
  { id: "pvc", label: "PVC", abbr: "PVC" },
  { id: "hydrotech", label: "Hydrotech / hot rubber", abbr: "HYDRO" },
  { id: "mod_bit", label: "Modified bitumen", abbr: "MOD BIT" },
  { id: "bur", label: "Built-up roofing", abbr: "BUR" },
  { id: "shingles", label: "Shingles", abbr: "SHINGLE" },
  { id: "standing_seam", label: "Standing-seam metal", abbr: "SSM" },
  { id: "sheet_metal", label: "Sheet metal / coping", abbr: "METAL" },
  { id: "pavers", label: "Pavers", abbr: "PAVER" },
  { id: "ballast", label: "Ballast", abbr: "BALLAST" },
  { id: "green_roof", label: "Green roof", abbr: "GREEN" },
  { id: "coatings", label: "Coatings", abbr: "COAT" },
  { id: "insulation", label: "Insulation / tapered", abbr: "TAPER" },
];

export const MATERIAL_MAP = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
) as Record<string, { id: string; label: string; abbr: string }>;

export function materialLabel(id: string): string {
  return MATERIAL_MAP[id]?.label ?? id;
}

export function materialAbbr(id: string): string {
  return MATERIAL_MAP[id]?.abbr ?? id.toUpperCase();
}

export const MANUFACTURERS = [
  "Carlisle",
  "Holcim / Firestone",
  "GAF",
  "Johns Manville",
  "Sika Sarnafil",
  "Owens Corning",
  "Versico",
  "Soprema",
  "Tremco",
  "Hydrotech",
];

export const SCOPE_FLAGS: { id: string; label: string }[] = [
  { id: "demolition", label: "Demolition" },
  { id: "deck_replacement", label: "Deck replacement" },
  { id: "pavers", label: "Pavers" },
  { id: "drains", label: "Drains" },
  { id: "taper", label: "Tapered insulation" },
  { id: "fall_protection", label: "Fall protection" },
  { id: "bonding", label: "Bonding required" },
  { id: "ocip", label: "OCIP / CCIP" },
  { id: "prevailing_wage", label: "Prevailing wage" },
  { id: "crane", label: "Crane required" },
  { id: "winter", label: "Winter conditions" },
  { id: "phased", label: "Phased / occupied building" },
];

export const SCOPE_FLAG_MAP = Object.fromEntries(
  SCOPE_FLAGS.map((f) => [f.id, f.label]),
) as Record<string, string>;

export const FOLLOW_UP_TYPES: { id: FollowUpType; label: string }[] = [
  { id: "confirm_receipt", label: "Confirm bid receipt" },
  { id: "confirm_scope", label: "Confirm inclusions / exclusions" },
  { id: "bid_leveling", label: "Bid leveling / status" },
  { id: "pricing_confirmation", label: "Pricing confirmation" },
  { id: "scope_clarification", label: "Scope clarification" },
  { id: "addendum", label: "Addendum / revision" },
  { id: "value_engineering", label: "Value engineering" },
  { id: "award_timing", label: "Award timing" },
  { id: "contract_status", label: "Contract status" },
  { id: "schedule_confirmation", label: "Schedule confirmation" },
  { id: "submittals", label: "Submittals / procurement" },
  { id: "relationship", label: "Relationship touch" },
  { id: "other", label: "Other" },
];

export const FOLLOW_UP_TYPE_MAP = Object.fromEntries(
  FOLLOW_UP_TYPES.map((t) => [t.id, t.label]),
) as Record<FollowUpType, string>;

export const CONTACT_METHODS: { id: ContactMethod; label: string }[] = [
  { id: "call", label: "Call" },
  { id: "email", label: "Email" },
  { id: "text", label: "Text" },
  { id: "meeting", label: "Meeting" },
  { id: "portal", label: "Portal" },
];

export const SIGNALS: {
  id: Signal;
  label: string;
  short: string;
  tone: "up" | "mid" | "down";
}[] = [
  { id: "strong_positive", label: "Strong positive", short: "++", tone: "up" },
  { id: "positive", label: "Positive", short: "+", tone: "up" },
  { id: "neutral", label: "Neutral", short: "=", tone: "mid" },
  { id: "negative", label: "Negative", short: "−", tone: "down" },
  { id: "strong_negative", label: "Strong negative", short: "−−", tone: "down" },
];

export const SIGNAL_MAP = Object.fromEntries(
  SIGNALS.map((s) => [s.id, s]),
) as Record<Signal, (typeof SIGNALS)[number]>;

export const PROJECT_TYPES: { id: ProjectType; label: string }[] = [
  { id: "commercial", label: "Commercial" },
  { id: "multifamily", label: "Multifamily" },
  { id: "municipal", label: "Municipal" },
  { id: "institutional", label: "Institutional" },
  { id: "residential", label: "Residential" },
  { id: "service", label: "Service" },
];

export const WORK_TYPES: { id: WorkType; label: string }[] = [
  { id: "new_construction", label: "New construction" },
  { id: "reroof", label: "Reroof" },
  { id: "repair", label: "Repair" },
  { id: "restoration", label: "Restoration" },
];

export const DATE_CONFIDENCE = [
  { id: "firm", label: "Firm" },
  { id: "probable", label: "Probable" },
  { id: "rough", label: "Rough" },
  { id: "unknown", label: "Unknown" },
] as const;

export const ESTIMATORS = [
  "Taylor Moss",
  "Dana Whitaker",
  "Marcus Idle",
  "Priya Raman",
];
