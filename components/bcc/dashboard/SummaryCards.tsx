"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useData } from "@/components/providers/DataProvider";
import { IconArrowDown, IconArrowUp, IconClock } from "@/components/ui/Icons";
import { cx } from "@/components/ui/primitives";
import {
  isActive,
  probabilityOf,
  summarize,
  weightedGrossProfit,
} from "@/lib/bcc/calc";
import { currency, currencyCompact, daysBetween } from "@/lib/bcc/format";
import { APPARENT_AWARD_STAGES } from "@/lib/bcc/stages";

/**
 * The five money figures plus the two action counts. They are never added
 * together, and each says plainly what it is measuring.
 */
export function SummaryCards() {
  const { db, today } = useData();
  const router = useRouter();

  const stats = useMemo(() => (db ? summarize(db, today) : null), [db, today]);

  /** Value added to the pipeline in the last 30 days — an honest movement read. */
  const added = useMemo(() => {
    if (!db) return { unique: 0, weighted: 0 };
    const recent = db.projects.filter((p) => {
      if (!isActive(p)) return false;
      const age = daysBetween(today, p.createdAt.slice(0, 10));
      return age != null && -age <= 30;
    });
    return {
      unique: recent.reduce((s, p) => s + p.expectedValue, 0),
      weighted: recent.reduce((s, p) => s + p.expectedValue * probabilityOf(p), 0),
    };
  }, [db, today]);

  if (!stats || !db) return <SummarySkeleton />;

  const apparentCount = db.projects.filter((p) =>
    APPARENT_AWARD_STAGES.includes(p.stage),
  ).length;
  const contractedCount = db.projects.filter((p) => p.stage === "contracted").length;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard
          label="Active unique pipeline"
          value={stats.uniquePipeline}
          note={`${stats.activeCount} active projects · counted once each`}
          delta={added.unique}
          deltaNote="added in 30 days"
          onClick={() => router.push("/projects?tab=bidding")}
        />
        <MoneyCard
          label="Probability-weighted"
          value={stats.weightedPipeline}
          note={`${Math.round((stats.weightedPipeline / Math.max(1, stats.uniquePipeline)) * 100)}% of unique pipeline`}
          delta={added.weighted}
          deltaNote="added in 30 days"
          onClick={() => router.push("/analytics")}
        />
        <MoneyCard
          label="Apparent awards"
          value={stats.apparentAwards}
          note={`${apparentCount} selected, not yet contracted`}
          accent
          onClick={() => router.push("/projects?tab=awarded")}
        />
        <MoneyCard
          label="Contracted backlog"
          value={stats.contractedBacklog}
          note={`${contractedCount} signed · remaining to perform`}
          tone="ok"
          onClick={() => router.push("/projects?tab=contracted")}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SmallTile
          label="Expected gross profit"
          value={currencyCompact(stats.weightedGrossProfit)}
          note="Probability-weighted"
          onClick={() => router.push("/analytics")}
        />
        <SmallTile
          label="Contracted gross profit"
          value={currencyCompact(stats.contractedGrossProfit)}
          note="On signed work"
          onClick={() => router.push("/projects?tab=contracted")}
        />
        <SmallTile
          label="Follow-ups due"
          value={String(stats.followUpsDue + stats.followUpsOverdue)}
          note={
            stats.followUpsOverdue > 0
              ? `${stats.followUpsOverdue} overdue · ${stats.followUpsDue} today`
              : `${stats.followUpsDue} due today`
          }
          tone={stats.followUpsOverdue > 0 ? "danger" : "default"}
          onClick={() => router.push("/followups")}
        />
        <SmallTile
          label="Bids due in 7 days"
          value={String(stats.bidsDueSoon)}
          note={stats.unscheduled > 0 ? `${stats.unscheduled} unscheduled follow-ups` : "All follow-ups scheduled"}
          tone={stats.bidsDueSoon > 0 ? "warn" : "default"}
          onClick={() => router.push("/projects?sort=bidDueDate")}
        />
      </div>
    </>
  );
}

function MoneyCard({
  label,
  value,
  note,
  delta,
  deltaNote,
  tone = "default",
  accent,
  onClick,
}: {
  label: string;
  value: number;
  note: string;
  delta?: number;
  deltaNote?: string;
  tone?: "default" | "ok";
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group card relative overflow-hidden p-4 text-left transition-all duration-150",
        "hover:-translate-y-px hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
      )}
    >
      {accent ? (
        <span className="absolute inset-x-0 top-0 h-[3px] bg-volt" />
      ) : tone === "ok" ? (
        <span className="absolute inset-x-0 top-0 h-[3px] bg-ok" />
      ) : null}

      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </p>
      <p className="tnum mt-2 text-[27px] font-semibold leading-none tracking-[-0.03em] text-ink">
        {currencyCompact(value)}
      </p>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">{note}</p>

      {delta != null && delta > 0 ? (
        <p className="mt-2 flex items-center gap-1 text-[11.5px] font-medium text-ok-ink">
          <IconArrowUp size={11} />
          {currencyCompact(delta)}
          <span className="font-normal text-ink-faint">{deltaNote}</span>
        </p>
      ) : delta != null ? (
        <p className="mt-2 flex items-center gap-1 text-[11.5px] text-ink-faint">
          <IconClock size={11} />
          Nothing new {deltaNote?.replace("added ", "")}
        </p>
      ) : null}

      <span className="tnum absolute bottom-3 right-4 text-[11px] text-ink-faint opacity-0 transition group-hover:opacity-100">
        {currency(value)}
      </span>
    </button>
  );
}

function SmallTile({
  label,
  value,
  note,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warn" | "danger";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex items-center gap-3 p-3 text-left transition hover:-translate-y-px hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
    >
      <span
        className={cx(
          "tnum flex h-9 min-w-[36px] items-center justify-center rounded-lg px-2 text-[15px] font-semibold",
          tone === "danger"
            ? "bg-danger-tint text-danger-ink"
            : tone === "warn"
              ? "bg-warn-tint text-warn-ink"
              : "bg-sunken text-ink",
        )}
      >
        {value}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-ink-muted">{note}</span>
      </span>
    </button>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card h-[132px] animate-pulse bg-canvas" />
      ))}
    </div>
  );
}
