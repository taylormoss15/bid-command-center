"use client";

import { useState } from "react";

import { useData, useOrgIndex } from "@/components/providers/DataProvider";
import { Input, Select } from "@/components/ui/Field";
import { IconDots, IconExternal, IconLayers } from "@/components/ui/Icons";
import { Button, HealthChip, TrelloLink, cx } from "@/components/ui/primitives";
import {
  estimatedMargin,
  followUpHealth,
  followUpHealthForDate,
  nextFollowUp,
  probabilityOf,
} from "@/lib/bcc/calc";
import {
  currency,
  currencyCompact,
  daysBetween,
  formatDate,
  formatDateTime,
  formatRange,
  percent,
} from "@/lib/bcc/format";
import { STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import { materialAbbr } from "@/lib/bcc/taxonomy";
import type { BidRecipient, Project, StageId } from "@/lib/bcc/types";

/**
 * The collapsed card carries only what is needed to triage in three seconds.
 * Weighted value, contacts, financial assumptions, and risk notes deliberately
 * live in the expanded panel instead.
 */
export function BoardCard({
  project,
  recipients,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  project: Project;
  recipients: BidRecipient[];
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { today, openProject } = useData();
  const orgs = useOrgIndex();
  const [editing, setEditing] = useState(false);

  const next = nextFollowUp(recipients);
  const health = followUpHealth(project, recipients, today);
  const submitted = recipients.reduce((m, r) => Math.max(m, r.submittedAmount ?? 0), 0);
  const margin = estimatedMargin(project);

  const bidDays = daysBetween(today, project.bidDueDate);
  const bidUrgent = bidDays != null && bidDays <= 7;
  const bidPassed = bidDays != null && bidDays < 0;

  const gcLabel =
    recipients.length === 0
      ? "No GC yet"
      : recipients.length === 1
        ? orgs.get(recipients[0].organizationId) ?? "GC"
        : `${recipients.length} GCs bidding`;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", project.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={`${project.name} — ${STAGE_MAP[project.stage].label}`}
      className={cx(
        "group relative cursor-grab rounded-xl border border-line bg-paper p-3 shadow-card transition-all duration-150",
        "hover:-translate-y-px hover:border-line-strong hover:shadow-raised active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => openProject(project.id)}
        className="block w-full text-left"
      >
        <h4 className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
          {project.name}
        </h4>
        <p className="mt-1 flex items-center gap-1 truncate text-[11.5px] text-ink-muted">
          {recipients.length > 1 ? (
            <IconLayers size={11} className="shrink-0 text-ink-faint" />
          ) : null}
          {gcLabel}
          <span className="text-ink-faint">·</span>
          <span className="truncate">
            {project.city}
            {project.state ? `, ${project.state}` : ""}
          </span>
        </p>
      </button>

      {project.materials.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {project.materials.slice(0, 4).map((m) => (
            <span
              key={m}
              className="rounded bg-sunken px-1 py-0.5 text-[9.5px] font-semibold tracking-[0.04em] text-ink-muted"
            >
              {materialAbbr(m)}
            </span>
          ))}
          {project.materials.length > 4 ? (
            <span className="px-0.5 text-[9.5px] font-semibold text-ink-faint">
              +{project.materials.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-2.5 space-y-1 border-t border-line-faint pt-2.5 text-[11.5px]">
        {project.bidDueDate ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-faint">Bid due</dt>
            <dd
              className={cx(
                "tnum truncate rounded px-1 font-medium",
                bidPassed
                  ? "text-ink-muted"
                  : bidUrgent
                    ? "bg-warn-tint text-warn-ink"
                    : "text-ink-soft",
              )}
            >
              {formatDateTime(project.bidDueDate)}
              {bidUrgent && !bidPassed ? (
                <span className="ml-1 font-semibold">
                  {bidDays === 0 ? "today" : `${bidDays}d`}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-faint">Next</dt>
          <dd className="flex items-center gap-1.5">
            {next ? (
              <>
                <span className="tnum text-ink-soft">{formatDate(next.date)}</span>
                {health !== "scheduled" ? <HealthChip health={health} /> : null}
              </>
            ) : (
              <HealthChip health={health} />
            )}
          </dd>
        </div>

        {project.installStart ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-faint">Install</dt>
            <dd className="tnum truncate text-ink-soft">
              {formatRange(project.installStart, project.installEnd)}
              {project.dateConfidence === "rough" || project.dateConfidence === "unknown" ? (
                <span className="ml-1 text-ink-faint" title="Install dates are not firm">
                  ~
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2.5 flex items-center gap-2 border-t border-line-faint pt-2.5">
        <span className="tnum text-[14px] font-semibold tracking-[-0.01em] text-ink">
          {currencyCompact(submitted || project.expectedValue)}
        </span>
        <span className="tnum text-[11px] text-ink-muted">
          {Math.round(probabilityOf(project) * 100)}%
          {margin != null ? ` · ${percent(margin)} GM` : ""}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <TrelloLink url={project.trelloUrl} compact />
          <button
            type="button"
            aria-label="Quick edit"
            onClick={() => setEditing((e) => !e)}
            className="rounded-md p-1 text-ink-faint transition hover:bg-sunken hover:text-ink"
          >
            <IconDots size={14} />
          </button>
          <button
            type="button"
            aria-label="Expand project"
            onClick={() => openProject(project.id)}
            className="rounded-md p-1 text-ink-faint transition hover:bg-sunken hover:text-ink"
          >
            <IconExternal size={13} />
          </button>
        </span>
      </div>

      {editing ? (
        <QuickEdit
          project={project}
          recipientId={next?.recipientId ?? recipients[0]?.id}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}

function QuickEdit({
  project,
  recipientId,
  onClose,
}: {
  project: Project;
  recipientId?: string;
  onClose: () => void;
}) {
  const { updateProject, updateRecipient, toast, db } = useData();
  const recipient = db?.recipients.find((r) => r.id === recipientId);

  const [stage, setStage] = useState<StageId>(project.stage);
  const [probability, setProbability] = useState(
    String(Math.round(probabilityOf(project) * 100)),
  );
  const [marginPct, setMarginPct] = useState(
    estimatedMargin(project) != null ? String(Math.round(estimatedMargin(project)! * 100)) : "",
  );
  const [bidDue, setBidDue] = useState((project.bidDueDate ?? "").slice(0, 10));
  const [nextDate, setNextDate] = useState(recipient?.nextFollowUpDate ?? "");

  const apply = async () => {
    const time = (project.bidDueDate ?? "").slice(11, 16) || "14:00";
    const patch: Partial<Project> = { stage };
    const p = Number(probability) / 100;
    patch.probabilityOverride = Number.isFinite(p) ? p : null;
    if (marginPct !== "" && project.expectedValue > 0) {
      patch.estimatedCost = Math.round(project.expectedValue * (1 - Number(marginPct) / 100));
    }
    patch.bidDueDate = bidDue ? `${bidDue}T${time}` : null;

    await updateProject(project.id, patch);
    if (recipient && nextDate !== (recipient.nextFollowUpDate ?? "")) {
      await updateRecipient(recipient.id, { nextFollowUpDate: nextDate || null });
    }
    onClose();
    toast("Card updated", { detail: project.name });
  };

  return (
    <div className="absolute inset-x-2 top-full z-20 mt-1 space-y-2 rounded-xl border border-line bg-paper p-3 shadow-pop animate-pop-in">
      <label className="block">
        <span className="label">Stage</span>
        <Select
          value={stage}
          onChange={(e) => {
            const next = e.target.value as StageId;
            setStage(next);
            setProbability(String(Math.round(STAGE_MAP[next].defaultProbability * 100)));
          }}
          className="h-8 py-1 text-[12.5px]"
        >
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Win %</span>
          <Input
            inputMode="numeric"
            value={probability}
            onChange={(e) => setProbability(e.target.value.replace(/\D/g, ""))}
            className="h-8 py-1 text-[12.5px]"
          />
        </label>
        <label className="block">
          <span className="label">Margin %</span>
          <Input
            inputMode="numeric"
            value={marginPct}
            onChange={(e) => setMarginPct(e.target.value.replace(/\D/g, ""))}
            className="h-8 py-1 text-[12.5px]"
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Bid due</span>
        <Input
          type="date"
          value={bidDue}
          onChange={(e) => setBidDue(e.target.value)}
          className="h-8 py-1 text-[12.5px]"
        />
      </label>
      <label className="block">
        <span className="label">Next follow-up</span>
        <Input
          type="date"
          value={nextDate}
          disabled={!recipient}
          onChange={(e) => setNextDate(e.target.value)}
          className="h-8 py-1 text-[12.5px]"
        />
      </label>
      <div className="flex justify-end gap-1.5 pt-0.5">
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="xs" variant="primary" onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
