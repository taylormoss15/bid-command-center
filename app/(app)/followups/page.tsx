"use client";

import { useMemo, useState } from "react";

import { FollowUpRow } from "@/components/bcc/FollowUpRow";
import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { PageBody, PageIntro } from "@/components/shell/PageBody";
import { Segmented } from "@/components/ui/Field";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@/components/ui/Icons";
import { Card, EmptyState, HealthChip, cx } from "@/components/ui/primitives";
import { followUpHealth, isActive, nextFollowUp } from "@/lib/bcc/calc";
import { currencyCompact, formatDate, parseDate, toISODate } from "@/lib/bcc/format";
import type { FollowUpHealth, Project } from "@/lib/bcc/types";

const GROUPS: { health: FollowUpHealth; title: string; blurb: string }[] = [
  { health: "overdue", title: "Overdue", blurb: "The date has passed. Make these calls first." },
  { health: "due_today", title: "Due today", blurb: "Booked for today." },
  {
    health: "unscheduled",
    title: "Unscheduled",
    blurb: "Active opportunities with no next action — the quiet way to lose a job.",
  },
  { health: "due_soon", title: "Due in the next 3 days", blurb: "" },
  { health: "waiting", title: "Waiting on an event", blurb: "Parked deliberately, not forgotten." },
  { health: "scheduled", title: "Scheduled later", blurb: "" },
];

export default function FollowUpsPage() {
  const { db, today } = useData();
  const recipients = useRecipientIndex();
  const [view, setView] = useState<"queue" | "calendar">("queue");

  const grouped = useMemo(() => {
    const map = new Map<FollowUpHealth, Project[]>();
    for (const g of GROUPS) map.set(g.health, []);
    for (const p of db?.projects ?? []) {
      if (!isActive(p)) continue;
      const health = followUpHealth(p, recipients.get(p.id) ?? [], today);
      map.get(health)?.push(p);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => {
        const an = nextFollowUp(recipients.get(a.id) ?? [])?.date ?? "9999";
        const bn = nextFollowUp(recipients.get(b.id) ?? [])?.date ?? "9999";
        if (an !== bn) return an < bn ? -1 : 1;
        return b.expectedValue - a.expectedValue;
      });
    }
    return map;
  }, [db?.projects, recipients, today]);

  const totalOpen =
    (grouped.get("overdue")?.length ?? 0) +
    (grouped.get("due_today")?.length ?? 0) +
    (grouped.get("unscheduled")?.length ?? 0);

  return (
    <PageBody>
      <PageIntro
        title="Follow-ups"
        subtitle={
          totalOpen === 0
            ? "Nothing overdue, nothing due today, and every active opportunity has a next action."
            : `${totalOpen} ${totalOpen === 1 ? "opportunity needs" : "opportunities need"} attention right now.`
        }
        action={
          <Segmented
            options={[
              { id: "queue", label: "Queue" },
              { id: "calendar", label: "Calendar" },
            ]}
            value={view}
            onChange={setView}
          />
        }
      />

      {view === "queue" ? (
        <div className="space-y-4">
          {GROUPS.map((group) => {
            const items = grouped.get(group.health) ?? [];
            if (items.length === 0 && !["overdue", "due_today", "unscheduled"].includes(group.health)) {
              return null;
            }
            const value = items.reduce((s, p) => s + p.expectedValue, 0);
            return (
              <Card key={group.health} padded={false} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <HealthChip health={group.health} />
                  <h3 className="text-[13.5px] font-semibold text-ink">{group.title}</h3>
                  <span className="tnum text-[12px] text-ink-muted">
                    {items.length} · {currencyCompact(value)}
                  </span>
                  {group.blurb ? (
                    <p className="w-full text-[12px] text-ink-muted sm:w-auto sm:flex-1 sm:text-right">
                      {group.blurb}
                    </p>
                  ) : null}
                </div>
                {items.length === 0 ? (
                  <EmptyState
                    title={
                      group.health === "unscheduled"
                        ? "Every active opportunity has a next action"
                        : "Nothing here"
                    }
                    icon={<IconCheck size={20} />}
                  />
                ) : (
                  <div className="border-t border-line">
                    {items.map((p) => (
                      <FollowUpRow
                        key={p.id}
                        project={p}
                        recipients={recipients.get(p.id) ?? []}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <FollowUpCalendar />
      )}
    </PageBody>
  );
}

function FollowUpCalendar() {
  const { db, today, openProject } = useData();
  const orgs = useOrgIndex();
  const [offset, setOffset] = useState(0);

  const base = parseDate(today) ?? new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);

  const byDay = useMemo(() => {
    const map = new Map<string, { project: Project; org: string }[]>();
    for (const r of db?.recipients ?? []) {
      if (!r.nextFollowUpDate) continue;
      const project = db?.projects.find((p) => p.id === r.projectId);
      if (!project || !isActive(project)) continue;
      const list = map.get(r.nextFollowUpDate) ?? [];
      list.push({ project, org: orgs.get(r.organizationId) ?? "GC" });
      map.set(r.nextFollowUpDate, list);
    }
    return map;
  }, [db?.recipients, db?.projects, orgs]);

  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <h3 className="text-[13.5px] font-semibold text-ink">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-md p-1.5 text-ink-muted transition hover:bg-sunken hover:text-ink"
          >
            <IconChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-md px-2 py-1 text-[12px] text-ink-muted transition hover:bg-sunken hover:text-ink"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setOffset((o) => o + 1)}
            className="rounded-md p-1.5 text-ink-muted transition hover:bg-sunken hover:text-ink"
          >
            <IconChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-line bg-canvas">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-faint"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          const iso = date ? toISODate(date) : null;
          const items = iso ? byDay.get(iso) ?? [] : [];
          const isToday = iso === today;
          const isPast = iso != null && iso < today;
          return (
            <div
              key={i}
              className={cx(
                "min-h-[92px] border-b border-r border-line-faint p-1.5",
                !date && "bg-canvas/50",
                isToday && "bg-volt-tint/50",
              )}
            >
              {date ? (
                <>
                  <span
                    className={cx(
                      "tnum inline-flex h-5 min-w-[20px] items-center justify-center rounded text-[11px]",
                      isToday
                        ? "bg-ink font-semibold text-white"
                        : isPast
                          ? "text-ink-faint"
                          : "text-ink-soft",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map(({ project, org }) => (
                      <button
                        key={`${project.id}-${org}`}
                        type="button"
                        onClick={() => openProject(project.id)}
                        title={`${project.name} — ${org}`}
                        className={cx(
                          "block w-full truncate rounded px-1 py-0.5 text-left text-[10.5px] transition",
                          isPast
                            ? "bg-danger-tint text-danger-ink hover:brightness-95"
                            : "bg-sunken text-ink-soft hover:bg-line",
                        )}
                      >
                        {project.name}
                      </button>
                    ))}
                    {items.length > 3 ? (
                      <p className="px-1 text-[10px] text-ink-faint">+{items.length - 3} more</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
