"use client";

import { useEffect, useMemo, useState } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { currency, todayISO } from "@/lib/bcc/format";
import { STAGE_MAP } from "@/lib/bcc/stages";
import type { Outcome, StageId } from "@/lib/bcc/types";

// ---------------------------------------------------------------------------
// Ask why, at the only moment anyone knows.
//
// A loss reason recorded a week later is a guess. This appears the instant a
// project moves to Lost, Cancelled or No Bid — and to Contracted, where the
// executed number is what makes backlog real. Skipping is always allowed: a
// form nobody can dismiss is a form people learn to route around.
// ---------------------------------------------------------------------------

const LOSS_REASONS = [
  "Price — we were high",
  "Price — very close, under 5%",
  "Incumbent roofer kept the work",
  "Schedule — could not commit to their dates",
  "Scope or exclusions read as risk",
  "Relationship — GC went with someone they know better",
  "Never got real feedback",
  "Other",
];

export function OutcomeCaptureModal() {
  const { db, outcomeTarget, openOutcomeCapture, updateProject, toast } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();

  const project = db?.projects.find((p) => p.id === outcomeTarget?.projectId) ?? null;
  const stage = outcomeTarget?.stage;

  const [awardedTo, setAwardedTo] = useState("");
  const [winningAmount, setWinningAmount] = useState<number | null>(null);
  const [reasonPreset, setReasonPreset] = useState(LOSS_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [lessons, setLessons] = useState("");
  const [rebid, setRebid] = useState(true);
  const [executed, setExecuted] = useState<number | null>(null);
  const [contractDate, setContractDate] = useState("");
  const [busy, setBusy] = useState(false);

  const knownCompetitors = useMemo(() => {
    const set = new Set<string>();
    for (const p of db?.projects ?? []) {
      for (const c of p.competitors ?? []) set.add(c);
      if (p.outcome?.awardedTo) set.add(p.outcome.awardedTo);
    }
    return Array.from(set).sort();
  }, [db?.projects]);

  useEffect(() => {
    if (!project) return;
    setAwardedTo(project.outcome?.awardedTo ?? project.competitors?.[0] ?? "");
    setWinningAmount(project.outcome?.winningAmount ?? null);
    setReasonPreset(LOSS_REASONS[0]);
    setDetail("");
    setLessons(project.outcome?.lessons ?? "");
    setRebid(project.outcome?.eligibleForRebid ?? true);
    setExecuted(project.contract?.executedValue ?? project.expectedValue);
    setContractDate(project.contract?.contractDate ?? todayISO());
  }, [project]);

  if (!outcomeTarget || !project || !stage) return null;

  const isLoss = stage === "lost";
  const isContracted = stage === "contracted";
  const close = () => openOutcomeCapture(null);

  const gcNames = (recipients.get(project.id) ?? [])
    .map((r) => orgs.get(r.organizationId))
    .filter(Boolean)
    .join(", ");

  const save = async () => {
    setBusy(true);
    try {
      if (isContracted) {
        await updateProject(project.id, {
          contract: {
            executedValue: executed ?? project.expectedValue,
            changeOrders: project.contract?.changeOrders ?? 0,
            revenueEarned: project.contract?.revenueEarned ?? 0,
            retainagePct: project.contract?.retainagePct ?? project.retainagePct ?? 5,
            contractDate: contractDate || null,
            bondIncluded: project.contract?.bondIncluded ?? false,
            bondCost: project.contract?.bondCost ?? null,
          },
        });
        toast("Contract recorded", {
          detail: `${currency(executed ?? project.expectedValue)} in contracted backlog.`,
        });
      } else {
        // " · " separates category from detail; the presets contain em dashes.
        const reason = [reasonPreset, detail.trim()].filter(Boolean).join(" · ");
        const outcome: Outcome =
          stage === "lost" ? "lost" : stage === "cancelled" ? "cancelled" : "no_bid";
        await updateProject(project.id, {
          outcome: {
            result: outcome,
            date: todayISO(),
            awardedTo: awardedTo.trim() || null,
            winningAmount,
            reason,
            competitor: awardedTo.trim() || null,
            lessons: lessons.trim() || undefined,
            eligibleForRebid: rebid,
          },
        });
        toast("Outcome recorded", {
          detail: isLoss
            ? "It will show up in the loss analysis."
            : "Kept on file for future follow-up.",
        });
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const gap =
    isLoss && winningAmount != null ? project.expectedValue - winningAmount : null;

  return (
    <Modal
      open
      onClose={close}
      title={isContracted ? "Record the contract" : `Why did this ${isLoss ? "go elsewhere" : "close"}?`}
      description={`${project.name} · moved to ${STAGE_MAP[stage].label}`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Skip for now
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : isContracted ? "Save contract" : "Save outcome"}
          </Button>
        </>
      }
    >
      {isContracted ? (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            The executed number is what turns this into backlog. Everything else on the
            contract — change orders, retainage, revenue earned — can be filled in later
            from the project&apos;s Financials.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Executed contract amount" required>
              <MoneyInput value={executed} onChange={setExecuted} />
            </Field>
            <Field label="Contract date">
              <Input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </Field>
          </div>
          {executed != null && executed !== project.expectedValue ? (
            <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink-soft">
              {executed > project.expectedValue ? "Above" : "Below"} the expected value of{" "}
              {currency(project.expectedValue)} by{" "}
              <span className="font-medium text-ink">
                {currency(Math.abs(executed - project.expectedValue))}
              </span>
              .
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Two minutes now is worth more than an hour of guessing next quarter. This
            feeds the loss analysis — win rate by GC, by system, by bid size, and the
            reasons behind it.
            {gcNames ? ` Bid to ${gcNames}.` : ""}
          </p>

          <Field label={isLoss ? "Who won it?" : "Who decided?"}>
            <Input
              list="known-competitors"
              value={awardedTo}
              onChange={(e) => setAwardedTo(e.target.value)}
              placeholder={isLoss ? "Summit Roofing Systems" : "Owner"}
            />
            <datalist id="known-competitors">
              {knownCompetitors.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          {isLoss ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Their number, if you know it">
                <MoneyInput value={winningAmount} onChange={setWinningAmount} />
              </Field>
              <Field label="Gap">
                <div
                  className={cx(
                    "flex h-[38px] items-center rounded-lg border border-line bg-canvas px-3 text-[13px]",
                    gap == null ? "text-ink-faint" : gap > 0 ? "text-danger-ink" : "text-ok-ink",
                  )}
                >
                  {gap == null
                    ? "—"
                    : gap > 0
                      ? `We were ${currency(gap)} high`
                      : `We were ${currency(Math.abs(gap))} low`}
                </div>
              </Field>
            </div>
          ) : null}

          <Field label="Closest reason">
            <Select value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)}>
              {LOSS_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What actually happened" hint="One or two sentences in your own words.">
            <Textarea
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="They had already done the building next door and the owner did not want two roofers on site."
            />
          </Field>

          <Field
            label="What would you do differently"
            hint="Optional — this is the part that shows up in Analytics months later."
          >
            <Textarea
              rows={2}
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="Get a second panel quote before carrying premium freight."
            />
          </Field>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={rebid}
              onChange={(e) => setRebid(e.target.checked)}
              className="h-3.5 w-3.5 accent-black"
            />
            Worth bidding to this client again
          </label>
        </div>
      )}
    </Modal>
  );
}
