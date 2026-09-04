"use client";

import { useState } from "react";

import { useData, useOrgIndex } from "@/components/providers/DataProvider";
import { IconCalendar, IconChat, IconChevronRight } from "@/components/ui/Icons";
import {
  Button,
  HealthChip,
  IconButton,
  SignalMark,
  StageChip,
  TrelloLink,
  cx,
} from "@/components/ui/primitives";
import { followUpHealth, nextFollowUp } from "@/lib/bcc/calc";
import { addDays, currency, formatDate, relativeDays, todayISO } from "@/lib/bcc/format";
import { CadenceMessage } from "@/components/bcc/CadenceMessage";
import { suggestedReason } from "@/lib/bcc/suggest";
import type { BidRecipient, Project } from "@/lib/bcc/types";

const SNOOZE = [
  { label: "Tomorrow", days: 1 },
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
  { label: "+2 weeks", days: 14 },
];

/**
 * One line of the action queue. Everything needed to decide whether to make
 * the call, and every way to act on it, without leaving the list.
 */
export function FollowUpRow({
  project,
  recipients,
  compact,
}: {
  project: Project;
  recipients: BidRecipient[];
  compact?: boolean;
}) {
  const { today, openProject, openLog, updateRecipient, toast } = useData();
  const orgs = useOrgIndex();
  const [rescheduling, setRescheduling] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  const health = followUpHealth(project, recipients, today);
  const next = nextFollowUp(recipients);
  const recipient = next
    ? recipients.find((r) => r.id === next.recipientId)
    : recipients[0];
  const reason = suggestedReason(project, recipient, today);
  const submitted = recipients.reduce(
    (max, r) => Math.max(max, r.submittedAmount ?? 0),
    0,
  );

  const reschedule = async (days: number) => {
    if (!recipient) return;
    const previous = recipient.nextFollowUpDate ?? null;
    const date = addDays(todayISO(), days);
    setRescheduling(false);
    await updateRecipient(recipient.id, { nextFollowUpDate: date });
    toast(`Moved to ${formatDate(date)}`, {
      detail: project.name,
      undo: () => void updateRecipient(recipient.id, { nextFollowUpDate: previous }),
    });
  };

  return (
    <div
      className={cx(
        "group relative flex flex-col gap-2 border-b border-line-faint px-3 py-3 transition last:border-0 hover:bg-canvas sm:flex-row sm:flex-wrap sm:items-center sm:gap-3",
        health === "overdue" && "bg-danger-tint/30",
      )}
    >
      {health === "overdue" ? (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-danger" />
      ) : health === "due_today" ? (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
      ) : null}

      <button
        type="button"
        onClick={() => openProject(project.id)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink">{project.name}</span>
          <SignalMark signal={recipient?.signal} className="text-[12px]" />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-muted">
          <span className="truncate">
            {recipient ? orgs.get(recipient.organizationId) ?? "No GC" : "No GC"}
          </span>
          <span>·</span>
          <span className="tnum">{submitted ? currency(submitted) : currency(project.expectedValue)}</span>
          {!compact ? (
            <>
              <span>·</span>
              <span>
                {recipient?.lastContactDate
                  ? `Last contact ${relativeDays(today, recipient.lastContactDate)}`
                  : "No contact logged"}
              </span>
            </>
          ) : null}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-soft">
          <IconChevronRight size={11} className="text-ink-faint" />
          {reason}
        </span>
      </button>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
        <StageChip stage={project.stage} short />
        <HealthChip health={health} />
        {next ? (
          <span className="tnum text-[11.5px] text-ink-muted">{formatDate(next.date)}</span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {rescheduling ? (
          <div className="flex items-center gap-1 rounded-lg border border-line bg-paper p-1 shadow-raised">
            {SNOOZE.map((s) => (
              <button
                key={s.days}
                type="button"
                onClick={() => void reschedule(s.days)}
                className="rounded-md px-1.5 py-1 text-[11.5px] text-ink-soft transition hover:bg-sunken hover:text-ink"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRescheduling(false)}
              className="rounded-md px-1.5 py-1 text-[11.5px] text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <IconButton
              label="Reschedule"
              onClick={() => setRescheduling(true)}
              disabled={!recipient}
            >
              <IconCalendar size={14} />
            </IconButton>
            <TrelloLink url={project.trelloUrl} compact />
            <Button size="xs" onClick={() => setShowMessage((v) => !v)} disabled={!recipient}>
              {showMessage ? "Hide" : "Message"}
            </Button>
            <Button
              size="xs"
              onClick={() => openLog({ projectId: project.id, recipientId: recipient?.id })}
            >
              <IconChat size={12} />
              Log
            </Button>
          </>
        )}
      </div>

      {showMessage && recipient ? (
        <div className="mt-2.5 w-full">
          <CadenceMessage project={project} recipient={recipient} />
        </div>
      ) : null}
    </div>
  );
}
