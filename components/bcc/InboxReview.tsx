"use client";

import { useMemo, useState } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { IconAlert, IconCheck, IconMail, IconTrash } from "@/components/ui/Icons";
import { Button, Card, Chip, SectionHeader, cx } from "@/components/ui/primitives";
import { currency, formatDateTime } from "@/lib/bcc/format";
import { materialLabel } from "@/lib/bcc/taxonomy";
import type { BidRecipient, Intake, Project } from "@/lib/bcc/types";

/**
 * Everything that arrived by forwarded email and has not been confirmed yet.
 *
 * Three shapes. A new project counts for nothing until it is accepted. A new
 * GC on a project already on the board is a second bid path — it is real, it
 * just wants a look. An update to a bid we already track is a note with the
 * email attached. None of them change a number on their own.
 */
export function InboxReview() {
  const { db, openProject } = useData();
  const recipientsByProject = useRecipientIndex();

  const pendingProjects = useMemo(
    () => (db?.projects ?? []).filter((p) => p.needsReview && p.intake),
    [db?.projects],
  );

  const pendingRecipients = useMemo(() => {
    const projects = new Map((db?.projects ?? []).map((p) => [p.id, p]));
    return (db?.recipients ?? [])
      .filter((r) => r.needsReview && r.intake)
      .map((r) => ({ recipient: r, project: projects.get(r.projectId) }))
      .filter(
        (row): row is { recipient: BidRecipient; project: Project } =>
          Boolean(row.project) && !row.project!.needsReview,
      );
  }, [db?.projects, db?.recipients]);

  const total = pendingProjects.length + pendingRecipients.length;
  if (total === 0) return null;

  return (
    <Card padded={false} className="mb-4 overflow-hidden border-volt-deep/25">
      <div className="flex items-center gap-2.5 border-b border-line bg-volt-tint/50 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-volt">
          <IconMail size={13} />
        </span>
        <SectionHeader
          title="From your inbox"
          hint={`${total} forwarded ${total === 1 ? "email" : "emails"} waiting to be confirmed — new projects here are not counted in pipeline totals yet.`}
          className="flex-1"
        />
      </div>
      <div>
        {pendingProjects.map((project) => (
          <IntakeRow key={project.id} project={project} onOpen={() => openProject(project.id)} />
        ))}
        {pendingRecipients.map(({ recipient, project }) => (
          <RecipientRow
            key={recipient.id}
            recipient={recipient}
            project={project}
            siblings={(recipientsByProject.get(project.id) ?? []).length}
            onOpen={() => openProject(project.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function IntakeRow({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const { updateProject, deleteProject, toast } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();
  const [busy, setBusy] = useState(false);

  const intake = project.intake!;
  const gc = (recipients.get(project.id) ?? [])[0];
  const gcName = gc ? orgs.get(gc.organizationId) : null;

  const accept = async () => {
    setBusy(true);
    try {
      await updateProject(project.id, {
        needsReview: false,
        intake: { ...intake, reviewedAt: new Date().toISOString() },
      });
      toast("Added to the board", {
        detail: `${project.name} is now in Identified.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await deleteProject(project.id);
      toast("Discarded", { detail: project.name, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      intake={intake}
      onOpen={onOpen}
      title={project.name}
      chips={
        <>
          <ConfidenceChip intake={intake} />
          <Chip>new project</Chip>
        </>
      }
      facts={
        <>
          <Fact label="GC">{gcName ?? "—"}</Fact>
          <Fact label="Location">
            {project.city ? `${project.city}, ${project.state}` : "—"}
          </Fact>
          <Fact label="Bid due">
            {project.bidDueDate ? formatDateTime(project.bidDueDate) : "—"}
          </Fact>
          <Fact label="Value">
            {project.expectedValue ? currency(project.expectedValue) : "not stated"}
          </Fact>
          <Fact label="Systems">
            {project.materials.length ? project.materials.map(materialLabel).join(", ") : "—"}
          </Fact>
        </>
      }
      actions={
        <>
          <Button size="xs" variant="danger" onClick={discard} disabled={busy}>
            <IconTrash size={12} />
            Discard
          </Button>
          <Button size="xs" variant="volt" onClick={accept} disabled={busy}>
            <IconCheck size={12} />
            Add to board
          </Button>
        </>
      }
    />
  );
}

/**
 * A bid path that arrived by email on a project already on the board. The
 * project's own numbers are untouched — this row exists so a second GC on a
 * job never appears silently.
 */
function RecipientRow({
  recipient,
  project,
  siblings,
  onOpen,
}: {
  recipient: BidRecipient;
  project: Project;
  siblings: number;
  onOpen: () => void;
}) {
  const { updateRecipient, deleteRecipient, toast } = useData();
  const orgs = useOrgIndex();
  const [busy, setBusy] = useState(false);

  const intake = recipient.intake!;
  const gcName = orgs.get(recipient.organizationId) ?? "Unknown GC";
  const isNewPath = recipient.revisions.length === 0 && !recipient.submittedAmount;

  const accept = async () => {
    setBusy(true);
    try {
      await updateRecipient(recipient.id, {
        needsReview: false,
        intake: { ...intake, reviewedAt: new Date().toISOString() },
      });
      toast("Confirmed", { detail: `${gcName} on ${project.name}.` });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRecipient(recipient.id);
      toast("Bid path removed", { detail: `${gcName} on ${project.name}`, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      intake={intake}
      onOpen={onOpen}
      title={`${gcName} — ${project.name}`}
      chips={
        <>
          <ConfidenceChip intake={intake} />
          <Chip tone="ok">{isNewPath ? "another GC on this job" : "update to this bid"}</Chip>
        </>
      }
      facts={
        <>
          <Fact label="Project">{project.code}</Fact>
          <Fact label="Bid paths">
            {siblings} {siblings === 1 ? "GC" : "GCs"} on this project
          </Fact>
          <Fact label="Unique pipeline">
            {project.expectedValue ? currency(project.expectedValue) : "not stated"}
            <span className="text-ink-faint"> — unchanged</span>
          </Fact>
          <Fact label="Contact">{recipient.contactName ?? "—"}</Fact>
          <Fact label="Bid due">
            {project.bidDueDate ? formatDateTime(project.bidDueDate) : "—"}
          </Fact>
        </>
      }
      actions={
        <>
          {isNewPath ? (
            <Button size="xs" variant="danger" onClick={remove} disabled={busy}>
              <IconTrash size={12} />
              Not us
            </Button>
          ) : null}
          <Button size="xs" variant="volt" onClick={accept} disabled={busy}>
            <IconCheck size={12} />
            Got it
          </Button>
        </>
      }
    />
  );
}

function ConfidenceChip({ intake }: { intake: Intake }) {
  return (
    <>
      <Chip
        tone={
          intake.confidence === "high" ? "ok" : intake.confidence === "medium" ? "neutral" : "warn"
        }
      >
        {intake.confidence} confidence
      </Chip>
      {intake.extractedBy === "heuristic" ? <Chip tone="warn">text matching only</Chip> : null}
    </>
  );
}

/** The shared shell — one layout for every kind of arrival. */
function Row({
  intake,
  title,
  chips,
  facts,
  actions,
  onOpen,
}: {
  intake: Intake;
  title: string;
  chips: React.ReactNode;
  facts: React.ReactNode;
  actions: React.ReactNode;
  onOpen: () => void;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const notes = [...(intake.differences ?? []), ...intake.uncertainties];

  return (
    <div className="border-b border-line-faint px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-ink">{title}</span>
            {chips}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-muted">
            <span className="truncate">{intake.from || "unknown sender"}</span>
            <span>·</span>
            <span>{formatDateTime(intake.receivedAt)}</span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setShowEmail((s) => !s)}>
            {showEmail ? "Hide email" : "Show email"}
          </Button>
          {actions}
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">{facts}</dl>

      {notes.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {notes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-warn-ink"
            >
              <IconAlert size={11} className="mt-0.5 shrink-0" />
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {showEmail ? (
        <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 font-sans text-[11.5px] leading-relaxed text-ink-soft">
          {`Subject: ${intake.subject}\nFrom: ${intake.from}\n\n${intake.body}`}
        </pre>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={cx("text-ink-soft")}>{children}</dd>
    </div>
  );
}
