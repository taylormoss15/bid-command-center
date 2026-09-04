"use client";

import { useEffect, useMemo, useState } from "react";

import { useData, useOrgIndex } from "@/components/providers/DataProvider";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { probabilityOf } from "@/lib/bcc/calc";
import { CadenceMessage } from "@/components/bcc/CadenceMessage";
import { nextInCadence } from "@/lib/bcc/cadence";
import { addDays, formatDate, todayISO } from "@/lib/bcc/format";
import { STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import { CONTACT_METHODS, FOLLOW_UP_TYPES, FOLLOW_UP_TYPE_MAP, SIGNALS } from "@/lib/bcc/taxonomy";
import type { ContactMethod, FollowUpType, Signal, StageId } from "@/lib/bcc/types";

const QUICK_DATES = [
  { label: "+3 days", days: 3 },
  { label: "+1 week", days: 7 },
  { label: "+2 weeks", days: 14 },
  { label: "+1 month", days: 30 },
];

/**
 * The 30-second interaction: record what happened, adjust the read on the
 * deal, and book the next commitment before the modal closes. Nothing here is
 * required except a next date — an opportunity should never leave without one.
 */
export function LogFollowUpModal() {
  const { db, logTarget, openLog, logFollowUp, toast, today } = useData();
  const orgs = useOrgIndex();

  const project = db?.projects.find((p) => p.id === logTarget?.projectId) ?? null;
  const recipients = useMemo(
    () => (db?.recipients ?? []).filter((r) => r.projectId === logTarget?.projectId),
    [db?.recipients, logTarget?.projectId],
  );

  const [recipientId, setRecipientId] = useState<string>("");
  const [method, setMethod] = useState<ContactMethod>("call");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [signal, setSignal] = useState<Signal>("neutral");
  const [stage, setStage] = useState<StageId | "">("");
  const [probability, setProbability] = useState<string>("");
  const [nextDate, setNextDate] = useState<string>("");
  const [nextType, setNextType] = useState<FollowUpType>("bid_leveling");
  const [waiting, setWaiting] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the form each time the sheet opens on a new target.
  useEffect(() => {
    if (!logTarget || !project) return;
    const preferred =
      logTarget.recipientId ??
      recipients.find((r) => r.nextFollowUpDate)?.id ??
      recipients[0]?.id ??
      "";
    setRecipientId(preferred);
    const rec = recipients.find((r) => r.id === preferred);
    setContact(rec?.contactName ?? "");
    setMethod("call");
    setNote("");
    setSignal(rec?.signal ?? "neutral");
    setStage("");
    setProbability("");
    // Where the cadence goes after this touch, rather than a flat week out.
    const plan = nextInCadence(project, rec, db?.activities ?? [], todayISO());
    setNextDate(plan.date);
    setNextType(plan.type);
    setWaiting("");
  }, [logTarget, project, recipients, db?.activities]);

  if (!logTarget || !project) return null;

  const currentProbability = Math.round(probabilityOf(project) * 100);
  const stageDefault = stage ? Math.round(STAGE_MAP[stage].defaultProbability * 100) : null;

  const submit = async () => {
    setBusy(true);
    try {
      await logFollowUp({
        projectId: project.id,
        recipientId: recipientId || null,
        method,
        contact: contact || null,
        note: note.trim() || undefined,
        signal,
        stage: stage || undefined,
        probability: probability === "" ? undefined : Number(probability) / 100,
        nextFollowUpDate: waiting.trim() ? null : nextDate || null,
        nextFollowUpType: waiting.trim() ? null : nextType,
        waitingOn: waiting.trim() || null,
      });
      openLog(null);
      toast("Follow-up logged", {
        detail: waiting.trim()
          ? `Waiting on ${waiting.trim()}`
          : nextDate
            ? `Next: ${FOLLOW_UP_TYPE_MAP[nextType].toLowerCase()} on ${formatDate(nextDate)}`
            : "No next action scheduled",
      });
    } catch {
      // The provider already surfaced the failure.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => openLog(null)}
      title="Log follow-up"
      description={project.name}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => openLog(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save follow-up"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GC / client">
            <Select
              value={recipientId}
              onChange={(e) => {
                setRecipientId(e.target.value);
                const rec = recipients.find((r) => r.id === e.target.value);
                setContact(rec?.contactName ?? "");
              }}
            >
              <option value="">General project note</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {orgs.get(r.organizationId) ?? "GC"}
                  {r.contactName ? ` — ${r.contactName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Who did you speak with?"
            />
          </Field>
        </div>

        <Field label="How">
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cx(
                  "h-8 rounded-lg border px-3 text-[13px] font-medium transition",
                  method === m.id
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-paper text-ink-soft hover:border-line-strong",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What happened">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ryan says our number is the one the owner is working from…"
          />
        </Field>

        <Field label="Signal" hint="Directional read from this interaction.">
          <div className="flex flex-wrap gap-1.5">
            {SIGNALS.map((s) => {
              const active = signal === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSignal(s.id)}
                  className={cx(
                    "h-8 rounded-lg border px-2.5 text-[12.5px] font-medium transition",
                    active
                      ? s.tone === "up"
                        ? "border-ok bg-ok-tint text-ok-ink"
                        : s.tone === "down"
                          ? "border-danger bg-danger-tint text-danger-ink"
                          : "border-ink bg-sunken text-ink"
                      : "border-line bg-paper text-ink-muted hover:border-line-strong",
                  )}
                >
                  <span className="mr-1.5 font-bold">{s.short}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="rounded-xl border border-line bg-canvas p-3">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
            Update the read — optional
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Move stage">
              <Select value={stage} onChange={(e) => setStage(e.target.value as StageId | "")}>
                <option value="">Keep {STAGE_MAP[project.stage].label}</option>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {Math.round(s.defaultProbability * 100)}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Win probability"
              hint={
                stageDefault != null
                  ? `Stage default is ${stageDefault}%. Leave blank to use it.`
                  : `Currently ${currentProbability}%. Leave blank to keep it.`
              }
            >
              <Input
                inputMode="numeric"
                value={probability}
                onChange={(e) => setProbability(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={String(stageDefault ?? currentProbability)}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-ink/12 bg-volt-tint/50 p-3">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-volt-deep">
            Next commitment
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Next follow-up">
              <Input
                type="date"
                value={nextDate}
                min={today}
                disabled={waiting.trim().length > 0}
                onChange={(e) => setNextDate(e.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {QUICK_DATES.map((q) => (
                  <button
                    key={q.days}
                    type="button"
                    disabled={waiting.trim().length > 0}
                    onClick={() => setNextDate(addDays(todayISO(), q.days))}
                    className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Type">
              <Select
                value={nextType}
                disabled={waiting.trim().length > 0}
                onChange={(e) => setNextType(e.target.value as FollowUpType)}
              >
                {FOLLOW_UP_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            className="mt-3"
            label="…or park it against an event"
            hint="Use this instead of a date when you are genuinely waiting on something specific."
          >
            <Input
              value={waiting}
              onChange={(e) => setWaiting(e.target.value)}
              placeholder="Board meeting on the 14th"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
