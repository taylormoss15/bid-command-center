"use client";

import { useMemo, useState } from "react";

import {
  CertaintyLegend,
  ForecastTimeline,
  ForecastTotals,
  buildMonths,
  certaintyOf,
} from "@/components/bcc/ForecastTimeline";
import { StatTile } from "@/components/bcc/charts";
import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { PageBody, PageIntro } from "@/components/shell/PageBody";
import { Segmented, Select } from "@/components/ui/Field";
import { Card, EmptyState, SectionHeader } from "@/components/ui/primitives";
import {
  estimatedGrossProfit,
  isActive,
  probabilityOf,
  remainingBacklog,
  weightedValue,
} from "@/lib/bcc/calc";
import { currencyCompact } from "@/lib/bcc/format";
import { materialLabel } from "@/lib/bcc/taxonomy";
import type { Project } from "@/lib/bcc/types";

type Range = "6" | "12" | "24";
type GroupBy = "status" | "manager" | "system" | "location" | "gc";

const GROUP_LABEL: Record<GroupBy, string> = {
  status: "Contract status",
  manager: "Project manager",
  system: "Roofing system",
  location: "Location",
  gc: "GC / client",
};

export default function ForecastPage() {
  const { db, today, openProject } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();
  const [range, setRange] = useState<Range>("12");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [includePipeline, setIncludePipeline] = useState(true);

  const months = useMemo(() => buildMonths(today, Number(range)), [today, range]);

  const projects = useMemo(() => {
    return (db?.projects ?? []).filter((p) => {
      if (!p.installStart || !p.installEnd) return false;
      if (p.stage === "contracted") return true;
      if (!isActive(p)) return false;
      if (!includePipeline && certaintyOf(p) === "pipeline") return false;
      return true;
    });
  }, [db?.projects, includePipeline]);

  const groups = useMemo(() => {
    const map = new Map<string, Project[]>();
    const push = (key: string, p: Project) => {
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    };

    for (const p of projects) {
      if (groupBy === "status") {
        const c = certaintyOf(p);
        push(
          c === "contracted"
            ? "Contracted"
            : c === "awarded"
              ? "Awarded, pending contract"
              : "Active pipeline",
          p,
        );
      } else if (groupBy === "manager") {
        push(p.projectManager || "Unassigned", p);
      } else if (groupBy === "system") {
        push(p.materials[0] ? materialLabel(p.materials[0]) : "Unspecified", p);
      } else if (groupBy === "location") {
        push(`${p.city}, ${p.state}`, p);
      } else {
        const recs = recipients.get(p.id) ?? [];
        push(recs.length === 1 ? orgs.get(recs[0].organizationId) ?? "Unknown" : recs.length === 0 ? "No GC" : `${recs.length} GCs`, p);
      }
    }

    const order =
      groupBy === "status"
        ? ["Contracted", "Awarded, pending contract", "Active pipeline"]
        : Array.from(map.keys()).sort();
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, projects: map.get(k)! }));
  }, [projects, groupBy, recipients, orgs]);

  const totals = useMemo(() => {
    const contracted = projects.filter((p) => certaintyOf(p) === "contracted");
    const awarded = projects.filter((p) => certaintyOf(p) === "awarded");
    return {
      contracted: contracted.reduce((s, p) => s + (remainingBacklog(p) ?? p.expectedValue), 0),
      awarded: awarded.reduce((s, p) => s + p.expectedValue, 0),
      weighted: projects.reduce((s, p) => s + weightedValue(p), 0),
      profit: projects.reduce(
        (s, p) => s + (estimatedGrossProfit(p) ?? 0) * probabilityOf(p),
        0,
      ),
      squares: projects.reduce((s, p) => s + (p.roofAreaSqFt ?? 0) / 100, 0),
    };
  }, [projects]);

  return (
    <PageBody wide>
      <PageIntro
        title="Install forecast"
        subtitle="What Elite is actually going to build, and when the months get crowded. Signed work and hopeful work are never drawn the same."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              options={[
                { id: "6", label: "6 mo" },
                { id: "12", label: "12 mo" },
                { id: "24", label: "24 mo" },
              ]}
              value={range}
              onChange={setRange}
            />
            <Select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="h-8 w-[168px] py-1 text-[12.5px]"
            >
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <option key={g} value={g}>
                  Group by {GROUP_LABEL[g].toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Contracted"
          value={currencyCompact(totals.contracted)}
          sub="Remaining to perform"
          tone="ok"
        />
        <StatTile
          label="Apparent awards"
          value={currencyCompact(totals.awarded)}
          sub="Not yet contracted"
        />
        <StatTile
          label="Weighted pipeline"
          value={currencyCompact(totals.weighted)}
          sub="Across this window"
        />
        <StatTile
          label="Expected gross profit"
          value={currencyCompact(totals.profit)}
          sub="Probability-weighted"
        />
        <StatTile
          label="Roofing squares"
          value={Math.round(totals.squares).toLocaleString()}
          sub="Total in this window"
        />
      </div>

      <Card>
        <SectionHeader
          title={`Next ${range} months`}
          hint={`${projects.length} projects with install windows · grouped by ${GROUP_LABEL[groupBy].toLowerCase()}`}
          action={
            <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <input
                type="checkbox"
                checked={includePipeline}
                onChange={(e) => setIncludePipeline(e.target.checked)}
                className="h-3.5 w-3.5 accent-black"
              />
              Include active pipeline
            </label>
          }
        />

        <div className="mt-4 overflow-x-auto">
          {groups.length === 0 ? (
            <EmptyState
              title="No install windows yet"
              body="Add install start and end dates to projects and they will appear on this timeline."
            />
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <h4 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                      {group.key}
                    </h4>
                    <span className="tnum text-[11.5px] text-ink-muted">
                      {group.projects.length} ·{" "}
                      {currencyCompact(
                        group.projects.reduce((s, p) => s + p.expectedValue, 0),
                      )}
                    </span>
                  </div>
                  <ForecastTimeline
                    projects={group.projects}
                    months={months}
                    onSelect={openProject}
                  />
                </div>
              ))}

              <div className="border-t border-line pt-2">
                <ForecastTotals projects={projects} months={months} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <CertaintyLegend />
        </div>
      </Card>
    </PageBody>
  );
}
