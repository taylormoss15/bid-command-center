"use client";

import { useEffect, useMemo, useState } from "react";

import { useData, useOrgIndex } from "@/components/providers/DataProvider";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { addDays, formatDate, todayISO } from "@/lib/bcc/format";
import { FOLLOW_UP_TYPES } from "@/lib/bcc/taxonomy";
import type { FollowUpType } from "@/lib/bcc/types";

const QUICK_DATES = [
  { label: "Tomorrow", days: 1 },
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
  { label: "+2 weeks", days: 14 },
];

/**
 * Booking the next commitment on its own, with nothing else to fill in.
 *
 * Log follow-up asks what happened and then books the next one, which is the
 * right shape after a call. But the commonest failure is an opportunity
 * sitting with no next action at all, and making someone write up a call they
 * have not had yet is a reason to skip it. So this is the shortest path there
 * is: pick a day, pick why, done.
 */
export function SetFollowUpModal() {
  const { db, followUpTarget, openSetFollowUp, updateRecipient, toast, today } = useData();
  const orgs = useOrgIndex();

  const project = db?.projects.find((p) => p.id === followUpTarget?.projectId) ?? null;
  const recipients = useMemo(
    () => (db?.recipients ?? []).filter((r) => r.projectId === followUpTarget?.projectId),
    [db?.recipients, followUpTarget?.projectId],
  );

  const [recipientId, setRecipientId] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<FollowUpType>("bid_leveling");
  const [applyToAll, setApplyToAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!followUpTarget || !project) return;
    const preferred =
      followUpTarget.recipientId ??
      // Whoever is most overdue is usually who you meant.
      [...recipients]
        .sort((a, b) => (a.nextFollowUpDate ?? "9") .localeCompare(b.nextFollowUpDate ?? "9"))
        .find((r) => !r.nextFollowUpDate)?.id ??
      recipients[0]?.id ??
      "";
    setRecipientId(preferred);
    const rec = recipients.find((r) => r.id === preferred);
    setDate(rec?.nextFollowUpDate ?? addDays(todayISO(), 7));
    setType(rec?.nextFollowUpType ?? "bid_leveling");
    setApplyToAll(false);
  }, [followUpTarget, project, recipients]);

  if (!followUpTarget || !project) return null;

  const recipient = recipients.find((r) => r.id === recipientId) ?? null;
  const targets = applyToAll ? recipients : recipient ? [recipient] : [];
  const orgName = (id: string) => orgs.get(id) ?? "GC";

  const save = async () => {
    if (targets.length === 0 || !date) return;
    setBusy(true);
    try {
      for (const r of targets) {
        await updateRecipient(r.id, { nextFollowUpDate: date, nextFollowUpType: type });
      }
      toast("Follow-up booked", {
        detail:
          targets.length === 1
            ? `${orgName(targets[0].organizationId)} · ${formatDate(date)}`
            : `${targets.length} GCs · ${formatDate(date)}`,
      });
      openSetFollowUp(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!recipient) return;
    setBusy(true);
    try {
      await updateRecipient(recipient.id, { nextFollowUpDate: null, nextFollowUpType: null });
      toast("Follow-up cleared", {
        detail: `${orgName(recipient.organizationId)} has no next action.`,
        tone: "danger",
      });
      openSetFollowUp(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => openSetFollowUp(null)}
      title="Set follow-up"
      description={`${project.code} · ${project.name}`}
      width="sm"
      footer={
        <div className="flex w-full items-center gap-2">
          {recipient?.nextFollowUpDate ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy}
              className="text-[12.5px] text-ink-muted underline-offset-2 transition hover:text-danger hover:underline disabled:opacity-50"
            >
              Clear it
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => openSetFollowUp(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="volt" onClick={() => void save()} disabled={busy || !date}>
              {busy ? "Saving…" : "Book it"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {recipients.length === 0 ? (
          <p className="rounded-xl border border-warn/30 bg-warn-tint p-3 text-[12.5px] leading-relaxed text-warn-ink">
            No GC on this project yet. Add one under GCs &amp; Contacts first — a
            follow-up is a commitment to a person, so it needs somebody to be with.
          </p>
        ) : null}

        {recipients.length > 1 ? (
          <Field label="Which GC">
            <Select
              value={recipientId}
              onChange={(e) => {
                setRecipientId(e.target.value);
                const rec = recipients.find((r) => r.id === e.target.value);
                if (rec?.nextFollowUpType) setType(rec.nextFollowUpType);
              }}
              disabled={applyToAll}
            >
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {orgName(r.organizationId)}
                  {r.nextFollowUpDate ? ` — next ${formatDate(r.nextFollowUpDate)}` : " — nothing booked"}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Follow up on" hint={date ? relativeHint(today, date) : undefined}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_DATES.map((q) => {
              const value = addDays(todayISO(), q.days);
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDate(value)}
                  className={cx(
                    "rounded-lg border px-2.5 py-1 text-[12px] font-medium transition",
                    date === value
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink",
                  )}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="What for">
          <Select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        {recipients.length > 1 ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 transition hover:bg-canvas">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">
                Same date for all {recipients.length} GCs
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                One round of calls on the same job, booked in one go.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}

function relativeHint(today: string, date: string): string {
  const days = Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days < 0) return `${formatDate(date)} — ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return `${formatDate(date)} — today`;
  if (days === 1) return `${formatDate(date)} — tomorrow`;
  return `${formatDate(date)} — in ${days} days`;
}
