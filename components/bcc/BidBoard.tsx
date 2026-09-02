"use client";

import { useMemo, useState } from "react";

import { useData, useRecipientIndex } from "@/components/providers/DataProvider";
import { ConfirmDialog } from "@/components/ui/Overlay";
import { cx } from "@/components/ui/primitives";
import { currencyCompact } from "@/lib/bcc/format";
import { CONFIRM_STAGES, STAGES, STAGE_MAP, stagesForTab } from "@/lib/bcc/stages";
import type { PipelineTab, Project, StageId } from "@/lib/bcc/types";

import { BoardCard } from "./BoardCard";

export function BidBoard({
  projects,
  tab,
}: {
  projects: Project[];
  tab: PipelineTab;
}) {
  const { updateProject, toast } = useData();
  const recipients = useRecipientIndex();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StageId | null>(null);
  const [pending, setPending] = useState<{ project: Project; stage: StageId } | null>(null);

  const columns = useMemo(() => {
    const allowed = stagesForTab(tab);
    return STAGES.filter((s) => s.onBoard && (allowed == null || allowed.includes(s.id)));
  }, [tab]);

  const grouped = useMemo(() => {
    const map = new Map<StageId, Project[]>();
    for (const s of columns) map.set(s.id, []);
    for (const p of projects) {
      const list = map.get(p.stage);
      if (list) list.push(p);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => b.expectedValue - a.expectedValue);
    }
    return map;
  }, [projects, columns]);

  const move = async (project: Project, stage: StageId) => {
    const previous = project.stage;
    await updateProject(project.id, { stage });
    toast(`Moved to ${STAGE_MAP[stage].label}`, {
      detail: project.name,
      undo: () => void updateProject(project.id, { stage: previous }),
    });
  };

  const onDrop = (stage: StageId, transferred?: string) => {
    setOver(null);
    // Prefer the id carried on the drag event; React state is the fallback for
    // browsers that fire drop before a state update lands.
    const id = transferred || dragging;
    setDragging(null);
    if (!id) return;
    const project = projects.find((p) => p.id === id);
    if (!project || project.stage === stage) return;
    if (CONFIRM_STAGES.includes(stage)) setPending({ project, stage });
    else void move(project, stage);
  };

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex min-h-[60vh] gap-3">
          {columns.map((stage) => {
            const items = grouped.get(stage.id) ?? [];
            const value = items.reduce((s, p) => s + p.expectedValue, 0);
            const isOver = over === stage.id;
            return (
              <section
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== stage.id) setOver(stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(stage.id, e.dataTransfer.getData("text/plain"));
                }}
                className={cx(
                  "flex w-[268px] shrink-0 flex-col rounded-xl2 border transition-colors",
                  isOver
                    ? "border-ink bg-volt-tint/60"
                    : "border-line bg-canvas",
                )}
              >
                <header className="sticky top-0 z-10 rounded-t-xl2 border-b border-line bg-canvas/95 px-3 py-2.5 backdrop-blur">
                  <div className="flex items-baseline gap-2">
                    <h3 className="truncate text-[12.5px] font-semibold text-ink">
                      {stage.short}
                    </h3>
                    <span className="tnum text-[11px] text-ink-faint">{items.length}</span>
                    <span className="tnum ml-auto text-[11.5px] font-medium text-ink-soft">
                      {currencyCompact(value)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-line">
                    <div
                      className={cx(
                        "h-full rounded-full",
                        stage.tab === "contracted"
                          ? "bg-ok"
                          : stage.tab === "awarded"
                            ? "bg-volt"
                            : stage.tab === "closed"
                              ? "bg-line-strong"
                              : "bg-ink",
                      )}
                      style={{ width: `${Math.max(6, stage.defaultProbability * 100)}%` }}
                      title={`${Math.round(stage.defaultProbability * 100)}% default probability`}
                    />
                  </div>
                </header>

                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.map((p) => (
                    <BoardCard
                      key={p.id}
                      project={p}
                      recipients={recipients.get(p.id) ?? []}
                      dragging={dragging === p.id}
                      onDragStart={() => setDragging(p.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    />
                  ))}
                  {items.length === 0 ? (
                    <p
                      className={cx(
                        "rounded-lg border border-dashed px-3 py-6 text-center text-[11.5px] transition",
                        isOver
                          ? "border-ink text-ink"
                          : "border-line-strong text-ink-faint",
                      )}
                    >
                      {isOver ? `Drop into ${stage.short}` : "Empty"}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={pending != null}
        title={pending ? `Move to ${STAGE_MAP[pending.stage].label}?` : ""}
        confirmLabel="Move stage"
        tone={pending?.stage === "contracted" ? "primary" : "danger"}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending!;
          setPending(null);
          void move(p.project, p.stage);
        }}
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {pending?.stage === "contracted"
            ? `${pending.project.name} moves into contracted backlog. Add the executed contract amount and confirm install dates next.`
            : pending?.stage === "lost"
              ? `${pending?.project.name} leaves active pipeline. Record who won it and why — that is the only thing a loss is good for.`
              : `${pending?.project.name} leaves active pipeline.`}
        </p>
      </ConfirmDialog>
    </>
  );
}
