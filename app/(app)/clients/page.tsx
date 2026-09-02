"use client";

import { useMemo, useState } from "react";

import { RateBar, StatTile } from "@/components/bcc/charts";
import { useData } from "@/components/providers/DataProvider";
import { PageBody, PageIntro } from "@/components/shell/PageBody";
import { IconDownload, IconMail, IconPhone } from "@/components/ui/Icons";
import {
  Card,
  Chip,
  EmptyState,
  SectionHeader,
  StageChip,
  cx,
} from "@/components/ui/primitives";
import {
  estimatedMargin,
  isActive,
  isClosed,
  remainingBacklog,
} from "@/lib/bcc/calc";
import { currency, currencyCompact, daysBetween, formatDate } from "@/lib/bcc/format";
import { materialLabel } from "@/lib/bcc/taxonomy";
import type { Organization, Project } from "@/lib/bcc/types";

interface OrgStats {
  org: Organization;
  active: Project[];
  all: Project[];
  rawVolume: number;
  uniqueBid: number;
  won: Project[];
  lost: Project[];
  contractedRevenue: number;
  avgMargin: number | null;
  avgDaysToAward: number | null;
  lastContact: string | null;
  nextFollowUp: string | null;
  systems: string[];
}

export default function ClientsPage() {
  const { db, openProject } = useData();
  const [selected, setSelected] = useState<string | null>(null);

  const stats = useMemo<OrgStats[]>(() => {
    if (!db) return [];
    return db.organizations
      .filter((o) => o.type === "gc")
      .map((org) => {
        const recs = db.recipients.filter((r) => r.organizationId === org.id);
        const projects = recs
          .map((r) => db.projects.find((p) => p.id === r.projectId))
          .filter((p): p is Project => p != null);

        const won = projects.filter((p) => p.stage === "contracted");
        const lost = projects.filter((p) => p.stage === "lost");

        const awardDurations = projects
          .map((p) => {
            const from = p.bidSubmittedDate;
            const to = p.outcome?.date ?? p.contract?.contractDate;
            if (!from || !to) return null;
            return daysBetween(from, to);
          })
          .filter((d): d is number => d != null && d > 0);

        const margins = projects
          .map((p) => estimatedMargin(p))
          .filter((m): m is number => m != null);

        const contacts = recs
          .map((r) => r.lastContactDate)
          .filter((d): d is string => Boolean(d))
          .sort();
        const nexts = recs
          .map((r) => r.nextFollowUpDate)
          .filter((d): d is string => Boolean(d))
          .sort();

        const systems = new Map<string, number>();
        for (const p of projects) {
          for (const m of p.materials) systems.set(m, (systems.get(m) ?? 0) + 1);
        }

        return {
          org,
          active: projects.filter(isActive),
          all: projects,
          rawVolume: recs.reduce((s, r) => s + (r.submittedAmount ?? 0), 0),
          uniqueBid: new Set(projects.map((p) => p.id)).size,
          won,
          lost,
          contractedRevenue: won.reduce((s, p) => s + (remainingBacklog(p) ?? p.expectedValue), 0),
          avgMargin: margins.length
            ? margins.reduce((a, b) => a + b, 0) / margins.length
            : null,
          avgDaysToAward: awardDurations.length
            ? Math.round(awardDurations.reduce((a, b) => a + b, 0) / awardDurations.length)
            : null,
          lastContact: contacts[contacts.length - 1] ?? null,
          nextFollowUp: nexts[0] ?? null,
          systems: Array.from(systems.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id]) => id),
        };
      })
      .sort((a, b) => b.rawVolume - a.rawVolume);
  }, [db]);

  const current = stats.find((s) => s.org.id === selected) ?? stats[0] ?? null;

  return (
    <PageBody>
      <PageIntro
        title="Clients & GCs"
        subtitle="Where Elite's estimating hours actually go, and which relationships pay them back."
        action={
          <a
            href="/api/bcc/export?entity=organizations"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-canvas"
          >
            <IconDownload size={13} />
            Export
          </a>
        }
      />

      {stats.length === 0 ? (
        <EmptyState title="No GCs yet" body="They appear here as soon as a project is bid to one." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <Card padded={false} className="h-fit overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <SectionHeader title="By proposal volume" hint="Raw dollars bid, all time" />
            </div>
            <div>
              {stats.map((s) => {
                const active = current?.org.id === s.org.id;
                return (
                  <button
                    key={s.org.id}
                    type="button"
                    onClick={() => setSelected(s.org.id)}
                    className={cx(
                      "relative flex w-full items-center gap-3 border-b border-line-faint px-4 py-2.5 text-left transition last:border-0",
                      active ? "bg-canvas" : "hover:bg-canvas",
                    )}
                  >
                    {active ? (
                      <span className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-ink" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {s.org.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {s.active.length} active · {s.uniqueBid} bid · {s.won.length}W/{s.lost.length}L
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right text-[12.5px] font-medium text-ink">
                      {currencyCompact(s.rawVolume)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {current ? <OrgDetail stats={current} onOpenProject={openProject} /> : null}
        </div>
      )}
    </PageBody>
  );
}

function OrgDetail({
  stats,
  onOpenProject,
}: {
  stats: OrgStats;
  onOpenProject: (id: string) => void;
}) {
  const decided = stats.won.length + stats.lost.length;
  const wonDollars = stats.won.reduce((s, p) => s + p.expectedValue, 0);
  const decidedDollars =
    wonDollars + stats.lost.reduce((s, p) => s + p.expectedValue, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              {stats.org.name}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              {[stats.org.city, stats.org.state].filter(Boolean).join(", ")}
            </p>
          </div>
          <Chip
            tone={
              stats.org.relationship === "preferred"
                ? "volt"
                : stats.org.relationship === "strong"
                  ? "ok"
                  : stats.org.relationship === "developing"
                    ? "neutral"
                    : "outline"
            }
          >
            {stats.org.relationship} relationship
          </Chip>
        </div>

        {stats.org.notes ? (
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            {stats.org.notes}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile label="Raw bid volume" value={currencyCompact(stats.rawVolume)} sub="All proposals" />
          <StatTile label="Unique projects" value={String(stats.uniqueBid)} sub="Counted once each" />
          <StatTile
            label="Contracted revenue"
            value={currencyCompact(stats.contractedRevenue)}
            sub="Remaining to perform"
            tone="ok"
          />
          <StatTile
            label="Average margin"
            value={stats.avgMargin != null ? `${Math.round(stats.avgMargin * 100)}%` : "—"}
            sub="Estimated, across bids"
          />
        </div>

        <div className="mt-4 space-y-1 border-t border-line pt-3">
          <RateBar
            label="Win rate by count"
            won={stats.won.length}
            total={decided}
            valueLabel={`${stats.won.length}/${decided}`}
          />
          <RateBar
            label="Win rate by dollars"
            won={wonDollars}
            total={decidedDollars}
            valueLabel={currencyCompact(wonDollars)}
          />
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-1.5 border-t border-line pt-3 text-[12.5px] sm:grid-cols-2">
          <Fact label="Typical bid → award">
            {stats.avgDaysToAward != null ? `${stats.avgDaysToAward} days` : "Not enough history"}
          </Fact>
          <Fact label="Payment speed">{stats.org.paymentSpeed ?? "Not tracked"}</Fact>
          <Fact label="Last contact">
            {stats.lastContact ? formatDate(stats.lastContact) : "—"}
          </Fact>
          <Fact label="Next follow-up">
            {stats.nextFollowUp ? formatDate(stats.nextFollowUp) : "None scheduled"}
          </Fact>
          <Fact label="Preferred systems">
            {stats.systems.length ? stats.systems.map(materialLabel).join(", ") : "—"}
          </Fact>
          <Fact label="Active pipeline">
            {currency(stats.active.reduce((s, p) => s + p.expectedValue, 0))}
          </Fact>
        </dl>
      </Card>

      {stats.org.contacts.length ? (
        <Card>
          <SectionHeader title="Key contacts" />
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {stats.org.contacts.map((c) => (
              <div key={c.name} className="rounded-lg border border-line px-3 py-2">
                <p className="text-[13px] font-medium text-ink">{c.name}</p>
                {c.title ? <p className="text-[11.5px] text-ink-muted">{c.title}</p> : null}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-muted">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <IconMail size={11} />
                      {c.email}
                    </a>
                  ) : null}
                  {c.phone ? (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <IconPhone size={11} />
                      {c.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card padded={false}>
        <div className="px-4 py-3">
          <SectionHeader
            title="Project history"
            hint={`${stats.all.length} projects bid to ${stats.org.name}`}
          />
        </div>
        <div className="border-t border-line">
          {stats.all.length === 0 ? (
            <EmptyState title="Nothing bid yet" />
          ) : (
            stats.all
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenProject(p.id)}
                  className="flex w-full items-center gap-3 border-b border-line-faint px-4 py-2.5 text-left transition last:border-0 hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-muted">
                      {p.city}, {p.state}
                      {p.outcome?.reason ? ` · ${p.outcome.reason.slice(0, 60)}…` : ""}
                    </span>
                  </span>
                  <StageChip stage={p.stage} short />
                  <span className="tnum w-[84px] shrink-0 text-right text-[12.5px] text-ink-soft">
                    {currencyCompact(p.expectedValue)}
                  </span>
                </button>
              ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-faint py-1 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
