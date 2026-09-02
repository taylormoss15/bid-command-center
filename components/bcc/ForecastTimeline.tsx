"use client";

import { useMemo } from "react";

import { useData } from "@/components/providers/DataProvider";
import { cx } from "@/components/ui/primitives";
import {
  estimatedGrossProfit,
  probabilityOf,
  remainingBacklog,
  weightedValue,
} from "@/lib/bcc/calc";
import { currencyCompact, parseDate } from "@/lib/bcc/format";
import { APPARENT_AWARD_STAGES } from "@/lib/bcc/stages";
import type { Project } from "@/lib/bcc/types";

export type Certainty = "contracted" | "awarded" | "pipeline";

export function certaintyOf(project: Project): Certainty {
  if (project.stage === "contracted") return "contracted";
  if (APPARENT_AWARD_STAGES.includes(project.stage)) return "awarded";
  return "pipeline";
}

export interface MonthBucket {
  key: string;
  label: string;
  year: number;
  start: Date;
  end: Date;
}

export function buildMonths(from: string, count: number): MonthBucket[] {
  const base = parseDate(from) ?? new Date();
  const months: MonthBucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const end = new Date(base.getFullYear(), base.getMonth() + i + 1, 0);
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-US", { month: "short" }),
      year: start.getFullYear(),
      start,
      end,
    });
  }
  return months;
}

/** Days of a project's install window that land inside a given month. */
export function overlapDays(project: Project, month: MonthBucket): number {
  const start = parseDate(project.installStart);
  const end = parseDate(project.installEnd);
  if (!start || !end) return 0;
  const from = Math.max(start.getTime(), month.start.getTime());
  const to = Math.min(end.getTime(), month.end.getTime());
  if (to < from) return 0;
  return (to - from) / 86_400_000 + 1;
}

/** A project's value apportioned across the months it is actually being built. */
export function monthlyShare(project: Project, month: MonthBucket, value: number): number {
  const start = parseDate(project.installStart);
  const end = parseDate(project.installEnd);
  if (!start || !end) return 0;
  const total = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (total <= 0) return 0;
  return (overlapDays(project, month) / total) * value;
}

const BAR_STYLE: Record<Certainty, string> = {
  contracted: "bg-ink text-white",
  awarded: "bg-volt text-ink",
  pipeline: "bg-sunken text-ink-soft ring-1 ring-inset ring-line-strong",
};

export function ForecastTimeline({
  projects,
  months,
  onSelect,
  showLabels = true,
  rowHeight = 26,
}: {
  projects: Project[];
  months: MonthBucket[];
  onSelect?: (id: string) => void;
  showLabels?: boolean;
  rowHeight?: number;
}) {
  const spanStart = months[0].start.getTime();
  const spanEnd = months[months.length - 1].end.getTime();
  const spanDays = (spanEnd - spanStart) / 86_400_000 + 1;

  const rows = useMemo(
    () =>
      projects
        .filter((p) => p.installStart && p.installEnd)
        .map((p) => {
          const start = parseDate(p.installStart)!;
          const end = parseDate(p.installEnd)!;
          const from = Math.max(start.getTime(), spanStart);
          const to = Math.min(end.getTime(), spanEnd);
          if (to < from) return null;
          const left = ((from - spanStart) / 86_400_000 / spanDays) * 100;
          const width = (((to - from) / 86_400_000 + 1) / spanDays) * 100;
          return {
            project: p,
            left,
            width,
            uncertain: p.dateConfidence === "rough" || p.dateConfidence === "unknown",
            clippedStart: start.getTime() < spanStart,
            clippedEnd: end.getTime() > spanEnd,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => (a.project.installStart! < b.project.installStart! ? -1 : 1)),
    [projects, spanStart, spanEnd, spanDays],
  );

  const todayLeft = useMemo(() => {
    const now = Date.now();
    if (now < spanStart || now > spanEnd) return null;
    return ((now - spanStart) / 86_400_000 / spanDays) * 100;
  }, [spanStart, spanEnd, spanDays]);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[12.5px] text-ink-muted">
        No install windows fall inside this range.
      </p>
    );
  }

  return (
    <div className="min-w-[640px]">
      {/* Month scale */}
      <div className="relative flex border-b border-line pb-1.5">
        {showLabels ? <div className="w-[210px] shrink-0" /> : null}
        <div className="relative flex min-w-0 flex-1">
          {months.map((m, i) => (
            <div
              key={m.key}
              className={cx(
                "min-w-0 flex-1 border-l border-line-faint pl-1.5 text-[10.5px]",
                i === 0 && "border-l-0 pl-0",
              )}
            >
              <span className="font-medium text-ink-soft">{m.label}</span>
              {(i === 0 || m.start.getMonth() === 0) && (
                <span className="ml-1 text-ink-faint">’{String(m.year).slice(2)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bars */}
      <div className="relative">
        {todayLeft != null ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10"
            style={{ left: showLabels ? 210 : 0 }}
          >
            <span
              className="absolute inset-y-0 w-px bg-danger/45"
              style={{ left: `${todayLeft}%` }}
              title="Today"
            />
          </div>
        ) : null}

        {rows.map(({ project, left, width, uncertain, clippedStart, clippedEnd }) => {
          const certainty = certaintyOf(project);
          return (
            <div
              key={project.id}
              className="group flex items-center py-[3px]"
              style={{ minHeight: rowHeight }}
            >
              {showLabels ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(project.id)}
                  className="w-[210px] shrink-0 truncate pr-3 text-left text-[12px] text-ink transition hover:text-ink-soft"
                  title={project.name}
                >
                  {project.name}
                </button>
              ) : null}

              <div className="relative min-w-0 flex-1">
                {/* Month gridlines */}
                <div className="pointer-events-none absolute inset-0 flex">
                  {months.map((m, i) => (
                    <div
                      key={m.key}
                      className={cx("min-w-0 flex-1 border-l border-line-faint", i === 0 && "border-l-0")}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onSelect?.(project.id)}
                  title={`${project.name} · ${currencyCompact(project.expectedValue)} · ${project.dateConfidence} dates`}
                  className={cx(
                    "relative flex h-[18px] items-center overflow-hidden rounded-[4px] px-1.5 text-[10.5px] font-medium transition hover:brightness-95",
                    BAR_STYLE[certainty],
                    uncertain && "border border-dashed border-current",
                    clippedStart && "rounded-l-none",
                    clippedEnd && "rounded-r-none",
                  )}
                  style={{ marginLeft: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                >
                  <span className="truncate">{currencyCompact(project.expectedValue)}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Monthly roll-ups printed beneath the bars. */
export function ForecastTotals({
  projects,
  months,
  showLabels = true,
}: {
  projects: Project[];
  months: MonthBucket[];
  showLabels?: boolean;
}) {
  const rows = useMemo(() => {
    const contracted: number[] = [];
    const awarded: number[] = [];
    const weighted: number[] = [];
    const profit: number[] = [];
    const squares: number[] = [];
    const concurrent: number[] = [];

    for (const m of months) {
      let c = 0, a = 0, w = 0, gp = 0, sq = 0, n = 0;
      for (const p of projects) {
        const days = overlapDays(p, m);
        if (days <= 0) continue;
        n += 1;
        const certainty = certaintyOf(p);
        if (certainty === "contracted") {
          c += monthlyShare(p, m, remainingBacklog(p) ?? p.expectedValue);
        } else if (certainty === "awarded") {
          a += monthlyShare(p, m, p.expectedValue);
        }
        w += monthlyShare(p, m, weightedValue(p));
        gp += monthlyShare(p, m, (estimatedGrossProfit(p) ?? 0) * probabilityOf(p));
        sq += monthlyShare(p, m, (p.roofAreaSqFt ?? 0) / 100);
      }
      contracted.push(c);
      awarded.push(a);
      weighted.push(w);
      profit.push(gp);
      squares.push(sq);
      concurrent.push(n);
    }
    return { contracted, awarded, weighted, profit, squares, concurrent };
  }, [projects, months]);

  const maxConcurrent = Math.max(...rows.concurrent, 0);

  const line = (
    label: string,
    values: number[],
    format: (v: number) => string,
    emphasis?: boolean,
  ) => (
    <div className="flex items-center border-t border-line-faint py-1.5">
      {showLabels ? (
        <span className="w-[210px] shrink-0 pr-3 text-[11.5px] text-ink-muted">{label}</span>
      ) : null}
      <div className="flex min-w-0 flex-1">
        {values.map((v, i) => (
          <div
            key={`${label}-${i}`}
            className={cx(
              "tnum min-w-0 flex-1 truncate border-l border-line-faint pl-1.5 text-[11px]",
              i === 0 && "border-l-0 pl-0",
              emphasis ? "font-medium text-ink" : "text-ink-soft",
              v === 0 && "text-ink-faint",
            )}
          >
            {v === 0 ? "—" : format(v)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-3 min-w-[640px]">
      {line("Contracted revenue", rows.contracted, currencyCompact, true)}
      {line("Apparent awards", rows.awarded, currencyCompact)}
      {line("Weighted pipeline", rows.weighted, currencyCompact)}
      {line("Expected gross profit", rows.profit, currencyCompact)}
      {line("Roofing squares", rows.squares, (v) => Math.round(v).toLocaleString())}
      <div className="flex items-center border-t border-line py-1.5">
        {showLabels ? (
          <span className="w-[210px] shrink-0 pr-3 text-[11.5px] text-ink-muted">
            Concurrent projects
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1">
          {rows.concurrent.map((v, i) => (
            <div
              key={`conc-${i}`}
              className={cx(
                "min-w-0 flex-1 border-l border-line-faint pl-1.5",
                i === 0 && "border-l-0 pl-0",
              )}
            >
              <span
                className={cx(
                  "tnum inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-[11px] font-medium",
                  v === 0
                    ? "text-ink-faint"
                    : v >= Math.max(3, maxConcurrent)
                      ? "bg-warn-tint text-warn-ink"
                      : "bg-sunken text-ink",
                )}
                title={v >= Math.max(3, maxConcurrent) && v > 0 ? "Heaviest month in this range" : undefined}
              >
                {v === 0 ? "—" : v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CertaintyLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="h-2.5 w-5 rounded-[3px] bg-ink" />
        Contracted
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="h-2.5 w-5 rounded-[3px] bg-volt" />
        Awarded, pending contract
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="h-2.5 w-5 rounded-[3px] bg-sunken ring-1 ring-inset ring-line-strong" />
        Active pipeline
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="h-2.5 w-5 rounded-[3px] border border-dashed border-ink-faint" />
        Install dates uncertain
      </span>
    </div>
  );
}
