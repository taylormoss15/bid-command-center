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
