import type { Project, ProjectType } from "./types";

// ---------------------------------------------------------------------------
// Loss analysis.
//
// The useful question is not "how many did we lose" but "by how much, and on
// what kind of work". A roofer who is consistently 9% above the winner on
// municipal jobs and 1% on private reroofs has two different problems, and
// only one of them is a pricing problem.
//
// Every figure here is computed against the winner's number, so a gap reads
// as "we were X% above the number that won".
// ---------------------------------------------------------------------------

export interface Loss {
  project: Project;
  reason: string;
  /** Positive: we were above the winner. Null when their number is unknown. */
  gapDollars: number | null;
  gapPct: number | null;
}

export interface GapGroup {
  key: string;
  losses: number;
  /** How many of those losses have the winner's number recorded. */
  measured: number;
  avgGapPct: number | null;
  medianGapPct: number | null;
  totalValue: number;
}

/** The category the capture prompt recorded, before any free-text detail. */
export function lossCategory(project: Project): string {
  const recorded = project.outcome?.reason?.split(" · ")[0]?.trim();
  return recorded && recorded.length > 0 ? recorded : "Reason not recorded";
}

export function collectLosses(projects: Project[]): Loss[] {
  return projects
    .filter((p) => p.outcome?.result === "lost")
    .map((project) => {
      const winning = project.outcome?.winningAmount ?? null;
      const gapDollars = winning != null ? project.expectedValue - winning : null;
      return {
        project,
        reason: lossCategory(project),
        gapDollars,
        gapPct: winning != null && winning > 0 ? (project.expectedValue - winning) / winning : null,
      };
    });
}

function summarize(key: string, losses: Loss[]): GapGroup {
  const measured = losses.filter((l) => l.gapPct != null).map((l) => l.gapPct!);
  const sorted = [...measured].sort((a, b) => a - b);
  return {
    key,
    losses: losses.length,
    measured: measured.length,
    avgGapPct: measured.length
      ? measured.reduce((a, b) => a + b, 0) / measured.length
      : null,
    medianGapPct: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    totalValue: losses.reduce((sum, l) => sum + l.project.expectedValue, 0),
  };
}

function group(losses: Loss[], keyOf: (loss: Loss) => string): GapGroup[] {
  const map = new Map<string, Loss[]>();
  for (const loss of losses) {
    const key = keyOf(loss);
    const list = map.get(key);
    if (list) list.push(loss);
    else map.set(key, [loss]);
  }
  return Array.from(map.entries())
    .map(([key, list]) => summarize(key, list))
    // Biggest average gap first — that is where the money is going.
    .sort((a, b) => (b.avgGapPct ?? -1) - (a.avgGapPct ?? -1));
}

const TYPE_LABEL: Record<ProjectType, string> = {
  commercial: "Commercial",
  multifamily: "Multifamily",
  municipal: "Municipal",
  institutional: "Institutional",
  residential: "Residential",
  service: "Service",
};

export function gapByProjectType(losses: Loss[]): GapGroup[] {
  return group(losses, (l) => TYPE_LABEL[l.project.projectType] ?? l.project.projectType);
}

export function gapByReason(losses: Loss[]): GapGroup[] {
  return group(losses, (l) => l.reason);
}

export function gapBySystem(losses: Loss[]): GapGroup[] {
  // A project carries several systems; attribute the loss to its primary one.
  return group(losses, (l) => l.project.materials[0] ?? "Unspecified");
}

/** Losses we came within `threshold` of winning — the ones worth re-reading. */
export function nearMisses(losses: Loss[], threshold = 0.05): Loss[] {
  return losses
    .filter((l) => l.gapPct != null && l.gapPct > 0 && l.gapPct <= threshold)
    .sort((a, b) => (a.gapPct ?? 1) - (b.gapPct ?? 1));
}

export interface LossOverview {
  total: number;
  measured: number;
  avgGapPct: number | null;
  totalLostValue: number;
  recoverableValue: number;
}

export function overview(losses: Loss[], threshold = 0.05): LossOverview {
  const measured = losses.filter((l) => l.gapPct != null);
  return {
    total: losses.length,
    measured: measured.length,
    avgGapPct: measured.length
      ? measured.reduce((sum, l) => sum + (l.gapPct ?? 0), 0) / measured.length
      : null,
    totalLostValue: losses.reduce((sum, l) => sum + l.project.expectedValue, 0),
    recoverableValue: nearMisses(losses, threshold).reduce(
      (sum, l) => sum + l.project.expectedValue,
      0,
    ),
  };
}
