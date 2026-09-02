"use client";

import { useMemo, useState } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { IconAlert, IconCheck, IconMail, IconTrash } from "@/components/ui/Icons";
import { Button, Card, Chip, SectionHeader, cx } from "@/components/ui/primitives";
import { currency, formatDate, formatDateTime } from "@/lib/bcc/format";
import { materialLabel } from "@/lib/bcc/taxonomy";
import type { Project } from "@/lib/bcc/types";

/**
 * Everything that arrived by forwarded email and has not been confirmed yet.
 * Nothing here counts toward pipeline totals until Taylor accepts it — an
 * extraction is a draft, not a decision.
 */
export function InboxReview() {
  const { db, openProject } = useData();

  const pending = useMemo(
    () => (db?.projects ?? []).filter((p) => p.needsReview && p.intake),
    [db?.projects],
  );

  if (pending.length === 0) return null;

  return (
    <Card padded={false} className="mb-4 overflow-hidden border-volt-deep/25">
      <div className="flex items-center gap-2.5 border-b border-line bg-volt-tint/50 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-volt">
          <IconMail size={13} />
        </span>
        <SectionHeader
          title="From your inbox"
          hint={`${pending.length} forwarded ${pending.length === 1 ? "invitation" : "invitations"} waiting to be confirmed — not counted in pipeline totals yet.`}
          className="flex-1"
        />
      </div>
      <div>
        {pending.map((project) => (
          <IntakeRow key={project.id} project={project} onOpen={() => openProject(project.id)} />
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
  const [showEmail, setShowEmail] = useState(false);

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
    <div className="border-b border-line-faint px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-medium text-ink">{project.name}</span>
            <Chip
              tone={
                intake.confidence === "high"
                  ? "ok"
                  : intake.confidence === "medium"
                    ? "neutral"
                    : "warn"
              }
            >
              {intake.confidence} confidence
            </Chip>
            {intake.extractedBy === "heuristic" ? (
              <Chip tone="warn">text matching only</Chip>
            ) : null}
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
          <Button size="xs" variant="danger" onClick={discard} disabled={busy}>
            <IconTrash size={12} />
            Discard
          </Button>
          <Button size="xs" variant="volt" onClick={accept} disabled={busy}>
            <IconCheck size={12} />
            Add to board
          </Button>
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
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
      </dl>

      {intake.uncertainties.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {intake.uncertainties.map((note) => (
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
