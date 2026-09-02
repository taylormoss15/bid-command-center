"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  useData,
  useOrgIndex,
  useProjectActivities,
} from "@/components/providers/DataProvider";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  IconChat,
  IconClock,
  IconEdit,
  IconExternal,
  IconMail,
  IconPhone,
  IconPlus,
  IconTrash,
  IconX,
} from "@/components/ui/Icons";
import { ConfirmDialog, SidePanel } from "@/components/ui/Overlay";
import {
  Button,
  Chip,
  EmptyState,
  HealthChip,
  IconButton,
  ProbabilityMeter,
  SignalMark,
  StageChip,
  TrelloLink,
  cx,
} from "@/components/ui/primitives";
import {
  currentContractValue,
  estimatedGrossProfit,
  estimatedMargin,
  followUpHealth,
  isProbabilityOverridden,
  nextFollowUp,
  probabilityOf,
  rawProposalVolume,
  remainingBacklog,
  weightedGrossProfit,
  weightedValue,
} from "@/lib/bcc/calc";
import {
  currency,
  currencyCompact,
  formatDate,
  formatDateTime,
  formatRange,
  percent,
  relativeDays,
} from "@/lib/bcc/format";
import { CONFIRM_STAGES, STAGES, STAGE_MAP } from "@/lib/bcc/stages";
import {
  FOLLOW_UP_TYPES,
  FOLLOW_UP_TYPE_MAP,
  MATERIAL_MAP,
  PROJECT_TYPES,
  SCOPE_FLAG_MAP,
  WORK_TYPES,
} from "@/lib/bcc/taxonomy";
import type { BidRecipient, StageId } from "@/lib/bcc/types";

const TABS = [
  "Overview",
  "GCs & Contacts",
  "Bid History",
  "Activity",
  "Financials",
  "Schedule",
  "Strategy",
  "Outcome",
] as const;
type Tab = (typeof TABS)[number];

export function ProjectPanel() {
  const {
    db,
    today,
    openProjectId,
    openProject,
    openLog,
    setEditProjectId,
    updateProject,
    deleteProject,
    openOutcomeCapture,
    toast,
  } = useData();
  const orgs = useOrgIndex();
  const activities = useProjectActivities(openProjectId);
  const [tab, setTab] = useState<Tab>("Overview");
  const [pendingStage, setPendingStage] = useState<StageId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const project = db?.projects.find((p) => p.id === openProjectId) ?? null;
  const recipients = useMemo(
    () => (db?.recipients ?? []).filter((r) => r.projectId === openProjectId),
    [db?.recipients, openProjectId],
  );

  if (!openProjectId || !project) return null;

  const probability = probabilityOf(project);
  const health = followUpHealth(project, recipients, today);
  const next = nextFollowUp(recipients);

  const applyStage = async (stage: StageId) => {
    await updateProject(project.id, { stage });
    toast(`Moved to ${STAGE_MAP[stage].label}`);
    if (["lost", "cancelled", "no_bid", "contracted"].includes(stage)) {
      openOutcomeCapture({ projectId: project.id, stage });
    }
  };

  const onStageChange = (stage: StageId) => {
    if (CONFIRM_STAGES.includes(stage)) setPendingStage(stage);
    else void applyStage(stage);
  };

  return (
    <SidePanel open onClose={() => openProject(null)} label={project.name}>
      {/* Header */}
      <header className="shrink-0 border-b border-line px-5 pb-3 pt-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
              <span className="tnum font-medium">{project.code}</span>
              <span>·</span>
              <span className="truncate">
                {project.city}
                {project.state ? `, ${project.state}` : ""}
              </span>
              {project.isPublic ? (
                <>
                  <span>·</span>
                  <span>Public</span>
                </>
              ) : null}
            </div>
            <h2 className="mt-0.5 truncate text-[19px] font-semibold tracking-[-0.02em] text-ink">
              {project.name}
            </h2>
          </div>
          <IconButton label="Close panel" onClick={() => openProject(null)}>
            <IconX size={16} />
          </IconButton>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Metric label="Expected value" value={currency(project.expectedValue)} strong />
          <Metric
            label="Probability"
            value={
              <ProbabilityMeter
                value={probability}
                overridden={isProbabilityOverridden(project)}
              />
            }
          />
          <Metric label="Weighted" value={currency(Math.round(weightedValue(project)))} />
          <Metric
            label="Install window"
            value={
              <span className="text-[13px] text-ink">
                {formatRange(project.installStart, project.installEnd)}
              </span>
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-[210px]">
            <Select
              value={project.stage}
              onChange={(e) => onStageChange(e.target.value as StageId)}
              className="h-8 py-1 text-[12.5px]"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {Math.round(s.defaultProbability * 100)}%
                </option>
              ))}
            </Select>
          </div>
          <HealthChip health={health} />
          {next ? (
            <span className="text-[12px] text-ink-muted">
              {FOLLOW_UP_TYPE_MAP[next.type ?? "other"]} · {formatDate(next.date)}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            {project.trelloUrl ? (
              <a
                href={project.trelloUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 text-[13px] font-medium text-ink transition hover:border-line-strong"
              >
                Trello
                <IconExternal size={12} className="text-ink-faint" />
              </a>
            ) : null}
            <Button onClick={() => setEditProjectId(project.id)}>
              <IconEdit size={13} />
              Edit
            </Button>
            <Button variant="volt" onClick={() => openLog({ projectId: project.id })}>
              Log follow-up
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-4 sm:px-5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "relative whitespace-nowrap px-2.5 py-2.5 text-[13px] transition",
              tab === t ? "font-medium text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {t}
            {tab === t ? (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {tab === "Overview" ? (
          <OverviewTab project={project} recipients={recipients} orgs={orgs} activities={activities} />
        ) : null}
        {tab === "GCs & Contacts" ? (
          <RecipientsTab projectId={project.id} recipients={recipients} />
        ) : null}
        {tab === "Bid History" ? <BidHistoryTab recipients={recipients} orgs={orgs} /> : null}
        {tab === "Activity" ? <ActivityTab activities={activities} /> : null}
        {tab === "Financials" ? <FinancialsTab project={project} recipients={recipients} /> : null}
        {tab === "Schedule" ? <ScheduleTab project={project} /> : null}
        {tab === "Strategy" ? <StrategyTab project={project} /> : null}
        {tab === "Outcome" ? <OutcomeTab project={project} /> : null}

        <div className="mt-10 flex items-center justify-between border-t border-line pt-4">
          <p className="text-[11px] text-ink-faint">
            Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
          </p>
          <Button variant="danger" size="xs" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={12} />
            Delete project
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingStage != null}
        title={`Move to ${pendingStage ? STAGE_MAP[pendingStage].label : ""}?`}
        body={pendingStage ? STAGE_MAP[pendingStage].definition : undefined}
        confirmLabel="Move stage"
        tone={pendingStage === "contracted" ? "primary" : "danger"}
        onCancel={() => setPendingStage(null)}
        onConfirm={() => {
          const stage = pendingStage!;
          setPendingStage(null);
          void applyStage(stage);
        }}
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {pendingStage === "contracted"
            ? "This adds the project to contracted backlog. Add the executed contract amount and install dates next."
            : "This removes the project from active pipeline. Record the reason so the loss is worth something."}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project?"
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          openProject(null);
          await deleteProject(project.id);
          toast("Project deleted", { detail: project.name, tone: "danger" });
        }}
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {project.name}, its {recipients.length} bid recipient
          {recipients.length === 1 ? "" : "s"}, and its activity history will be removed. Export
          first if you want a copy.
        </p>
      </ConfirmDialog>
    </SidePanel>
  );
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-faint">{label}</p>
      <div
        className={cx(
          "tnum mt-0.5",
          strong ? "text-[17px] font-semibold tracking-[-0.02em] text-ink" : "text-[13px] text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line-faint py-2 last:border-0">
      <dt className="w-40 shrink-0 text-[12px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function OverviewTab({
  project,
  recipients,
  orgs,
  activities,
}: {
  project: import("@/lib/bcc/types").Project;
  recipients: BidRecipient[];
  orgs: Map<string, string>;
  activities: import("@/lib/bcc/types").Activity[];
}) {
  const latest = activities[0];
  return (
    <>
      {project.description ? (
        <p className="mb-6 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
          {project.description}
        </p>
      ) : null}

      <PanelSection title="At a glance">
        <dl>
          <Row label="Type">
            {PROJECT_TYPES.find((t) => t.id === project.projectType)?.label} ·{" "}
            {WORK_TYPES.find((t) => t.id === project.workType)?.label}
          </Row>
          <Row label="Systems">
            {project.materials.length ? (
              <span className="flex flex-wrap gap-1">
                {project.materials.map((m) => (
                  <Chip key={m}>{MATERIAL_MAP[m]?.label ?? m}</Chip>
                ))}
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Size">
            {project.roofAreaSqFt
              ? `${project.roofAreaSqFt.toLocaleString()} SF · ${Math.round(project.roofAreaSqFt / 100).toLocaleString()} squares`
              : "—"}
            {project.buildings
              ? ` · ${project.buildings} ${project.buildings === 1 ? "building" : "buildings"}`
              : ""}
          </Row>
          <Row label="Address">
            {[project.addressLine, project.city, project.state, project.zip]
              .filter(Boolean)
              .join(", ") || "—"}
          </Row>
          <Row label="Owner / architect">
            {[project.owner, project.architect].filter(Boolean).join(" · ") || "—"}
          </Row>
          <Row label="Estimator">{project.estimator}</Row>
          <Row label="Bid due">
            {project.bidDueDate ? formatDateTime(project.bidDueDate) : "—"}
          </Row>
        </dl>
      </PanelSection>

      <PanelSection title={`Bid recipients (${recipients.length})`}>
        <div className="space-y-1.5">
          {recipients.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {orgs.get(r.organizationId) ?? "GC"}
                </span>
                <span className="block truncate text-[11.5px] text-ink-muted">
                  {r.contactName ?? "No contact"}
                  {r.status ? ` · ${r.status}` : ""}
                </span>
              </span>
              <SignalMark signal={r.signal} />
              <span className="tnum shrink-0 text-[13px] font-medium text-ink">
                {r.submittedAmount ? currency(r.submittedAmount) : "Not submitted"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-muted">
          {currency(rawProposalVolume(recipients))} of proposal activity ·{" "}
          {currency(project.expectedValue)} of unique pipeline value.
        </p>
      </PanelSection>

      {latest ? (
        <PanelSection title="Most recent activity">
          <div className="rounded-lg border border-line bg-canvas p-3">
            <p className="text-[13px] font-medium text-ink">{latest.summary}</p>
            {latest.note ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{latest.note}</p>
            ) : null}
            <p className="mt-1.5 text-[11px] text-ink-faint">{formatDateTime(latest.at)}</p>
          </div>
        </PanelSection>
      ) : null}
    </>
  );
}

function RecipientsTab({
  projectId,
  recipients,
}: {
  projectId: string;
  recipients: BidRecipient[];
}) {
  const { db, updateRecipient, createRecipient, deleteRecipient, openLog, toast } = useData();
  const orgs = useOrgIndex();
  const [adding, setAdding] = useState(false);
  const [newGc, setNewGc] = useState("");
  const [newContact, setNewContact] = useState("");

  const add = async () => {
    if (!newGc.trim()) return;
    const match = (db?.organizations ?? []).find(
      (o) => o.name.toLowerCase() === newGc.trim().toLowerCase(),
    );
    await createRecipient({
      projectId,
      organizationId: match?.id,
      organizationName: match ? undefined : newGc.trim(),
      contactName: newContact.trim() || undefined,
      status: "Invitation received",
    });
    setNewGc("");
    setNewContact("");
    setAdding(false);
    toast("GC added", { detail: "One project, one more bid path — value is still counted once." });
  };

  return (
    <>
      <div className="space-y-3">
        {recipients.map((r) => (
          <article key={r.id} className="rounded-xl border border-line p-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink">
                  {orgs.get(r.organizationId) ?? "GC"}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {r.contactName ?? "No contact recorded"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[12px] text-ink-muted">
                  {r.contactEmail ? (
                    <a href={`mailto:${r.contactEmail}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <IconMail size={12} />
                      {r.contactEmail}
                    </a>
                  ) : null}
                  {r.contactPhone ? (
                    <a href={`tel:${r.contactPhone}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <IconPhone size={12} />
                      {r.contactPhone}
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className="tnum text-[15px] font-semibold text-ink">
                  {r.submittedAmount ? currency(r.submittedAmount) : "—"}
                </p>
                <p className="text-[11px] text-ink-faint">
                  {r.submittedDate ? `Submitted ${formatDate(r.submittedDate)}` : "Not submitted"}
                </p>
              </div>
            </div>

            {r.status ? (
              <p className="mt-2.5 text-[12.5px] text-ink-soft">{r.status}</p>
            ) : null}
            {r.feedback ? (
              <p className="mt-1.5 rounded-lg bg-canvas px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                {r.feedback}
              </p>
            ) : null}
            {r.clarifications ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                <span className="font-medium text-ink-soft">Clarifications: </span>
                {r.clarifications}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-faint pt-2.5">
              <SignalMark signal={r.signal} className="text-[13px]" />
              <span className="text-[12px] text-ink-muted">
                {r.lastContactDate ? `Last contact ${formatDate(r.lastContactDate)}` : "No contact logged"}
              </span>
              {r.waitingOn ? (
                <Chip tone="info">Waiting: {r.waitingOn}</Chip>
              ) : r.nextFollowUpDate ? (
                <Chip tone="neutral">
                  Next {formatDate(r.nextFollowUpDate)}
                  {r.nextFollowUpType ? ` · ${FOLLOW_UP_TYPE_MAP[r.nextFollowUpType]}` : ""}
                </Chip>
              ) : (
                <Chip tone="danger">No next action</Chip>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="xs"
                  onClick={() => openLog({ projectId, recipientId: r.id })}
                >
                  <IconChat size={12} />
                  Log
                </Button>
                <IconButton
                  label="Remove this GC"
                  onClick={async () => {
                    await deleteRecipient(r.id);
                    toast("Bid recipient removed");
                  }}
                >
                  <IconTrash size={13} />
                </IconButton>
              </div>
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <Field label="Next follow-up" hint="Saves as soon as you pick a date.">
                <Input
                  type="date"
                  value={r.nextFollowUpDate ?? ""}
                  onChange={(e) =>
                    void updateRecipient(r.id, {
                      nextFollowUpDate: e.target.value || null,
                    })
                  }
                  className="h-8 py-1 text-[12.5px]"
                />
              </Field>
              <Field label="Follow-up type">
                <Select
                  value={r.nextFollowUpType ?? ""}
                  onChange={(e) =>
                    void updateRecipient(r.id, {
                      nextFollowUpType: (e.target.value || null) as never,
                    })
                  }
                  className="h-8 py-1 text-[12.5px]"
                >
                  <option value="">Not set</option>
                  {FOLLOW_UP_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Recipient status">
                <Input
                  defaultValue={r.status ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (r.status ?? "")) {
                      void updateRecipient(r.id, { status: e.target.value });
                    }
                  }}
                  className="h-8 py-1 text-[12.5px]"
                />
              </Field>
              <Field label="Recipient feedback">
                <Input
                  defaultValue={r.feedback ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (r.feedback ?? "")) {
                      void updateRecipient(r.id, { feedback: e.target.value });
                    }
                  }}
                  className="h-8 py-1 text-[12.5px]"
                />
              </Field>
            </div>
          </article>
        ))}
      </div>

      {adding ? (
        <div className="mt-3 rounded-xl border border-dashed border-line-strong p-3.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="GC / client">
              <Input
                autoFocus
                list="panel-gc-list"
                value={newGc}
                onChange={(e) => setNewGc(e.target.value)}
                placeholder="Layton Construction"
              />
              <datalist id="panel-gc-list">
                {(db?.organizations ?? []).map((o) => (
                  <option key={o.id} value={o.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Contact">
              <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} />
            </Field>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button variant="primary" size="xs" onClick={add} disabled={!newGc.trim()}>
              Add recipient
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" onClick={() => setAdding(true)}>
          <IconPlus size={13} />
          Add another GC
        </Button>
      )}
    </>
  );
}

function BidHistoryTab({
  recipients,
  orgs,
}: {
  recipients: BidRecipient[];
  orgs: Map<string, string>;
}) {
  const rows = recipients.flatMap((r) =>
    r.revisions.map((rev) => ({ rev, org: orgs.get(r.organizationId) ?? "GC" })),
  );
  if (rows.length === 0) {
    return <EmptyState title="No submissions yet" body="Bid revisions appear here once a proposal has been issued." />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-canvas text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <th className="px-3 py-2 font-medium">GC</th>
            <th className="px-3 py-2 font-medium">Rev</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .sort((a, b) => (a.rev.date < b.rev.date ? 1 : -1))
            .map(({ rev, org }) => (
              <tr key={rev.id} className="border-b border-line-faint last:border-0">
                <td className="px-3 py-2 text-ink">{org}</td>
                <td className="px-3 py-2 text-ink-muted">{rev.revision}</td>
                <td className="px-3 py-2 text-ink-muted">{formatDate(rev.date)}</td>
                <td className="tnum px-3 py-2 text-right font-medium text-ink">
                  {currency(rev.amount)}
                </td>
                <td className="px-3 py-2 text-ink-muted">{rev.note ?? "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTab({ activities }: { activities: import("@/lib/bcc/types").Activity[] }) {
  if (activities.length === 0) {
    return <EmptyState title="Nothing logged yet" body="Calls, emails, and stage moves show up here as a readable history." />;
  }
  return (
    <ol className="relative space-y-0 border-l border-line pl-5">
      {activities.map((a) => (
        <li key={a.id} className="relative pb-5 last:pb-0">
          <span
            className={cx(
              "absolute -left-[25px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full ring-4 ring-paper",
              a.kind === "stage_change"
                ? "bg-volt"
                : a.kind === "bid_submitted"
                  ? "bg-ink"
                  : "bg-line-strong",
            )}
          />
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[13px] font-medium text-ink">{a.summary}</p>
            <SignalMark signal={a.signal} className="text-[12px]" />
          </div>
          {a.note ? (
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">{a.note}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-ink-faint">
            {formatDateTime(a.at)}
            {a.author ? ` · ${a.author}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function FinancialsTab({
  project,
  recipients,
}: {
  project: import("@/lib/bcc/types").Project;
  recipients: BidRecipient[];
}) {
  const gp = estimatedGrossProfit(project);
  const ccv = currentContractValue(project);
  return (
    <>
      <PanelSection title="Estimate">
        <dl>
          <Row label="Expected project value">{currency(project.expectedValue)}</Row>
          {project.valueRangeLow != null || project.valueRangeHigh != null ? (
            <Row label="Value range">
              {currencyCompact(project.valueRangeLow)} – {currencyCompact(project.valueRangeHigh)}
            </Row>
          ) : null}
          <Row label="Estimated cost">{currency(project.estimatedCost)}</Row>
          <Row label="Estimated gross profit">{gp == null ? "—" : currency(gp)}</Row>
          <Row label="Estimated gross margin">{percent(estimatedMargin(project), 1)}</Row>
          <Row label="Weighted gross profit">
            {weightedGrossProfit(project) == null
              ? "—"
              : currency(Math.round(weightedGrossProfit(project)!))}
          </Row>
          <Row label="Retainage">
            {project.retainagePct
              ? `${project.retainagePct}% · ${currency((project.expectedValue * project.retainagePct) / 100)}`
              : "—"}
          </Row>
          <Row label="Cash-flow risk">{project.cashFlowRisk ?? "—"}</Row>
        </dl>
      </PanelSection>

      <PanelSection title="Proposal activity">
        <dl>
          <Row label="Bid recipients">{recipients.length}</Row>
          <Row label="Raw proposal volume">{currency(rawProposalVolume(recipients))}</Row>
          <Row label="Unique pipeline value">{currency(project.expectedValue)}</Row>
        </dl>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
          Raw volume measures estimating output. Only the unique value reaches the pipeline
          totals — the same roof cannot be won twice.
        </p>
      </PanelSection>

      {project.contract ? (
        <PanelSection title="Contract">
          <dl>
            <Row label="Executed contract">{currency(project.contract.executedValue)}</Row>
            <Row label="Approved change orders">{currency(project.contract.changeOrders)}</Row>
            <Row label="Current contract value">{currency(ccv)}</Row>
            <Row label="Revenue earned to date">{currency(project.contract.revenueEarned)}</Row>
            <Row label="Remaining backlog">{currency(remainingBacklog(project))}</Row>
            <Row label="Contract date">{formatDate(project.contract.contractDate)}</Row>
            <Row label="Bond">
              {project.contract.bondIncluded
                ? `Included · ${currency(project.contract.bondCost)}`
                : "Not required"}
            </Row>
          </dl>
        </PanelSection>
      ) : null}
    </>
  );
}

function ScheduleTab({ project }: { project: import("@/lib/bcc/types").Project }) {
  return (
    <dl>
      <Row label="Invitation received">{formatDate(project.invitationDate)}</Row>
      <Row label="Site walk / pre-bid">{formatDate(project.siteWalkDate)}</Row>
      <Row label="RFI deadline">{formatDate(project.rfiDeadline)}</Row>
      <Row label="Bid due">{formatDateTime(project.bidDueDate)}</Row>
      <Row label="Bid submitted">{formatDate(project.bidSubmittedDate)}</Row>
      <Row label="Original anticipated award">{formatDate(project.originalAwardDate)}</Row>
      <Row label="Current anticipated award">{formatDate(project.anticipatedAwardDate)}</Row>
      <Row label="Expected contract">{formatDate(project.expectedContractDate)}</Row>
      <Row label="Install window">{formatRange(project.installStart, project.installEnd)}</Row>
      <Row label="Date confidence">
        <Chip tone={project.dateConfidence === "firm" ? "ok" : project.dateConfidence === "unknown" ? "outline" : "neutral"}>
          {project.dateConfidence}
        </Chip>
      </Row>
      <Row label="Last activity">
        {project.lastActivityDate ? formatDate(project.lastActivityDate) : "—"}
      </Row>
      <Row label="Scope flags">
        {project.scopeFlags.length ? (
          <span className="flex flex-wrap gap-1">
            {project.scopeFlags.map((f) => (
              <Chip key={f}>{SCOPE_FLAG_MAP[f] ?? f}</Chip>
            ))}
          </span>
        ) : (
          "—"
        )}
      </Row>
    </dl>
  );
}

function StrategyTab({ project }: { project: import("@/lib/bcc/types").Project }) {
  return (
    <>
      <PanelSection title="Position">
        <dl>
          <Row label="Relationship">{project.relationship ?? "—"}</Row>
          <Row label="Competition">{project.competition ?? "—"}</Row>
          <Row label="Known competitors">
            {project.competitors?.length ? project.competitors.join(", ") : "—"}
          </Row>
          <Row label="Pricing position">{project.pricingPosition ?? "—"}</Row>
          <Row label="Strategic priority">{project.priority ?? "—"}</Row>
          <Row label="Project fit score">{project.fitScore != null ? `${project.fitScore}/10` : "—"}</Row>
          <Row label="Readiness">
            <span className="flex flex-wrap gap-1">
              <Chip tone={project.scopeCompared ? "ok" : "outline"}>Scope compared</Chip>
              <Chip tone={project.bidLeveled ? "ok" : "outline"}>Bid leveled</Chip>
              <Chip tone={project.pricingCurrent ? "ok" : "outline"}>Pricing current</Chip>
            </span>
          </Row>
        </dl>
      </PanelSection>

      {project.winReason ? (
        <PanelSection title="Why Elite wins this">
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-soft">{project.winReason}</p>
        </PanelSection>
      ) : null}
      {project.primaryRisk ? (
        <PanelSection title="Primary risk">
          <p className="max-w-2xl rounded-lg border border-warn/20 bg-warn-tint px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink">
            {project.primaryRisk}
          </p>
        </PanelSection>
      ) : null}
      {project.valueEngineering ? (
        <PanelSection title="Value engineering">
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            {project.valueEngineering}
          </p>
        </PanelSection>
      ) : null}
    </>
  );
}

function OutcomeTab({ project }: { project: import("@/lib/bcc/types").Project }) {
  if (!project.outcome) {
    return (
      <EmptyState
        title="Still open"
        body="Once this project is won, lost, cancelled, or declined, the outcome and what it taught us live here."
        icon={<IconClock size={22} />}
      />
    );
  }
  const o = project.outcome;
  return (
    <dl>
      <Row label="Outcome">
        <Chip tone={o.result === "won" ? "ok" : o.result === "lost" ? "danger" : "outline"}>
          {o.result.replace("_", " ")}
        </Chip>
      </Row>
      <Row label="Date">{formatDate(o.date)}</Row>
      <Row label="Awarded to">{o.awardedTo ?? "—"}</Row>
      <Row label="Winning amount">{currency(o.winningAmount)}</Row>
      <Row label="Difference from winner">
        {o.winningAmount ? currency(project.expectedValue - o.winningAmount) : "—"}
      </Row>
      <Row label="Reason">{o.reason || "—"}</Row>
      <Row label="Lessons learned">{o.lessons || "—"}</Row>
      <Row label="Eligible for rebid">{o.eligibleForRebid ? "Yes" : "No"}</Row>
    </dl>
  );
}
