"use client";

import { useMemo } from "react";

import { StatTile } from "@/components/bcc/charts";
import { useData } from "@/components/providers/DataProvider";
import { IconAlert, IconTarget } from "@/components/ui/Icons";
import { Card, EmptyState, SectionHeader, cx } from "@/components/ui/primitives";
import { currency, currencyCompact, formatDate, percent } from "@/lib/bcc/format";
import {
  collectLosses,
  gapByProjectType,
  gapByReason,
  gapBySystem,
  nearMisses,
  overview,
  type GapGroup,
} from "@/lib/bcc/losses";
import { materialLabel } from "@/lib/bcc/taxonomy";

/**
 * How far off we were, and on what. Every bar is measured against the number
 * that won, so it reads as "we were X% above the winner".
 */
export function LossAnalysis() {
  const { db, openProject } = useData();

  const losses = useMemo(() => collectLosses(db?.projects ?? []), [db?.projects]);
  const stats = useMemo(() => overview(losses), [losses]);
  const byType = useMemo(() => gapByProjectType(losses), [losses]);
  const byReason = useMemo(() => gapByReason(losses), [losses]);
  const bySystem = useMemo(() => gapBySystem(losses), [losses]);
  const close = useMemo(() => nearMisses(losses), [losses]);

  if (losses.length === 0) {
    return (
      <Card>
        <SectionHeader title="How far off we were" />
        <EmptyState
          title="No losses recorded yet"
          body="When a bid goes elsewhere, the prompt asks who won and for how much. That is what fills this in."
          icon={<IconTarget size={22} />}
        />
      </Card>
    );
  }

  const coverage = stats.measured / stats.total;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <SectionHeader
          title="How far off we were"
          hint="Measured against the number that won. Positive means we were above it."
        />

        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile
            label="Average gap"
            value={stats.avgGapPct == null ? "—" : percent(stats.avgGapPct, 1)}
            sub={`Across ${stats.measured} losses with a known number`}
            tone={stats.avgGapPct != null && stats.avgGapPct > 0.06 ? "warn" : "default"}
          />
          <StatTile
            label="Losses recorded"
            value={String(stats.total)}
            sub={currencyCompact(stats.totalLostValue) + " of work"}
          />
          <StatTile
            label="Within 5%"
            value={String(close.length)}
            sub={`${currencyCompact(stats.recoverableValue)} lost by a hair`}
            tone={close.length > 0 ? "warn" : "default"}
          />
          <StatTile
            label="Winner's number known"
            value={`${stats.measured}/${stats.total}`}
            sub={coverage < 0.6 ? "Ask for the bid tab more often" : "Good coverage"}
            tone={coverage < 0.6 ? "danger" : "ok"}
          />
        </div>

        {coverage < 1 ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warn/20 bg-warn-tint px-3 py-2 text-[12px] leading-relaxed text-warn-ink">
            <IconAlert size={12} className="mt-0.5 shrink-0" />
            {stats.total - stats.measured} of {stats.total} losses have no winning number
            recorded, so they are counted but not measured. On public work the bid tab is
            published; on private work the GC will usually tell you if you ask in the same
            call you thank them in.
          </p>
        ) : null}
      </Card>

      <GapCard
        title="By project type"
        hint="Where the pricing is consistently off, rather than occasionally unlucky."
        groups={byType}
      />
      <GapCard
        title="By reason"
        hint="A price gap on a job lost to scope means the price was never the problem."
        groups={byReason}
      />
      <GapCard
        title="By roofing system"
        hint="Attributed to each project's primary system."
        groups={bySystem}
        label={(key) => (key === "Unspecified" ? key : materialLabel(key))}
      />

      <Card padded={false}>
        <div className="px-4 pb-2 pt-4">
          <SectionHeader
            title="Near misses"
            hint={
              close.length === 0
                ? "Nothing lost by under 5%."
                : `${close.length} lost by under 5% — ${currencyCompact(stats.recoverableValue)} of work that was almost yours.`
            }
          />
        </div>
        {close.length === 0 ? (
          <EmptyState title="No near misses recorded" />
        ) : (
          <div className="border-t border-line">
            {close.map(({ project, gapPct, gapDollars }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openProject(project.id)}
                className="flex w-full items-center gap-3 border-b border-line-faint px-4 py-2.5 text-left transition last:border-0 hover:bg-canvas"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {project.name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-muted">
                    {project.outcome?.awardedTo ?? "Unknown winner"}
                    {project.outcome?.date ? ` · ${formatDate(project.outcome.date)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[13px] font-semibold text-warn-ink">
                    {percent(gapPct, 1)}
                  </span>
                  <span className="tnum block text-[11px] text-ink-faint">
                    {currency(gapDollars)} apart
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function GapCard({
  title,
  hint,
  groups,
  label = (key: string) => key,
}: {
  title: string;
  hint: string;
  groups: GapGroup[];
  label?: (key: string) => string;
}) {
  const max = Math.max(0.01, ...groups.map((g) => g.avgGapPct ?? 0));

  return (
    <Card>
      <SectionHeader title={title} hint={hint} />
      <div className="mt-3 space-y-0.5">
        {groups.length === 0 ? (
          <EmptyState title="Nothing recorded yet" />
        ) : (
          groups.map((g) => {
            const pct = g.avgGapPct;
            const width = pct == null ? 0 : Math.max(2, (pct / max) * 100);
            return (
              <div key={g.key} className="flex items-center gap-3 py-1">
                <span className="w-[172px] shrink-0 text-[12.5px] leading-tight text-ink">
                  {label(g.key)}
                </span>
                <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-sunken">
                  {pct != null ? (
                    <span
                      className={cx(
                        "absolute inset-y-0 left-0 origin-left rounded-[5px] animate-bar-grow",
                        pct > 0.08 ? "bg-danger" : pct > 0.04 ? "bg-warn" : "bg-ink",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  ) : null}
                </span>
                <span className="w-[104px] shrink-0 text-right">
                  <span className="tnum block text-[12.5px] font-medium text-ink">
                    {pct == null ? "not measured" : percent(pct, 1)}
                  </span>
                  <span className="tnum block text-[10.5px] text-ink-faint">
                    {g.measured}/{g.losses} · {currencyCompact(g.totalValue)}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
