"use client";

import { useMemo } from "react";

import { useData } from "@/components/providers/DataProvider";
import { cx } from "@/components/ui/primitives";
import { currencyCompact } from "@/lib/bcc/format";
import { PIPELINE_TABS } from "@/lib/bcc/stages";
import { isPendingReview, remainingBacklog } from "@/lib/bcc/calc";
import type { PipelineTab } from "@/lib/bcc/types";

/**
 * Saved filtered views over the authoritative Stage field — not a second
 * status. Moving a project's stage moves it between these tabs on its own.
 */
export function PipelineTabs({
  value,
  onChange,
}: {
  value: PipelineTab;
  onChange: (tab: PipelineTab) => void;
}) {
  const { db } = useData();

  const stats = useMemo(() => {
    const map = new Map<PipelineTab, { count: number; value: number }>();
    for (const tab of PIPELINE_TABS) {
      const projects = (db?.projects ?? []).filter(
        (p) =>
          !isPendingReview(p) && (tab.stages == null || tab.stages.includes(p.stage)),
      );
      map.set(tab.id, {
        count: projects.length,
        value: projects.reduce(
          (sum, p) =>
            sum + (tab.id === "contracted" ? remainingBacklog(p) ?? p.expectedValue : p.expectedValue),
          0,
        ),
      });
    }
    return map;
  }, [db?.projects]);

  return (
    <div className="flex gap-1 overflow-x-auto pb-px" role="tablist">
      {PIPELINE_TABS.map((tab) => {
        const active = tab.id === value;
        const s = stats.get(tab.id);
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
            className={cx(
              "group relative shrink-0 rounded-lg border px-3 py-2 text-left transition-all duration-150",
              active
                ? "border-ink bg-ink text-white shadow-card"
                : "border-line bg-paper text-ink-soft hover:border-line-strong hover:bg-canvas",
            )}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-medium">{tab.label}</span>
              <span
                className={cx(
                  "tnum text-[11px]",
                  active ? "text-white/50" : "text-ink-faint",
                )}
              >
                {s?.count ?? 0}
              </span>
            </span>
            <span
              className={cx(
                "tnum mt-0.5 block text-[11.5px]",
                active ? "text-volt" : "text-ink-muted",
              )}
            >
              {currencyCompact(s?.value ?? 0)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
