"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useData } from "@/components/providers/DataProvider";
import {
  Field,
  Input,
  MoneyInput,
  MultiSelect,
  PercentInput,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/Field";
import { IconChevronDown } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { currency, percent } from "@/lib/bcc/format";
import { STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import {
  DATE_CONFIDENCE,
  ESTIMATORS,
  MANUFACTURERS,
  MATERIALS,
  PROJECT_TYPES,
  SCOPE_FLAGS,
  WORK_TYPES,
} from "@/lib/bcc/taxonomy";
import type { Project, StageId } from "@/lib/bcc/types";

function Section({
  title,
  hint,
  children,
  defaultOpen,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section className="overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-canvas px-3.5 py-2.5 text-left transition hover:bg-sunken"
      >
        <IconChevronDown
          size={14}
          className={cx("shrink-0 text-ink-faint transition-transform", !open && "-rotate-90")}
        />
        <span className="text-[13px] font-medium text-ink">{title}</span>
        {hint ? <span className="truncate text-[11.5px] text-ink-muted">· {hint}</span> : null}
      </button>
      {open ? <div className="space-y-3 border-t border-line p-3.5">{children}</div> : null}
    </section>
  );
}

/** Full add/edit. Sixty fields exist; they are never all on screen at once. */
export function EditProjectModal() {
  const { db, editProjectId, setEditProjectId, updateProject, toast } = useData();
  const project = db?.projects.find((p) => p.id === editProjectId) ?? null;
  const [draft, setDraft] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(project ? structuredClone(project) : null);
  }, [project]);

  const margin = useMemo(() => {
    if (!draft || draft.estimatedCost == null || !draft.expectedValue) return null;
    return (draft.expectedValue - draft.estimatedCost) / draft.expectedValue;
  }, [draft]);

  if (!editProjectId || !draft) return null;

  const set = <K extends keyof Project>(key: K, value: Project[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    setBusy(true);
    try {
      const { id, createdAt, ...patch } = draft;
      await updateProject(id, patch);
      setEditProjectId(null);
      toast("Project updated", { detail: draft.name });
    } catch {
      // handled upstream
    } finally {
      setBusy(false);
    }
  };

  const stageDefault = Math.round(STAGE_MAP[draft.stage].defaultProbability * 100);

  return (
    <Modal
      open
      onClose={() => setEditProjectId(null)}
      title="Edit project"
      description={draft.code}
      width="xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => setEditProjectId(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Section title="Identity & location" defaultOpen>
          <Field label="Project name" required>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Brief scope description">
            <Textarea
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project ID">
              <Input value={draft.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            <Field label="Street address">
              <Input
                value={draft.addressLine ?? ""}
                onChange={(e) => set("addressLine", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_80px_120px]">
            <Field label="City">
              <Input value={draft.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State">
              <Input
                maxLength={2}
                value={draft.state}
                onChange={(e) => set("state", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="ZIP">
              <Input value={draft.zip ?? ""} onChange={(e) => set("zip", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Project type">
              <Select
                value={draft.projectType}
                onChange={(e) => set("projectType", e.target.value as Project["projectType"])}
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Work type">
              <Select
                value={draft.workType}
                onChange={(e) => set("workType", e.target.value as Project["workType"])}
              >
                {WORK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Public / private">
              <div className="pt-2">
                <Toggle
                  checked={Boolean(draft.isPublic)}
                  onChange={(v) => set("isPublic", v)}
                  label={draft.isPublic ? "Public project" : "Private project"}
                />
              </div>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner / developer">
              <Input value={draft.owner ?? ""} onChange={(e) => set("owner", e.target.value)} />
            </Field>
            <Field label="Architect">
              <Input value={draft.architect ?? ""} onChange={(e) => set("architect", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source of opportunity">
              <Input value={draft.source ?? ""} onChange={(e) => set("source", e.target.value)} />
            </Field>
            <Field label="Estimator / owner inside Elite">
              <Select value={draft.estimator} onChange={(e) => set("estimator", e.target.value)}>
                {ESTIMATORS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trello URL">
              <Input
                value={draft.trelloUrl ?? ""}
                onChange={(e) => set("trelloUrl", e.target.value || null)}
                placeholder="https://trello.com/c/…"
              />
            </Field>
            <Field label="Bid platform URL">
              <Input
                value={draft.bidPlatformUrl ?? ""}
                onChange={(e) => set("bidPlatformUrl", e.target.value || null)}
                placeholder="https://app.buildingconnected.com/…"
              />
            </Field>
          </div>
        </Section>

        <Section title="Roofing scope" hint={`${draft.materials.length} systems`}>
          <Field label="Roofing systems">
            <MultiSelect
              options={MATERIALS.map((m) => ({ id: m.id, label: m.label }))}
              value={draft.materials}
              onChange={(v) => set("materials", v)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manufacturer / specification">
              <Input
                list="manufacturers"
                value={draft.manufacturer ?? ""}
                onChange={(e) => set("manufacturer", e.target.value)}
              />
              <datalist id="manufacturers">
                {MANUFACTURERS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Warranty type and term">
              <Input
                value={draft.warranty ?? ""}
                onChange={(e) => set("warranty", e.target.value)}
                placeholder="20-year NDL"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Roof area (SF)">
              <Input
                inputMode="numeric"
                value={draft.roofAreaSqFt ?? ""}
                onChange={(e) =>
                  set("roofAreaSqFt", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)
                }
              />
            </Field>
            <Field label="Squares">
              <Input
                disabled
                value={draft.roofAreaSqFt ? Math.round(draft.roofAreaSqFt / 100) : ""}
                className="bg-canvas text-ink-muted"
              />
            </Field>
            <Field label="Buildings">
              <Input
                inputMode="numeric"
                value={draft.buildings ?? ""}
                onChange={(e) =>
                  set("buildings", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)
                }
              />
            </Field>
            <Field label="Stories">
              <Input
                inputMode="numeric"
                value={draft.stories ?? ""}
                onChange={(e) =>
                  set("stories", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)
                }
              />
            </Field>
          </div>
          <Field label="Special scope flags">
            <MultiSelect
              options={SCOPE_FLAGS}
              value={draft.scopeFlags}
              onChange={(v) => set("scopeFlags", v)}
            />
          </Field>
        </Section>

        <Section title="Dates & timing">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Invitation received">
              <Input type="date" value={draft.invitationDate ?? ""} onChange={(e) => set("invitationDate", e.target.value || null)} />
            </Field>
            <Field label="Site walk / pre-bid">
              <Input type="date" value={draft.siteWalkDate ?? ""} onChange={(e) => set("siteWalkDate", e.target.value || null)} />
            </Field>
            <Field label="RFI deadline">
              <Input type="date" value={draft.rfiDeadline ?? ""} onChange={(e) => set("rfiDeadline", e.target.value || null)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bid due date">
              <Input
                type="date"
                value={(draft.bidDueDate ?? "").slice(0, 10)}
                onChange={(e) => {
                  const time = (draft.bidDueDate ?? "").slice(11, 16) || "14:00";
                  set("bidDueDate", e.target.value ? `${e.target.value}T${time}` : null);
                }}
              />
            </Field>
            <Field label="Bid due time">
              <Input
                type="time"
                value={(draft.bidDueDate ?? "").slice(11, 16)}
                onChange={(e) => {
                  const date = (draft.bidDueDate ?? "").slice(0, 10);
                  if (date) set("bidDueDate", `${date}T${e.target.value || "14:00"}`);
                }}
              />
            </Field>
            <Field label="Bid submitted">
              <Input type="date" value={draft.bidSubmittedDate ?? ""} onChange={(e) => set("bidSubmittedDate", e.target.value || null)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Original anticipated award">
              <Input type="date" value={draft.originalAwardDate ?? ""} onChange={(e) => set("originalAwardDate", e.target.value || null)} />
            </Field>
            <Field label="Current anticipated award">
              <Input type="date" value={draft.anticipatedAwardDate ?? ""} onChange={(e) => set("anticipatedAwardDate", e.target.value || null)} />
            </Field>
            <Field label="Expected contract date">
              <Input type="date" value={draft.expectedContractDate ?? ""} onChange={(e) => set("expectedContractDate", e.target.value || null)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Install start">
              <Input type="date" value={draft.installStart ?? ""} onChange={(e) => set("installStart", e.target.value || null)} />
            </Field>
            <Field label="Install end">
              <Input type="date" value={draft.installEnd ?? ""} onChange={(e) => set("installEnd", e.target.value || null)} />
            </Field>
            <Field label="Date confidence" hint="Drives the dashed edges on the forecast.">
              <Select
                value={draft.dateConfidence}
                onChange={(e) => set("dateConfidence", e.target.value as Project["dateConfidence"])}
              >
                {DATE_CONFIDENCE.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section
          title="Bid & financial"
          hint={margin != null ? `${percent(margin, 1)} estimated margin` : undefined}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Expected project value" hint="Counted once, whatever the GC count.">
              <MoneyInput value={draft.expectedValue} onChange={(v) => set("expectedValue", v ?? 0)} />
            </Field>
            <Field label="Range low" hint="Optional — for genuinely uncertain scope.">
              <MoneyInput value={draft.valueRangeLow} onChange={(v) => set("valueRangeLow", v)} />
            </Field>
            <Field label="Range high">
              <MoneyInput value={draft.valueRangeHigh} onChange={(v) => set("valueRangeHigh", v)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Estimated cost">
              <MoneyInput value={draft.estimatedCost} onChange={(v) => set("estimatedCost", v)} />
            </Field>
            <Field label="Estimated gross profit">
              <Input
                disabled
                className="bg-canvas text-ink-muted"
                value={
                  draft.estimatedCost != null
                    ? currency(draft.expectedValue - draft.estimatedCost)
                    : "—"
                }
              />
            </Field>
            <Field label="Estimated gross margin">
              <Input
                disabled
                className="bg-canvas text-ink-muted"
                value={margin != null ? percent(margin, 1) : "—"}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Retainage %">
              <Input
                inputMode="numeric"
                value={draft.retainagePct ?? ""}
                onChange={(e) =>
                  set("retainagePct", e.target.value ? Number(e.target.value.replace(/[^0-9.]/g, "")) : null)
                }
              />
            </Field>
            <Field label="Estimated retainage">
              <Input
                disabled
                className="bg-canvas text-ink-muted"
                value={
                  draft.retainagePct
                    ? currency((draft.expectedValue * draft.retainagePct) / 100)
                    : "—"
                }
              />
            </Field>
            <Field label="Cash-flow risk">
              <Select
                value={draft.cashFlowRisk ?? "low"}
                onChange={(e) => set("cashFlowRisk", e.target.value as Project["cashFlowRisk"])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Sales intelligence">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pipeline stage">
              <Select value={draft.stage} onChange={(e) => set("stage", e.target.value as StageId)}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {Math.round(s.defaultProbability * 100)}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Win probability override"
              hint={`Blank uses the ${stageDefault}% stage default.`}
            >
              <PercentInput
                value={draft.probabilityOverride}
                onChange={(v) => set("probabilityOverride", v)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Relationship">
              <Select
                value={draft.relationship ?? "new"}
                onChange={(e) => set("relationship", e.target.value as Project["relationship"])}
              >
                <option value="new">New</option>
                <option value="developing">Developing</option>
                <option value="strong">Strong</option>
                <option value="preferred">Preferred</option>
              </Select>
            </Field>
            <Field label="Competition">
              <Select
                value={draft.competition ?? "unknown"}
                onChange={(e) => set("competition", e.target.value as Project["competition"])}
              >
                <option value="unknown">Unknown</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <Field label="Pricing position">
              <Select
                value={draft.pricingPosition ?? "unknown"}
                onChange={(e) => set("pricingPosition", e.target.value as Project["pricingPosition"])}
              >
                <option value="unknown">Unknown</option>
                <option value="low">Low</option>
                <option value="competitive">Competitive</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={draft.priority ?? "normal"}
                onChange={(e) => set("priority", e.target.value as Project["priority"])}
              >
                <option value="must_win">Must win</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </Field>
          </div>
          <Field label="Known competitors" hint="Comma separated.">
            <Input
              value={(draft.competitors ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "competitors",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Scope comparison complete">
              <div className="pt-2">
                <Toggle checked={Boolean(draft.scopeCompared)} onChange={(v) => set("scopeCompared", v)} label="Complete" />
              </div>
            </Field>
            <Field label="Bid leveled">
              <div className="pt-2">
                <Toggle checked={Boolean(draft.bidLeveled)} onChange={(v) => set("bidLeveled", v)} label="Leveled" />
              </div>
            </Field>
            <Field label="Pricing confirmed current">
              <div className="pt-2">
                <Toggle checked={Boolean(draft.pricingCurrent)} onChange={(v) => set("pricingCurrent", v)} label="Current" />
              </div>
            </Field>
          </div>
          <Field label="Why Elite wins this">
            <Textarea rows={2} value={draft.winReason ?? ""} onChange={(e) => set("winReason", e.target.value)} />
          </Field>
          <Field label="Primary risk to winning">
            <Textarea rows={2} value={draft.primaryRisk ?? ""} onChange={(e) => set("primaryRisk", e.target.value)} />
          </Field>
          <Field label="Value-engineering opportunity">
            <Textarea rows={2} value={draft.valueEngineering ?? ""} onChange={(e) => set("valueEngineering", e.target.value)} />
          </Field>
        </Section>

        <Section
          title="Contract"
          hint={draft.contract ? currency(draft.contract.executedValue) : "Not contracted"}
        >
          {draft.contract ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Executed contract">
                  <MoneyInput
                    value={draft.contract.executedValue}
                    onChange={(v) =>
                      set("contract", { ...draft.contract!, executedValue: v ?? 0 })
                    }
                  />
                </Field>
                <Field label="Approved change orders">
                  <MoneyInput
                    value={draft.contract.changeOrders}
                    onChange={(v) => set("contract", { ...draft.contract!, changeOrders: v ?? 0 })}
                  />
                </Field>
                <Field label="Revenue earned to date">
                  <MoneyInput
                    value={draft.contract.revenueEarned}
                    onChange={(v) => set("contract", { ...draft.contract!, revenueEarned: v ?? 0 })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Contract date">
                  <Input
                    type="date"
                    value={draft.contract.contractDate ?? ""}
                    onChange={(e) =>
                      set("contract", { ...draft.contract!, contractDate: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="Retainage %">
                  <Input
                    inputMode="numeric"
                    value={draft.contract.retainagePct}
                    onChange={(e) =>
                      set("contract", {
                        ...draft.contract!,
                        retainagePct: Number(e.target.value.replace(/[^0-9.]/g, "") || 0),
                      })
                    }
                  />
                </Field>
                <Field label="Bond cost">
                  <MoneyInput
                    value={draft.contract.bondCost}
                    onChange={(v) =>
                      set("contract", { ...draft.contract!, bondCost: v, bondIncluded: v != null })
                    }
                  />
                </Field>
              </div>
              <Button variant="danger" onClick={() => set("contract", null)}>
                Remove contract record
              </Button>
            </>
          ) : (
            <Button
              onClick={() =>
                set("contract", {
                  executedValue: draft.expectedValue,
                  changeOrders: 0,
                  revenueEarned: 0,
                  retainagePct: draft.retainagePct ?? 5,
                  contractDate: null,
                  bondIncluded: false,
                  bondCost: null,
                })
              }
            >
              Add contract details
            </Button>
          )}
        </Section>

        <Section title="Outcome & learning" hint={draft.outcome?.result ?? "Open"}>
          {draft.outcome ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Outcome">
                  <Select
                    value={draft.outcome.result}
                    onChange={(e) =>
                      set("outcome", { ...draft.outcome!, result: e.target.value as never })
                    }
                  >
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="postponed">Postponed</option>
                    <option value="no_bid">No bid</option>
                  </Select>
                </Field>
                <Field label="Date">
                  <Input
                    type="date"
                    value={draft.outcome.date ?? ""}
                    onChange={(e) => set("outcome", { ...draft.outcome!, date: e.target.value || null })}
                  />
                </Field>
                <Field label="Awarded to">
                  <Input
                    value={draft.outcome.awardedTo ?? ""}
                    onChange={(e) => set("outcome", { ...draft.outcome!, awardedTo: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Winning amount, if known">
                  <MoneyInput
                    value={draft.outcome.winningAmount}
                    onChange={(v) => set("outcome", { ...draft.outcome!, winningAmount: v })}
                  />
                </Field>
                <Field label="Difference from winner">
                  <Input
                    disabled
                    className="bg-canvas text-ink-muted"
                    value={
                      draft.outcome.winningAmount
                        ? currency(draft.expectedValue - draft.outcome.winningAmount)
                        : "—"
                    }
                  />
                </Field>
              </div>
              <Field label="Win / loss reason">
                <Textarea
                  rows={2}
                  value={draft.outcome.reason ?? ""}
                  onChange={(e) => set("outcome", { ...draft.outcome!, reason: e.target.value })}
                />
              </Field>
              <Field label="Lessons learned">
                <Textarea
                  rows={2}
                  value={draft.outcome.lessons ?? ""}
                  onChange={(e) => set("outcome", { ...draft.outcome!, lessons: e.target.value })}
                />
              </Field>
              <Toggle
                checked={Boolean(draft.outcome.eligibleForRebid)}
                onChange={(v) => set("outcome", { ...draft.outcome!, eligibleForRebid: v })}
                label="Eligible for rebid"
              />
            </>
          ) : (
            <Button
              onClick={() =>
                set("outcome", {
                  result: "lost",
                  date: new Date().toISOString().slice(0, 10),
                  reason: "",
                })
              }
            >
              Record an outcome
            </Button>
          )}
        </Section>
      </div>
    </Modal>
  );
}
