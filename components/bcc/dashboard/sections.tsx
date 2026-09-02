"use client";

import Link from "next/link";
import { useMemo } from "react";

import { FollowUpRow } from "@/components/bcc/FollowUpRow";
import {
  CertaintyLegend,
  ForecastTimeline,
  buildMonths,
} from "@/components/bcc/ForecastTimeline";
import { HBar } from "@/components/bcc/charts";
import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { IconArrowRight, IconCheck, IconClock } from "@/components/ui/Icons";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SectionHeader,
  StageChip,
  cx,
} from "@/components/ui/primitives";
import {
  HEALTH_RANK,
  followUpHealth,
  isActive,
  isStale,
  nextFollowUp,
  pipelineByStage,
  probabilityOf,
  weightedValue,
} from "@/lib/bcc/calc";
import { currency, currencyCompact, formatRange, relativeDays } from "@/lib/bcc/format";
import { STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import { staleReason } from "@/lib/bcc/suggest";

/** Everything that needs a call today, ordered by how late it already is. */
export function FollowUpToday() {
  const { db, today } = useData();
  const recipients = useRecipientIndex();

  const rows = useMemo(() => {
    if (!db) return [];
    return db.projects
      .filter(isActive)
      .map((p) => ({
        project: p,
        recs: recipients.get(p.id) ?? [],
        health: followUpHealth(p, recipients.get(p.id) ?? [], today),
      }))
      .filter((r) => ["overdue", "due_today", "unscheduled"].includes(r.health))
      .sort((a, b) => {
        const rank = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
        if (rank !== 0) return rank;
        return b.project.expectedValue - a.project.expectedValue;
      });
  }, [db, recipients, today]);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <SectionHeader
          title="Follow up today"
          hint={
            rows.length === 0
              ? "Nothing overdue and nothing unscheduled."
              : `${rows.length} ${rows.length === 1 ? "project needs" : "projects need"} a call or an owner`
          }
          action={
            <Link
              href="/followups"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-muted transition hover:text-ink"
            >
              Full queue
              <IconArrowRight size={12} />
            </Link>
          }
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="The queue is clear"
          body="Every active opportunity has a next action booked for a future date."
          icon={<IconCheck size={22} />}
        />
      ) : (
        <div className="border-t border-line">
          {rows.slice(0, 7).map(({ project, recs }) => (
            <FollowUpRow key={project.id} project={project} recipients={recs} />
          ))}
          {rows.length > 7 ? (
            <Link
              href="/followups"
              className="block border-t border-line px-3 py-2.5 text-center text-[12.5px] text-ink-muted transition hover:bg-canvas hover:text-ink"
            >
              {rows.length - 7} more in the queue
            </Link>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** Unique project value by stage — never the sum of proposals. */
export function PipelineByStage() {
  const { db } = useData();

  const rollups = useMemo(() => {
    if (!db) return [];
    const active = db.projects.filter(isActive);
    const map = new Map(pipelineByStage(active).map((r) => [r.stage, r]));
    return STAGES.filter((s) => s.tab === "bidding" || s.tab === "awarded").map((s) => ({
      stage: s,
      rollup: map.get(s.id) ?? { stage: s.id, count: 0, value: 0, weighted: 0 },
    }));
  }, [db]);

  const max = Math.max(1, ...rollups.map((r) => r.rollup.value));
  const total = rollups.reduce((sum, r) => sum + r.rollup.value, 0);
  const weighted = rollups.reduce((sum, r) => sum + r.rollup.weighted, 0);

  return (
    <Card>
      <SectionHeader
        title="Pipeline by stage"
        hint="Unique project value — the same roof is never counted twice."
      />
      <div className="mt-3 space-y-0.5">
        {rollups.map(({ stage, rollup }) => (
          <HBar
            key={stage.id}
            label={stage.short}
            sublabel={`${Math.round(stage.defaultProbability * 100)}% default`}
            value={rollup.value}
            secondary={rollup.weighted}
            max={max}
            count={rollup.count}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-ink/20" />
            Unique value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-ink" />
            Weighted
          </span>
        </div>
        <p className="tnum text-[12px] text-ink-soft">
          <span className="font-medium text-ink">{currencyCompact(total)}</span>
          <span className="text-ink-faint"> → </span>
          <span className="font-medium text-ink">{currencyCompact(weighted)}</span>
        </p>
      </div>
    </Card>
  );
}

export function ForecastStrip() {
  const { db, today, openProject } = useData();
  const months = useMemo(() => buildMonths(today, 9), [today]);
  const projects = useMemo(
    () =>
      (db?.projects ?? []).filter(
        (p) => (isActive(p) || p.stage === "contracted") && p.installStart && p.installEnd,
      ),
    [db?.projects],
  );

  return (
    <Card>
      <SectionHeader
        title="Install forecast"
        hint="Probable and contracted work across the next nine months."
        action={
          <Link
            href="/forecast"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-muted transition hover:text-ink"
          >
            Full forecast
            <IconArrowRight size={12} />
          </Link>
        }
      />
      <div className="mt-3 overflow-x-auto">
        <ForecastTimeline
          projects={projects.slice(0, 9)}
          months={months}
          onSelect={openProject}
        />
      </div>
      <div className="mt-3 border-t border-line pt-2.5">
        <CertaintyLegend />
      </div>
    </Card>
  );
}

export function BiggestOpportunities() {
  const { db, openProject } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();

  const rows = useMemo(() => {
    if (!db) return [];
    return db.projects
      .filter(isActive)
      .sort((a, b) => b.expectedValue - a.expectedValue)
      .slice(0, 7);
  }, [db]);

  return (
    <Card padded={false}>
      <div className="px-4 pb-2 pt-4">
        <SectionHeader
          title="Biggest opportunities"
          hint="Active work ranked by expected project value."
        />
      </div>
      <div className="border-t border-line">
        {rows.map((p) => {
          const recs = recipients.get(p.id) ?? [];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => openProject(p.id)}
              className="flex w-full items-center gap-3 border-b border-line-faint px-4 py-2.5 text-left transition last:border-0 hover:bg-canvas"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                <span className="block truncate text-[11.5px] text-ink-muted">
                  {recs.length === 1
                    ? orgs.get(recs[0].organizationId) ?? "—"
                    : `${recs.length} GCs`}
                  {" · "}
                  {formatRange(p.installStart, p.installEnd)}
                </span>
              </span>
              <StageChip stage={p.stage} short className="hidden sm:inline-flex" />
              <span className="tnum w-[62px] shrink-0 text-right text-[12px] text-ink-muted">
                {Math.round(probabilityOf(p) * 100)}%
              </span>
              <span className="w-[86px] shrink-0 text-right">
                <span className="tnum block text-[13px] font-medium text-ink">
                  {currencyCompact(p.expectedValue)}
                </span>
                <span className="tnum block text-[11px] text-ink-faint">
                  {currencyCompact(weightedValue(p))} wtd
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function StaleOpportunities() {
  const { db, today, openProject, openLog } = useData();
  const recipients = useRecipientIndex();

  const rows = useMemo(() => {
    if (!db) return [];
    return db.projects
      .filter((p) => isStale(p, today))
      .sort((a, b) => b.expectedValue - a.expectedValue);
  }, [db, today]);

  const value = rows.reduce((s, p) => s + p.expectedValue, 0);

  return (
    <Card padded={false}>
      <div className="px-4 pb-2 pt-4">
        <SectionHeader
          title="Going quiet"
          hint={
            rows.length === 0
              ? "Everything active has been touched in the last two weeks."
              : `${currencyCompact(value)} across ${rows.length} ${rows.length === 1 ? "project" : "projects"} with no recent activity.`
          }
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing has gone cold" icon={<IconCheck size={22} />} />
      ) : (
        <div className="border-t border-line">
          {rows.slice(0, 6).map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 border-b border-line-faint px-4 py-2.5 last:border-0"
            >
              <button
                type="button"
                onClick={() => openProject(p.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                  <IconClock size={11} className="shrink-0" />
                  {staleReason(p, today)}
                </span>
              </button>
              <span className="tnum hidden shrink-0 text-[12.5px] text-ink-soft sm:block">
                {currencyCompact(p.expectedValue)}
              </span>
              <Button
                size="xs"
                onClick={() =>
                  openLog({
                    projectId: p.id,
                    recipientId: (recipients.get(p.id) ?? [])[0]?.id,
                  })
                }
              >
                Log
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
