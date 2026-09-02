"use client";

import {
  BiggestOpportunities,
  FollowUpToday,
  ForecastStrip,
  PipelineByStage,
  StaleOpportunities,
} from "@/components/bcc/dashboard/sections";
import { InboxReview } from "@/components/bcc/InboxReview";
import { SummaryCards } from "@/components/bcc/dashboard/SummaryCards";
import { useData } from "@/components/providers/DataProvider";
import { IconArrowRight, IconPlus } from "@/components/ui/Icons";
import { Card } from "@/components/ui/primitives";
import { PageBody, PageIntro } from "@/components/shell/PageBody";

export default function CommandCenterPage() {
  const { db, loading, error, today } = useData();

  if (loading) return <PageBody><LoadingGrid /></PageBody>;
  if (error) {
    return (
      <PageBody>
        <p className="rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-[13px] text-danger-ink">
          {error}
        </p>
      </PageBody>
    );
  }
  if (!db) return null;

  // A brand-new live board should say what to do, not show a wall of zeroes.
  if (db.projects.length === 0) return <FirstRun />;

  return (
    <PageBody>
      <PageIntro
        title={greeting(today)}
        subtitle="Everything Elite can win, what deserves a call today, and what work is actually coming."
      />

      <InboxReview />

      <SummaryCards />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <FollowUpToday />
        <PipelineByStage />
      </div>

      <div className="mt-4">
        <ForecastStrip />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BiggestOpportunities />
        <StaleOpportunities />
      </div>
    </PageBody>
  );
}

function FirstRun() {
  const { setQuickAddOpen, setDataSettingsOpen, workspace } = useData();
  return (
    <PageBody>
      <div className="mx-auto max-w-xl pt-10 sm:pt-16">
        <Card className="p-6 sm:p-8">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
            {workspace === "demo" ? "This demo board is empty" : "Your board is empty"}
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            {workspace === "demo"
              ? "Regenerate the demo pipeline from Data & backup to fill it again."
              : "Add the first project and the dashboard, board, forecast, and follow-up queue start filling in. Nothing here is generated — everything on this board is something you put there."}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-white shadow-card transition hover:bg-ink/90 active:scale-[0.98]"
            >
              <IconPlus size={14} className="text-volt" />
              Add your first project
            </button>
            <button
              type="button"
              onClick={() => setDataSettingsOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3.5 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-canvas"
            >
              Restore a backup
            </button>
          </div>

          <ul className="mt-6 space-y-2 border-t border-line pt-5 text-[12.5px] text-ink-soft">
            {[
              "Eight fields to add a project — the rest can wait until you need it.",
              "One project can be bid to several GCs without double-counting the value.",
              "Every active opportunity wants a next follow-up date, or it shows up as unscheduled.",
              "Press ⌘K anywhere to search or jump.",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <IconArrowRight size={12} className="mt-1 shrink-0 text-ink-faint" />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageBody>
  );
}

function greeting(today: string): string {
  const date = new Date(`${today}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function LoadingGrid() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[132px] animate-pulse bg-canvas" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="card h-[360px] animate-pulse bg-canvas" />
        <div className="card h-[360px] animate-pulse bg-canvas" />
      </div>
    </div>
  );
}
