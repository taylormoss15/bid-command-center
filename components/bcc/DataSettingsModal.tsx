"use client";

import { useRef, useState } from "react";

import { useData } from "@/components/providers/DataProvider";
import { IconAlert, IconCheck, IconDownload } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Overlay";
import { Button, cx } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/bcc/format";
import type { Database } from "@/lib/bcc/types";

const CSV_EXPORTS = [
  { entity: "projects", label: "Projects", hint: "Every field, 59 columns" },
  { entity: "recipients", label: "Bid recipients", hint: "One row per GC per project" },
  { entity: "activities", label: "Activity log", hint: "Calls, emails, stage moves" },
  { entity: "organizations", label: "Clients & GCs", hint: "Contacts and relationships" },
];

/**
 * Where the data lives, how to get a copy out, and how to put one back. The
 * storage banner is the important part: it makes it impossible to be running
 * on a throwaway filesystem without knowing it.
 */
export function DataSettingsModal() {
  const {
    db,
    storage,
    dataSettingsOpen,
    setDataSettingsOpen,
    resetData,
    restoreBackup,
    toast,
  } = useData();
  const [pending, setPending] = useState<null | "demo" | "empty" | "restore">(null);
  const [confirming, setConfirming] = useState<null | "demo" | "empty">(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!dataSettingsOpen) return null;

  const durable = storage === "kv";

  const onRestore = async (file: File) => {
    setPending("restore");
    try {
      const parsed = JSON.parse(await file.text()) as Database;
      if (!Array.isArray(parsed.projects)) {
        throw new Error("That file does not look like a backup.");
      }
      await restoreBackup(parsed);
      toast("Backup restored", {
        detail: `${parsed.projects.length} projects loaded.`,
      });
      setDataSettingsOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read that file", {
        tone: "danger",
      });
    } finally {
      setPending(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const run = async (mode: "demo" | "empty") => {
    setPending(mode);
    try {
      await resetData(mode);
      toast(mode === "empty" ? "Everything cleared" : "Demo pipeline rebuilt", {
        detail:
          mode === "empty"
            ? "Add your first real project when you're ready."
            : "Dates regenerated against today.",
      });
      setConfirming(null);
      setDataSettingsOpen(false);
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal
      open
      onClose={() => setDataSettingsOpen(false)}
      title="Data & backup"
      description={
        db ? `${db.projects.length} projects · last write ${formatDateTime(db.updatedAt)}` : undefined
      }
      width="lg"
      footer={
        <Button variant="ghost" onClick={() => setDataSettingsOpen(false)}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <section
          className={cx(
            "flex gap-3 rounded-xl border p-3.5",
            durable ? "border-ok/25 bg-ok-tint" : "border-warn/30 bg-warn-tint",
          )}
        >
          <span
            className={cx(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              durable ? "bg-ok text-white" : "bg-warn text-white",
            )}
          >
            {durable ? <IconCheck size={11} strokeWidth={3} /> : <IconAlert size={11} />}
          </span>
          <div className="min-w-0">
            <p className={cx("text-[13px] font-medium", durable ? "text-ok-ink" : "text-warn-ink")}>
              {durable
                ? "Storage is durable — writes go to the hosted key-value store"
                : storage === "file"
                  ? "Storage is a local file on this machine"
                  : "Checking storage…"}
            </p>
            <p
              className={cx(
                "mt-0.5 text-[12px] leading-relaxed",
                durable ? "text-ok-ink/80" : "text-warn-ink/80",
              )}
            >
              {durable
                ? "Every change is saved immediately and survives redeploys. Still worth pulling a backup now and then."
                : "Fine for local work. On a serverless host this file is wiped on every deploy — connect a KV store before you put real pipeline in here. See DEPLOY.md."}
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
            Back up
          </h3>
          <a
            href="/api/bcc/export?entity=backup"
            className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition hover:border-line-strong hover:bg-canvas"
          >
            <IconDownload size={15} className="shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">
                Download full backup (JSON)
              </span>
              <span className="block text-[11.5px] text-ink-muted">
                The only export that can be restored. Grab one before any reset.
              </span>
            </span>
          </a>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CSV_EXPORTS.map((x) => (
              <a
                key={x.entity}
                href={`/api/bcc/export?entity=${x.entity}`}
                className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 transition hover:border-line-strong hover:bg-canvas"
              >
                <IconDownload size={13} className="shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-ink">{x.label} CSV</span>
                  <span className="block truncate text-[11px] text-ink-muted">{x.hint}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
            Restore
          </h3>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onRestore(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={pending !== null}
            >
              {pending === "restore" ? "Restoring…" : "Restore from a backup file"}
            </Button>
            <p className="text-[11.5px] text-ink-muted">
              Replaces everything currently in the store.
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
            Start over
          </h3>

          {confirming ? (
            <div className="rounded-xl border border-danger/25 bg-danger-tint p-3.5">
              <p className="text-[13px] font-medium text-danger-ink">
                {confirming === "empty"
                  ? "Delete every project, GC, and logged activity?"
                  : "Replace everything with the demo pipeline?"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-danger-ink/80">
                There is no undo. Download a backup first if there is anything here worth
                keeping.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(null)}
                  disabled={pending !== null}
                >
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={() => void run(confirming)}
                  disabled={pending !== null}
                  className="h-8 rounded-lg bg-danger px-3 text-[13px] font-medium text-white transition hover:bg-danger-ink active:scale-[0.98] disabled:opacity-50"
                >
                  {pending
                    ? "Working…"
                    : confirming === "empty"
                      ? "Clear everything"
                      : "Rebuild demo data"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setConfirming("empty")}>
                Clear all data and start real
              </Button>
              <Button variant="ghost" onClick={() => setConfirming("demo")}>
                Rebuild demo pipeline
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
            Clearing gives you an empty board for real work — the demo pipeline will not
            come back on its own.
          </p>
        </section>
      </div>
    </Modal>
  );
}
