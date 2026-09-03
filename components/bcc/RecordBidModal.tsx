"use client";

import { useEffect, useMemo, useState } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { currency, formatDate, todayISO } from "@/lib/bcc/format";
import { STAGE_MAP } from "@/lib/bcc/stages";
import type { StageId } from "@/lib/bcc/types";

// ---------------------------------------------------------------------------
// Recording what actually went out.
//
// This is the number the whole product turns on: raw proposal volume, the
// estimate-versus-contract comparison, and the four-GCs-one-project arithmetic
// all read from it. Sending the same figure to several GCs is the common case,
// so it is one checkbox rather than four trips through this form.
// ---------------------------------------------------------------------------

export function RecordBidModal() {
  const { db, recordBidTarget, openRecordBid, updateRecipient, updateProject, toast } =
    useData();
  const recipientsByProject = useRecipientIndex();
  const orgs = useOrgIndex();

  const project = db?.projects.find((p) => p.id === recordBidTarget?.projectId) ?? null;
  const recipients = useMemo(
    () => (project ? recipientsByProject.get(project.id) ?? [] : []),
    [project, recipientsByProject],
  );

  const [recipientId, setRecipientId] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [advance, setAdvance] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!recordBidTarget || !project) return;
    const preferred = recordBidTarget.recipientId ?? recipients[0]?.id ?? "";
    setRecipientId(preferred);
    setApplyToAll(false);
    const existing = recipients.find((r) => r.id === preferred);
    setAmount(existing?.submittedAmount ?? project.expectedValue ?? null);
    setDate(todayISO());
    setNote("");
    setAdvance(true);
  }, [recordBidTarget, project, recipients]);

  if (!recordBidTarget || !project) return null;

  const chosen = recipients.find((r) => r.id === recipientId);
  const targets = applyToAll ? recipients : chosen ? [chosen] : [];
  const isRevision = (chosen?.revisions.length ?? 0) > 0;

  // Where the stage sits now, and whether a submission implies moving it on.
  const stageOrder: StageId[] = [
    "identified", "invited", "estimating", "submitted", "active_followup",
    "shortlisted", "apparent_low", "verbal_award", "contract_received", "contracted",
  ];
  const currentIndex = stageOrder.indexOf(project.stage);
  const shouldOfferAdvance = currentIndex >= 0 && currentIndex < stageOrder.indexOf("submitted");

  const save = async () => {
    if (amount == null || targets.length === 0) return;
    setBusy(true);
    try {
      for (const target of targets) {
        await updateRecipient(target.id, {
          newRevision: { amount, date, note: note.trim() || undefined },
        });
      }
      if (shouldOfferAdvance && advance) {
        await updateProject(project.id, { stage: "submitted" });
      }
      const volume = amount * targets.length;
      toast(
        targets.length === 1
          ? `${isRevision ? "Revision" : "Proposal"} recorded`
          : `Submitted to ${targets.length} GCs`,
        {
          detail:
            targets.length === 1
              ? `${currency(amount)} to ${orgs.get(targets[0].organizationId) ?? "GC"}`
              : `${currency(volume)} of proposal activity · ${currency(project.expectedValue)} of unique pipeline`,
        },
      );
      openRecordBid(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => openRecordBid(null)}
      title={isRevision ? "Record a revision" : "Record what you submitted"}
      description={project.name}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => openRecordBid(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || amount == null || targets.length === 0}
          >
            {busy ? "Saving…" : targets.length > 1 ? `Record for ${targets.length} GCs` : "Record"}
          </Button>
        </>
      }
    >
      {recipients.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          This project has no GCs on it yet. Add one from the GCs &amp; Contacts tab first —
          a submitted amount belongs to a bid path, not to the project.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Submitted to">
            <Select
              value={recipientId}
              disabled={applyToAll}
              onChange={(e) => {
                setRecipientId(e.target.value);
                const r = recipients.find((x) => x.id === e.target.value);
                setAmount(r?.submittedAmount ?? project.expectedValue ?? null);
              }}
            >
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {orgs.get(r.organizationId) ?? "GC"}
                  {r.submittedAmount ? ` — currently ${currency(r.submittedAmount)}` : " — nothing submitted yet"}
                </option>
              ))}
            </Select>
          </Field>

          {recipients.length > 1 ? (
            <label className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-black"
              />
              <span>
                <span className="font-medium text-ink">
                  Same number to all {recipients.length} GCs
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  {amount
                    ? `${currency(amount * recipients.length)} of proposal activity, still ${currency(project.expectedValue)} of unique pipeline.`
                    : "The usual case when one project is bid to several contractors."}
                </span>
              </span>
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount submitted" required>
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
            <Field label="Date submitted">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          {amount != null && amount !== project.expectedValue ? (
            <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
              {amount > project.expectedValue ? "Above" : "Below"} this project&apos;s expected
              value of {currency(project.expectedValue)} by{" "}
              <span className="font-medium text-ink">
                {currency(Math.abs(amount - project.expectedValue))}
              </span>
              . Expected value drives the pipeline totals — update it from Edit if this
              number is the better estimate now.
            </p>
          ) : null}

          <Field
            label="Note"
            hint="What changed, if this is a revision. Shows up in Bid History."
          >
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isRevision ? "Addendum 3 — reduced paver area" : "Original proposal"}
            />
          </Field>

          {chosen && chosen.revisions.length > 0 ? (
            <div className="rounded-lg border border-line">
              <p className="border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                Already recorded for this GC
              </p>
              <ul className="divide-y divide-line-faint">
                {chosen.revisions.map((rev) => (
                  <li key={rev.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className="text-ink-muted">Rev {rev.revision}</span>
                    <span className="tnum font-medium text-ink">{currency(rev.amount)}</span>
                    <span className="text-ink-muted">{formatDate(rev.date)}</span>
                    <span className="truncate text-ink-faint">{rev.note ?? ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {shouldOfferAdvance ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={advance}
                onChange={(e) => setAdvance(e.target.checked)}
                className="h-3.5 w-3.5 accent-black"
              />
              Also move from {STAGE_MAP[project.stage].label} to Bid Submitted
            </label>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
