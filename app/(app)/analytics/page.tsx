"use client";

import { useMemo } from "react";

import { HBar, Legend, MonthColumns, RateBar, StatTile } from "@/components/bcc/charts";
import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { PageBody, PageIntro } from "@/components/shell/PageBody";
import { IconDownload } from "@/components/ui/Icons";
import { Card, EmptyState, SectionHeader } from "@/components/ui/primitives";
import {
  estimatedMargin,
  isActive,
  isStale,
  pipelineByStage,
  weightedValue,
} from "@/lib/bcc/calc";
import { currency, currencyCompact, daysBetween, parseDate } from "@/lib/bcc/format";
import { STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import { PROJECT_TYPES, materialLabel } from "@/lib/bcc/taxonomy";
import type { Project } from "@/lib/bcc/types";

const SIZE_BANDS = [
  { label: "Under $250K", min: 0, max: 250_000 },
  { label: "$250K – $500K", min: 250_000, max: 500_000 },
  { label: "$500K – $1M", min: 500_000, max: 1_000_000 },
  { label: "$1M – $2M", min: 1_000_000, max: 2_000_000 },
  { label: "$2M+", min: 2_000_000, max: Infinity },
];

export default function AnalyticsPage() {
  const { db, today } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();

  const projects = useMemo(() => db?.projects ?? [], [db?.projects]);
  const won = useMemo(
    () => projects.filter((p) => p.stage === "contracted" || p.outcome?.result === "won"),
    [projects],
  );
  const lost = useMemo(() => projects.filter((p) => p.stage === "lost"), [projects]);
  const decided = useMemo(() => [...won, ...lost], [won, lost]);

  const stageRollups = useMemo(() => {
    const map = new Map(pipelineByStage(projects.filter(isActive)).map((r) => [r.stage, r]));
    return STAGES.filter((s) => s.tab === "bidding" || s.tab === "awarded").map((s) => ({
      stage: s,
      rollup: map.get(s.id) ?? { stage: s.id, count: 0, value: 0, weighted: 0 },
    }));
  }, [projects]);

  const cycleTimes = useMemo(() => {
    const toSubmission: number[] = [];
    const toAward: number[] = [];
    for (const p of projects) {
      const a = daysBetween(p.invitationDate ?? "", p.bidSubmittedDate ?? "");
      if (a != null && a >= 0) toSubmission.push(a);
      const decidedOn = p.outcome?.date ?? p.contract?.contractDate;
      const b = daysBetween(p.bidSubmittedDate ?? "", decidedOn ?? "");
      if (b != null && b >= 0) toAward.push(b);
    }
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    return { toSubmission: avg(toSubmission), toAward: avg(toAward) };
  }, [projects]);

  /** Proposals actually issued, by the month they went out. */
  const submissionMonths = useMemo(() => {
    const buckets = new Map<string, { count: number; value: number }>();
    for (const r of db?.recipients ?? []) {
      for (const rev of r.revisions) {
        if (rev.revision !== 0) continue;
        const d = parseDate(rev.date);
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const b = buckets.get(key) ?? { count: 0, value: 0 };
        b.count += 1;
        b.value += rev.amount;
        buckets.set(key, b);
      }
    }
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12);
  }, [db?.recipients]);

  const installMonths = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const p of projects) {
      if (!p.installStart || !isActive(p) && p.stage !== "contracted") continue;
      const d = parseDate(p.installStart);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + weightedValue(p));
    }
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(0, 14);
  }, [projects]);

  const byGc = useMemo(() => {
    const map = new Map<string, { won: number; total: number; wonValue: number; totalValue: number }>();
    for (const p of decided) {
      for (const r of recipients.get(p.id) ?? []) {
        const name = orgs.get(r.organizationId) ?? "Unknown";
        const entry = map.get(name) ?? { won: 0, total: 0, wonValue: 0, totalValue: 0 };
        entry.total += 1;
        entry.totalValue += p.expectedValue;
        if (won.includes(p)) {
          entry.won += 1;
          entry.wonValue += p.expectedValue;
        }
        map.set(name, entry);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [decided, won, recipients, orgs]);

  const bySystem = useMemo(() => {
    const map = new Map<string, { won: number; total: number }>();
    for (const p of decided) {
      for (const m of p.materials) {
        const entry = map.get(m) ?? { won: 0, total: 0 };
        entry.total += 1;
        if (won.includes(p)) entry.won += 1;
        map.set(m, entry);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [decided, won]);

  const lossReasons = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const p of projects) {
      if (!p.outcome || p.outcome.result === "won") continue;
      const key = p.outcome.result === "lost" ? "Lost to a competitor" : labelOutcome(p);
      const e = map.get(key) ?? { count: 0, value: 0 };
      e.count += 1;
      e.value += p.expectedValue;
      map.set(key, e);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [projects]);

  const persistence = useMemo(() => {
    const touchesFor = (p: Project) =>
      (db?.activities ?? []).filter((a) => a.projectId === p.id && a.kind === "touch").length;
    const wonWithMany = won.filter((p) => touchesFor(p) >= 2).length;
    return { wonWithMany, wonTotal: won.length };
  }, [won, db?.activities]);

  const stale = useMemo(
    () => projects.filter((p) => isStale(p, today)),
    [projects, today],
  );

  const estimatedVsAwarded = useMemo(
    () =>
      won
        .filter((p) => p.contract)
        .map((p) => ({
          project: p,
          estimated: p.expectedValue,
          awarded: p.contract!.executedValue + p.contract!.changeOrders,
        })),
    [won],
  );

  if (!db) return null;

  const maxStage = Math.max(1, ...stageRollups.map((r) => r.rollup.value));

  return (
    <PageBody>
      <PageIntro
        title="Analytics"
        subtitle="Proposal activity and unique-project opportunity are always kept apart — one measures the estimating desk, the other measures the business."
        action={
          <a
            href="/api/bcc/export?entity=activities"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-canvas"
          >
            <IconDownload size={13} />
            Export activity
          </a>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Invitation → submission"
          value={cycleTimes.toSubmission != null ? `${cycleTimes.toSubmission} days` : "—"}
          sub="Average turnaround"
        />
        <StatTile
          label="Submission → award"
          value={cycleTimes.toAward != null ? `${cycleTimes.toAward} days` : "—"}
          sub="Average decision time"
        />
        <StatTile
          label="Won after 2+ touches"
          value={`${persistence.wonWithMany}/${persistence.wonTotal}`}
          sub="Won with 2+ logged touches"
        />
        <StatTile
          label="Stale pipeline"
          value={currencyCompact(stale.reduce((s, p) => s + p.expectedValue, 0))}
          sub={`${stale.length} ${stale.length === 1 ? "project" : "projects"} going quiet`}
          tone={stale.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader
            title="Pipeline value by stage"
            hint="Unique project value, with the weighted figure inside it."
          />
          <div className="mt-3 space-y-0.5">
            {stageRollups.map(({ stage, rollup }) => (
              <HBar
                key={stage.id}
                label={stage.short}
                sublabel={`${Math.round(stage.defaultProbability * 100)}% default`}
                value={rollup.value}
                secondary={rollup.weighted}
                max={maxStage}
                count={rollup.count}
              />
            ))}
          </div>
          <div className="mt-3 border-t border-line pt-2.5">
            <Legend items={[{ label: "Unique value", tone: "line" }, { label: "Weighted", tone: "ink" }]} />
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Win rate"
            hint={`Across ${decided.length} decided projects — ${won.length} won, ${lost.length} lost.`}
          />
          <div className="mt-3 space-y-0.5">
            <RateBar
              label="By project count"
              won={won.length}
              total={decided.length}
              valueLabel={`${won.length}/${decided.length}`}
            />
            <RateBar
              label="By bid dollars"
              won={won.reduce((s, p) => s + p.expectedValue, 0)}
              total={decided.reduce((s, p) => s + p.expectedValue, 0)}
              valueLabel={currencyCompact(won.reduce((s, p) => s + p.expectedValue, 0))}
            />
          </div>

          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            By project type
          </h4>
          <div className="mt-1.5 space-y-0.5">
            {PROJECT_TYPES.map((t) => {
              const inType = decided.filter((p) => p.projectType === t.id);
              if (inType.length === 0) return null;
              return (
                <RateBar
                  key={t.id}
                  label={t.label}
                  won={inType.filter((p) => won.includes(p)).length}
                  total={inType.length}
                />
              );
            })}
          </div>

          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            By bid size
          </h4>
          <div className="mt-1.5 space-y-0.5">
            {SIZE_BANDS.map((band) => {
              const inBand = decided.filter(
                (p) => p.expectedValue >= band.min && p.expectedValue < band.max,
              );
              if (inBand.length === 0) return null;
              return (
                <RateBar
                  key={band.label}
                  label={band.label}
                  won={inBand.filter((p) => won.includes(p)).length}
                  total={inBand.length}
                />
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Proposals issued per month"
            hint="Estimating output — proposal activity, never forecast revenue."
          />
          {submissionMonths.length === 0 ? (
            <EmptyState title="No submissions recorded yet" />
          ) : (
            <div className="mt-4">
              <MonthColumns
                months={submissionMonths.map(([key]) => monthLabel(key))}
                series={[
                  {
                    key: "value",
                    label: "Raw proposal volume",
                    values: submissionMonths.map(([, v]) => v.value),
                    tone: "ink",
                  },
                ]}
              />
              <p className="mt-2 text-[11.5px] text-ink-muted">
                {submissionMonths.reduce((s, [, v]) => s + v.count, 0)} proposals ·{" "}
                {currencyCompact(submissionMonths.reduce((s, [, v]) => s + v.value, 0))} of
                proposal activity across this window.
              </p>
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Weighted pipeline by install month"
            hint="Where the probable work actually lands."
          />
          {installMonths.length === 0 ? (
            <EmptyState title="No install dates recorded yet" />
          ) : (
            <div className="mt-4">
              <MonthColumns
                months={installMonths.map(([key]) => monthLabel(key))}
                series={[
                  {
                    key: "weighted",
                    label: "Weighted pipeline",
                    values: installMonths.map(([, v]) => v),
                    tone: "volt",
                  },
                ]}
              />
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="Win rate by GC" hint="Which relationships repay estimating time." />
          <div className="mt-3 space-y-0.5">
            {byGc.length === 0 ? (
              <EmptyState title="Not enough decided work yet" />
            ) : (
              byGc.map(([name, s]) => (
                <RateBar
                  key={name}
                  label={name}
                  won={s.won}
                  total={s.total}
                  valueLabel={`${s.won}/${s.total}`}
                />
              ))
            )}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Win rate by roofing system" />
          <div className="mt-3 space-y-0.5">
            {bySystem.length === 0 ? (
              <EmptyState title="Not enough decided work yet" />
            ) : (
              bySystem.map(([id, s]) => (
                <RateBar key={id} label={materialLabel(id)} won={s.won} total={s.total} />
              ))
            )}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Why work did not close"
            hint="Losses, cancellations, postponements, and no-bids."
          />
          <div className="mt-3 space-y-0.5">
            {lossReasons.length === 0 ? (
              <EmptyState title="Nothing closed against us yet" />
            ) : (
              lossReasons.map(([reason, s]) => (
                <HBar
                  key={reason}
                  label={reason}
                  value={s.value}
                  max={Math.max(...lossReasons.map(([, x]) => x.value))}
                  count={s.count}
                />
              ))
            )}
          </div>
          {projects
            .filter((p) => p.outcome?.lessons)
            .slice(0, 2)
            .map((p) => (
              <div key={p.id} className="mt-3 rounded-lg border border-line bg-canvas p-3">
                <p className="text-[12px] font-medium text-ink">{p.name}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                  {p.outcome!.lessons}
                </p>
              </div>
            ))}
        </Card>

        <Card>
          <SectionHeader
            title="Estimated vs contracted"
            hint="How close the estimate landed to the executed number."
          />
          {estimatedVsAwarded.length === 0 ? (
            <EmptyState title="No executed contracts yet" />
          ) : (
            <table className="mt-3 w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.05em] text-ink-muted">
                  <th className="py-1.5 font-medium">Project</th>
                  <th className="py-1.5 text-right font-medium">Estimated</th>
                  <th className="py-1.5 text-right font-medium">Contracted</th>
                  <th className="py-1.5 text-right font-medium">Δ</th>
                  <th className="py-1.5 text-right font-medium">Est. GM</th>
                </tr>
              </thead>
              <tbody>
                {estimatedVsAwarded.map(({ project, estimated, awarded }) => (
                  <tr key={project.id} className="border-b border-line-faint last:border-0">
                    <td className="py-1.5 pr-2 text-ink">{project.name}</td>
                    <td className="tnum py-1.5 text-right text-ink-soft">
                      {currencyCompact(estimated)}
                    </td>
                    <td className="tnum py-1.5 text-right text-ink-soft">
                      {currencyCompact(awarded)}
                    </td>
                    <td
                      className={`tnum py-1.5 text-right ${awarded >= estimated ? "text-ok-ink" : "text-danger-ink"}`}
                    >
                      {awarded === estimated
                        ? "—"
                        : `${awarded > estimated ? "+" : ""}${currencyCompact(awarded - estimated)}`}
                    </td>
                    <td className="tnum py-1.5 text-right text-ink-soft">
                      {estimatedMargin(project) != null
                        ? `${Math.round(estimatedMargin(project)! * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            Final margin lands here once earned revenue and actual cost are tracked against the
            contract.
          </p>
        </Card>
      </div>
    </PageBody>
  );
}

function labelOutcome(p: Project): string {
  switch (p.outcome?.result) {
    case "cancelled":
      return "Project cancelled";
    case "postponed":
      return "Postponed";
    case "no_bid":
      return "Declined to bid";
    default:
      return STAGE_MAP[p.stage].label;
  }
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short" });
}
