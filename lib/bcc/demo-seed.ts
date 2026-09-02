import { toISODate } from "./format";
import { buildSeed } from "./seed";
import { STAGES } from "./stages";
import type {
  Activity,
  BidRecipient,
  Database,
  Organization,
  Project,
  ProjectType,
  StageId,
  WorkType,
} from "./types";

// ---------------------------------------------------------------------------
// The demo pipeline.
//
// The handcrafted projects in seed.ts carry the stories worth telling — the
// four-GC example, the verbal award waiting on paperwork, the loss with a
// known competitor. This file surrounds them with enough ordinary work that
// the board, the forecast, and the win-rate charts look like a real company's
// year rather than a screenshot.
//
// Generation is deterministic: the same day always produces the same demo, so
// a walkthrough can be rehearsed.
// ---------------------------------------------------------------------------

/** Small LCG — deterministic, and good enough to sprinkle plausible variety. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const EXTRA_ORGS: Organization[] = [
  { id: "org-arco", name: "ARCO/Murray", type: "gc", city: "Salt Lake City", state: "UT", relationship: "developing", paymentSpeed: "40 days", contacts: [{ name: "Devin Marchetti", title: "Project Executive", email: "dmarchetti@example.com" }] },
  { id: "org-mountain", name: "Mountain Ridge Builders", type: "gc", city: "Lehi", state: "UT", relationship: "strong", paymentSpeed: "30 days", contacts: [{ name: "Alicia Thorne", title: "Estimator", email: "athorne@example.com" }] },
  { id: "org-summitgc", name: "Summit Valley Construction", type: "gc", city: "Provo", state: "UT", relationship: "developing", contacts: [{ name: "Rafael Ocampo", title: "Preconstruction", email: "rocampo@example.com" }] },
  { id: "org-canyon", name: "Canyon Rim Contractors", type: "gc", city: "Sandy", state: "UT", relationship: "new", contacts: [{ name: "Bethany Oyelaran", title: "Estimator", email: "boyelaran@example.com" }] },
  { id: "org-granitebuild", name: "Granite Peak Builders", type: "gc", city: "Ogden", state: "UT", relationship: "strong", paymentSpeed: "35 days", contacts: [{ name: "Kurt Halvorsen", title: "Senior PM", email: "khalvorsen@example.com" }] },
  { id: "org-westfield", name: "Westfield Commercial", type: "gc", city: "West Jordan", state: "UT", relationship: "developing", contacts: [{ name: "Simone Bradbury", title: "Estimator", email: "sbradbury@example.com" }] },
  { id: "org-pioneer", name: "Pioneer Construction Group", type: "gc", city: "Layton", state: "UT", relationship: "preferred", paymentSpeed: "30 days", notes: "Four wins in two years. Sends us the drawings before the invitation goes out.", contacts: [{ name: "Marcus Delaine", title: "VP Preconstruction", email: "mdelaine@example.com" }] },
  { id: "org-basin", name: "Basin Industrial Builders", type: "gc", city: "Tooele", state: "UT", relationship: "new", contacts: [{ name: "Yusuf Adeyemi", title: "Estimator", email: "yadeyemi@example.com" }] },
  { id: "org-redrock", name: "Red Rock Construction", type: "gc", city: "St. George", state: "UT", relationship: "developing", contacts: [{ name: "Kenji Nakashima", title: "Estimator", email: "knakashima@example.com" }] },
  { id: "org-heritage", name: "Heritage Building Co.", type: "gc", city: "Bountiful", state: "UT", relationship: "strong", contacts: [{ name: "Priscilla Vandenberg", title: "PM", email: "pvandenberg@example.com" }] },
];

const PLACES: [string, string][] = [
  ["Sandy", "84070"], ["Draper", "84020"], ["Lehi", "84043"], ["Orem", "84057"],
  ["Provo", "84604"], ["Ogden", "84401"], ["Logan", "84341"], ["Layton", "84041"],
  ["Bountiful", "84010"], ["Murray", "84107"], ["Riverton", "84065"],
  ["Herriman", "84096"], ["Eagle Mountain", "84005"], ["Saratoga Springs", "84045"],
  ["Tooele", "84074"], ["Spanish Fork", "84660"], ["American Fork", "84003"],
  ["Pleasant Grove", "84062"], ["Springville", "84663"], ["Vineyard", "84059"],
  ["West Jordan", "84088"], ["South Jordan", "84095"], ["Kaysville", "84037"],
  ["Farmington", "84025"], ["Clearfield", "84015"], ["Syracuse", "84075"],
  ["Heber City", "84032"], ["Park City", "84098"], ["Midvale", "84047"],
  ["Taylorsville", "84118"], ["Cedar City", "84720"], ["St. George", "84770"],
];

const PREFIXES = [
  "Willow Creek", "Silverleaf", "Copper Hollow", "Timber Ridge", "Aspen Grove",
  "Quarry Bend", "Fox Run", "Kestrel", "Larkspur", "Hollis", "Marigold",
  "Ironwood", "Sandhill", "Bramble Park", "Juniper Point", "Meridian",
  "Stonebridge", "Alder Field", "Northgate", "Halcyon", "Cobalt Works",
  "Peregrine", "Wexford", "Bluffdale Commons", "Dunmore", "Vantage",
  "Harrow Point", "Cinderwood", "Tallgrass", "Bellwether", "Orchard Gate",
  "Selby", "Rookery", "Fernwood", "Callister", "Ravenhill",
];

interface Kind {
  suffix: string;
  type: ProjectType;
  work: WorkType[];
  low: number;
  high: number;
  materials: string[][];
  flags: string[];
  areaPerDollar: number;
}

const KINDS: Kind[] = [
  { suffix: "Distribution Center", type: "commercial", work: ["new_construction"], low: 700_000, high: 2_800_000, materials: [["tpo", "insulation", "sheet_metal"]], flags: ["crane", "taper", "fall_protection"], areaPerDollar: 0.13 },
  { suffix: "Medical Plaza", type: "institutional", work: ["new_construction", "reroof"], low: 320_000, high: 950_000, materials: [["tpo", "insulation", "sheet_metal"], ["epdm", "insulation", "pavers"]], flags: ["phased", "taper", "fall_protection"], areaPerDollar: 0.1 },
  { suffix: "Business Park — Building C", type: "commercial", work: ["new_construction"], low: 280_000, high: 720_000, materials: [["tpo", "insulation"]], flags: ["fall_protection"], areaPerDollar: 0.12 },
  { suffix: "Elementary School", type: "municipal", work: ["reroof"], low: 480_000, high: 1_600_000, materials: [["pvc", "insulation", "sheet_metal"], ["mod_bit", "insulation"]], flags: ["prevailing_wage", "bonding", "demolition", "taper", "drains"], areaPerDollar: 0.11 },
  { suffix: "Recreation Center", type: "municipal", work: ["new_construction", "reroof"], low: 400_000, high: 1_200_000, materials: [["standing_seam", "tpo", "sheet_metal"]], flags: ["prevailing_wage", "bonding", "crane"], areaPerDollar: 0.08 },
  { suffix: "Apartments — Phase 2", type: "multifamily", work: ["new_construction"], low: 350_000, high: 1_400_000, materials: [["shingles", "sheet_metal"], ["shingles", "tpo", "sheet_metal"]], flags: ["fall_protection", "winter"], areaPerDollar: 0.14 },
  { suffix: "Self Storage", type: "commercial", work: ["new_construction"], low: 180_000, high: 520_000, materials: [["standing_seam", "sheet_metal"]], flags: ["fall_protection"], areaPerDollar: 0.15 },
  { suffix: "Corporate Center", type: "commercial", work: ["reroof"], low: 450_000, high: 1_500_000, materials: [["tpo", "insulation", "sheet_metal"], ["pvc", "insulation", "coatings"]], flags: ["demolition", "phased", "taper", "crane"], areaPerDollar: 0.09 },
  { suffix: "Fire Station No. 4", type: "municipal", work: ["new_construction"], low: 160_000, high: 420_000, materials: [["tpo", "standing_seam", "sheet_metal"]], flags: ["prevailing_wage", "bonding"], areaPerDollar: 0.1 },
  { suffix: "Retail Center", type: "commercial", work: ["new_construction", "reroof"], low: 240_000, high: 880_000, materials: [["tpo", "insulation", "sheet_metal"]], flags: ["taper", "fall_protection"], areaPerDollar: 0.12 },
  { suffix: "Manufacturing Facility", type: "commercial", work: ["new_construction"], low: 600_000, high: 2_200_000, materials: [["tpo", "insulation", "sheet_metal"]], flags: ["crane", "taper", "bonding"], areaPerDollar: 0.13 },
  { suffix: "Senior Living Community", type: "multifamily", work: ["new_construction"], low: 420_000, high: 1_300_000, materials: [["shingles", "tpo", "sheet_metal"]], flags: ["fall_protection", "phased"], areaPerDollar: 0.11 },
  { suffix: "Student Housing", type: "multifamily", work: ["new_construction"], low: 500_000, high: 1_700_000, materials: [["tpo", "insulation", "pavers"]], flags: ["crane", "taper", "fall_protection"], areaPerDollar: 0.1 },
  { suffix: "Clinic Expansion", type: "institutional", work: ["new_construction", "reroof"], low: 150_000, high: 480_000, materials: [["tpo", "insulation"]], flags: ["phased", "fall_protection"], areaPerDollar: 0.1 },
  { suffix: "Public Library", type: "municipal", work: ["reroof"], low: 220_000, high: 700_000, materials: [["pvc", "insulation", "sheet_metal"]], flags: ["prevailing_wage", "bonding", "demolition"], areaPerDollar: 0.1 },
  { suffix: "Cold Storage Facility", type: "commercial", work: ["new_construction"], low: 800_000, high: 2_600_000, materials: [["tpo", "insulation"]], flags: ["crane", "taper"], areaPerDollar: 0.14 },
  { suffix: "Auto Dealership", type: "commercial", work: ["new_construction", "reroof"], low: 200_000, high: 640_000, materials: [["tpo", "standing_seam", "sheet_metal"]], flags: ["fall_protection"], areaPerDollar: 0.11 },
  { suffix: "Warehouse Annex", type: "commercial", work: ["reroof", "restoration"], low: 130_000, high: 560_000, materials: [["tpo", "ballast", "insulation"], ["coatings"]], flags: ["demolition", "phased"], areaPerDollar: 0.15 },
];

const ESTIMATORS = ["Taylor Moss", "Dana Whitaker", "Marcus Idle", "Priya Raman"];
const MANUFACTURERS = ["Carlisle", "Holcim / Firestone", "GAF", "Johns Manville", "Sika Sarnafil", "Versico"];
const COMPETITORS = [
  "Summit Roofing Systems", "Intermountain Roofing Co.", "Beehive Commercial Roofing",
  "Wasatch Roofing Partners", "Cornerstone Roofing", "Great Basin Roofing",
];
/**
 * Matches the categories the capture prompt offers, so the charts group — and
 * each carries the gap range that category implies, so the demo is internally
 * consistent rather than random.
 */
const LOSS_CATEGORIES: [string, [number, number], string[]][] = [
  ["Price — we were high", [0.09, 0.19], [
    "Their crew rate is lower and they carried no premium for the winter start.",
    "We held a full allowance for deck repair; they priced it as unit rates.",
    "Freight on the metal package put us over.",
  ]],
  ["Price — very close, under 5%", [0.008, 0.042], [
    "Second by a hair. Worth rebidding this client.",
    "Same scope, same warranty — they just sharpened their pencil.",
  ]],
  ["Incumbent roofer kept the work", [0.01, 0.07], [
    "They had already done the adjacent building and the owner did not want two roofers on site.",
    "Long-standing service agreement on the property.",
  ]],
  ["Schedule — could not commit to their dates", [0.005, 0.06], [
    "They wanted a mobilisation date inside our Silver Fork window.",
    "Owner needed dry-in three weeks earlier than we could staff.",
  ]],
  ["Scope or exclusions read as risk", [0.02, 0.09], [
    "Our exclusions on deck repair read as risk to the owner.",
    "We excluded the parapet flashing; the winner carried it.",
  ]],
  ["Relationship — GC went with someone they know better", [0.005, 0.05], [
    "First time bidding this GC. No history to lean on.",
    "Their PM has worked with the winner for years.",
  ]],
  ["Never got real feedback", [0.03, 0.12], [
    "Told only that they went another direction.",
  ]],
];
const WIN_REASONS = [
  "Repeat client. They do not re-bid our work.",
  "Only bidder able to self-perform both the low-slope and the sheet metal scope.",
  "Our phasing plan kept the building occupied through the work.",
  "Strongest warranty position of the three bidders.",
  "GC knows our crews finish inside the summer window.",
];

/** The full demo pipeline: the handcrafted stories plus a year of ordinary work. */
export function buildDemoSeed(now = new Date()): Database {
  const db = buildSeed(now);
  db.organizations.push(...structuredClone(EXTRA_ORGS));

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = (offset: number): string => {
    const x = new Date(base);
    x.setDate(x.getDate() + offset);
    return toISODate(x);
  };
  const stamp = (offset: number, hour = 10): string =>
    new Date(`${d(offset)}T${String(hour).padStart(2, "0")}:15:00`).toISOString();

  const gcIds = db.organizations.filter((o) => o.type === "gc").map((o) => o.id);
  const random = rng(20260902);
  const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)];
  const between = (low: number, high: number): number => low + random() * (high - low);
  // Round to something an estimator would actually write down.
  const money = (value: number): number => Math.round(value / 500) * 500;

  // How many of each stage the board should hold, on top of the handcrafted set.
  const PLAN: [StageId, number][] = [
    ["identified", 4], ["invited", 5], ["estimating", 6], ["submitted", 5],
    ["active_followup", 5], ["shortlisted", 4], ["apparent_low", 2],
    ["verbal_award", 2], ["contract_received", 1], ["contracted", 4],
    ["lost", 12], ["cancelled", 2], ["dormant", 3], ["no_bid", 2],
  ];

  let seq = 0;
  const usedNames = new Set(db.projects.map((p) => p.name));

  for (const [stage, count] of PLAN) {
    for (let i = 0; i < count; i += 1) {
      seq += 1;
      const kind = pick(KINDS);
      const [city, zip] = pick(PLACES);

      let name = `${pick(PREFIXES)} ${kind.suffix}`;
      let guard = 0;
      while (usedNames.has(name) && guard < 12) {
        name = `${pick(PREFIXES)} ${kind.suffix}`;
        guard += 1;
      }
      usedNames.add(name);

      const value = money(between(kind.low, kind.high));
      const margin = 0.17 + random() * 0.09;
      const workType = pick(kind.work);
      const def = STAGES.find((s) => s.id === stage)!;
      const closed = def.tab === "closed";
      const contracted = stage === "contracted";

      // Position the project in time according to how far along it is.
      const progress = STAGES.findIndex((s) => s.id === stage);
      const invitedOffset = -Math.round(between(10, 40) + progress * 9);
      const dueOffset = closed || progress >= 3
        ? invitedOffset + Math.round(between(12, 26))
        : Math.round(between(3, 30));
      const installStart = Math.round(between(35, 330));
      const installEnd = installStart + Math.round(between(25, 110));

      const project: Project = {
        id: `prj-demo-${seq}`,
        code: `ER-${base.getFullYear()}-${String(200 + seq)}`,
        name,
        description: `${workType === "reroof" ? "Tear-off and replacement" : workType === "restoration" ? "Coating restoration" : "New construction"} — ${kind.materials[0].includes("shingles") ? "steep-slope and low-slope scope" : "low-slope roofing"} with associated sheet metal.`,
        addressLine: `${Math.round(between(120, 9800))} ${pick(["North", "South", "East", "West"])} ${pick(["Main Street", "Center Street", "Commerce Way", "Industrial Drive", "Redwood Road", "Frontage Road", "State Street"])}`,
        city,
        state: "UT",
        zip,
        projectType: kind.type,
        workType,
        isPublic: kind.flags.includes("prevailing_wage"),
        owner: `${pick(PREFIXES)} ${pick(["Holdings", "Partners", "Development", "Properties", "Group"])}`,
        architect: pick(["Method Studio", "AJC Architects", "MHTN Architects", "VCBO Architecture", "CRSA", "Curtis Miner Architecture"]),
        source: pick(["BuildingConnected invitation", "Repeat client", "Referred by the architect", "Public bid advertisement", "Cold outreach"]),
        trelloUrl: `https://trello.com/c/eliteroof-${seq}`,
        stage,
        probabilityOverride: null,
        expectedValue: value,
        estimatedCost: money(value * (1 - margin)),
        retainagePct: 5,
        cashFlowRisk: value > 1_500_000 ? "high" : value > 700_000 ? "medium" : "low",
        materials: pick(kind.materials),
        manufacturer: pick(MANUFACTURERS),
        warranty: pick(["20-year NDL", "15-year NDL", "20-year system", "10-year system"]),
        roofAreaSqFt: Math.round((value * kind.areaPerDollar) / 100) * 100,
        buildings: random() > 0.75 ? Math.ceil(random() * 4) : 1,
        stories: Math.ceil(random() * 4),
        scopeFlags: kind.flags,
        invitationDate: d(invitedOffset),
        bidDueDate: `${d(dueOffset)}T${pick(["14:00", "15:00", "16:00", "17:00"])}`,
        bidSubmittedDate: progress >= 3 || closed ? d(dueOffset - 1) : null,
        anticipatedAwardDate: closed ? null : d(dueOffset + Math.round(between(20, 60))),
        installStart: d(installStart),
        installEnd: d(installEnd),
        dateConfidence: contracted ? "firm" : progress >= 6 ? "probable" : "rough",
        lastActivityDate: d(-Math.round(between(1, closed ? 60 : 16))),
        estimator: pick(ESTIMATORS),
        projectManager: random() > 0.5 ? pick(["Megan Alvarado", "Dallin Reeve", "Sasha Bergeron", "Kurt Halvorsen"]) : undefined,
        competition: pick(["low", "medium", "high", "unknown"]),
        competitors: random() > 0.5 ? [pick(COMPETITORS)] : [],
        pricingPosition: pick(["low", "competitive", "high", "unknown"]),
        relationship: pick(["new", "developing", "strong", "preferred"]),
        priority: pick(["must_win", "high", "normal", "normal", "low"]),
        fitScore: Math.round(between(3, 10)),
        scopeCompared: progress >= 5,
        bidLeveled: progress >= 5,
        pricingCurrent: progress >= 4,
        winReason: progress >= 5 ? pick(WIN_REASONS) : undefined,
        primaryRisk: progress >= 3 ? pick([
          "Material lead time is the schedule driver.",
          "Award date has slipped once already.",
          "Owner budget is tighter than the drawings imply.",
          "Winter start — dry-in date is the risk.",
          "Deck condition is unknown until tear-off.",
        ]) : undefined,
        createdAt: stamp(invitedOffset),
        updatedAt: stamp(-Math.round(between(1, 14))),
      };

      if (contracted) {
        const changeOrders = random() > 0.6 ? money(value * between(0.01, 0.06)) : 0;
        project.contract = {
          executedValue: value,
          changeOrders,
          revenueEarned: random() > 0.5 ? money(value * between(0.05, 0.4)) : 0,
          retainagePct: 5,
          contractDate: d(-Math.round(between(20, 120))),
          bondIncluded: kind.flags.includes("bonding"),
          bondCost: kind.flags.includes("bonding") ? money(value * 0.011) : null,
        };
      }

      if (stage === "lost") {
        const [category, [gapLow, gapHigh], details] = pick(LOSS_CATEGORIES);
        // The gap follows the reason: a job lost on relationship was priced
        // fine, a job lost on price was not.
        const gap = between(gapLow, gapHigh);
        // Not every loss comes with the winner's number — that is the point of
        // the coverage nudge in the loss analysis.
        const winning = random() > 0.28 ? money(value / (1 + gap)) : null;
        const awarded = pick(COMPETITORS);
        project.outcome = {
          result: "lost",
          date: d(-Math.round(between(10, 150))),
          awardedTo: awarded,
          winningAmount: winning,
          reason: `${category} · ${pick(details)}`,
          competitor: awarded,
          lessons: random() > 0.5 ? pick([
            "Get a second supplier quote before carrying premium freight.",
            "Ask for the bid tab every time — it is the only free market research we get.",
            "Our exclusions language is costing us on deck repair. Rewrite it.",
          ]) : undefined,
          eligibleForRebid: random() > 0.6,
        };
      } else if (stage === "cancelled" || stage === "dormant" || stage === "no_bid") {
        project.outcome = {
          result: stage === "no_bid" ? "no_bid" : stage === "cancelled" ? "cancelled" : "postponed",
          date: d(-Math.round(between(20, 140))),
          reason: stage === "no_bid"
            ? pick(["Declined — crews committed through the install window.", "Declined — margin does not justify the crew time.", "Declined — scope is outside what we self-perform."])
            : stage === "cancelled"
              ? pick(["Owner cancelled the project.", "Financing fell through.", "Bond referendum failed."])
              : pick(["Owner paused pending financing.", "Postponed to next budget year."]),
          eligibleForRebid: true,
        };
        project.installStart = null;
        project.installEnd = null;
      }

      db.projects.push(project);

      // One to three GCs, so the multi-recipient model shows up throughout.
      const recipientCount = random() > 0.72 ? (random() > 0.5 ? 3 : 2) : 1;
      const chosen = new Set<string>();
      for (let r = 0; r < recipientCount; r += 1) {
        let orgId = pick(gcIds);
        let attempts = 0;
        while (chosen.has(orgId) && attempts < 8) {
          orgId = pick(gcIds);
          attempts += 1;
        }
        chosen.add(orgId);
        const org = db.organizations.find((o) => o.id === orgId)!;
        const submitted = progress >= 3 || closed;

        const recipient: BidRecipient = {
          id: `rec-demo-${seq}-${r}`,
          projectId: project.id,
          organizationId: orgId,
          contactName: org.contacts[0]?.name,
          contactEmail: org.contacts[0]?.email,
          submittedAmount: submitted ? money(value * between(0.97, 1.03)) : null,
          submittedDate: submitted ? project.bidSubmittedDate : null,
          status: closed
            ? "Closed"
            : submitted
              ? pick(["Confirmed received", "Leveled — awaiting award", "No feedback since submission", "Pricing reconfirmed"])
              : "Estimating",
          lastContactDate: project.lastActivityDate,
          nextFollowUpDate: closed
            ? null
            : random() > 0.12
              ? d(Math.round(between(-4, 21)))
              : null,
          nextFollowUpType: pick(["confirm_receipt", "bid_leveling", "award_timing", "pricing_confirmation", "scope_clarification", "contract_status"]),
          signal: pick(["strong_positive", "positive", "neutral", "neutral", "negative"]),
          revisions: submitted
            ? [{ id: `rev-demo-${seq}-${r}`, revision: 0, amount: money(value * between(0.97, 1.03)), date: project.bidSubmittedDate! }]
            : [],
        };
        db.recipients.push(recipient);
      }

      // Enough activity that the timeline and the "won after N touches" metric
      // have something to report.
      const touches = 1 + Math.floor(random() * (progress >= 4 ? 4 : 2));
      for (let a = 0; a < touches; a += 1) {
        const org = db.organizations.find((o) => o.id === Array.from(chosen)[0])!;
        const activity: Activity = {
          id: `act-demo-${seq}-${a}`,
          projectId: project.id,
          at: stamp(-Math.round(between(2, 70)), 9 + Math.floor(random() * 8)),
          kind: "touch",
          method: pick(["call", "email", "email", "meeting", "text"]),
          contact: org.contacts[0]?.name ?? null,
          signal: pick(["positive", "neutral", "neutral", "strong_positive", "negative"]),
          note: pick([
            "Confirmed they have our number and the scope letter.",
            "Award is still with the owner. Checking back next week.",
            "Asked about tapered package responsibility — answered on the call.",
            "They want us to hold pricing through the GMP review.",
            "No decision yet. Budget review moved a week.",
            "Walked the roof with their PM. Deck is in better shape than expected.",
          ]),
          summary: `${pick(["Called", "Emailed", "Met with"])} ${org.contacts[0]?.name ?? org.name}`,
          author: project.estimator,
        };
        db.activities.push(activity);
      }
    }
  }

  db.updatedAt = new Date().toISOString();
  return db;
}
