"use client";

import { useState } from "react";

import { useData } from "@/components/providers/DataProvider";
import { IconCheck, IconChat } from "@/components/ui/Icons";
import { cx } from "@/components/ui/primitives";
import { messageFor, nextInCadence } from "@/lib/bcc/cadence";
import type { BidRecipient, Project } from "@/lib/bcc/types";

/**
 * The message for whatever step this bid path is on, ready to paste.
 *
 * Knowing a call is due is only half of it — the reason follow-ups get skipped
 * is not knowing what to say that isn't "any news?". So the words come with
 * the reminder, already addressed and already about the right thing.
 */
export function CadenceMessage({
  project,
  recipient,
  className,
}: {
  project: Project;
  recipient: BidRecipient | null | undefined;
  className?: string;
}) {
  const { db, today, toast } = useData();
  const [copied, setCopied] = useState(false);
  const [short, setShort] = useState(false);

  const plan = nextInCadence(project, recipient, db?.activities ?? [], today);
  const org = recipient
    ? (db?.organizations.find((o) => o.id === recipient.organizationId) ?? null)
    : null;
  const message = messageFor(plan, project, recipient, org);

  if (!message) {
    return (
      <div
        className={cx(
          "rounded-xl border border-line bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted",
          className,
        )}
      >
        {plan.why}
      </div>
    );
  }

  const text = short ? message.short : message.body;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Message copied", { detail: plan.step?.label });
    } catch {
      toast("Could not reach the clipboard — select the text and copy it", {
        tone: "danger",
      });
    }
  };

  return (
    <div className={cx("overflow-hidden rounded-xl border border-line", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-2">
        <IconChat size={12} className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-ink">
            {plan.step?.label}
          </span>
          <span className="block truncate text-[11px] text-ink-muted">
            {short ? "Your one-liner for a GC you already know." : plan.step?.goal}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setShort((v) => !v)}
          className="shrink-0 rounded-md border border-line bg-paper px-2 py-1 text-[11.5px] text-ink-muted transition hover:border-ink hover:text-ink"
        >
          {short ? "Full" : "Short"}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className={cx(
            "shrink-0 rounded-md border px-2 py-1 text-[11.5px] font-medium transition",
            copied
              ? "border-ok bg-ok text-white"
              : "border-line bg-paper text-ink-soft hover:border-ink hover:text-ink",
          )}
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <IconCheck size={10} strokeWidth={3} />
              Copied
            </span>
          ) : (
            "Copy"
          )}
        </button>
      </div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-[12px] leading-relaxed text-ink-soft">
        {text}
      </pre>
      {message.familiar && !short ? (
        <p className="border-t border-line bg-canvas px-3 py-1.5 text-[11px] text-ink-muted">
          You know this GC well — the short version may fit better.
        </p>
      ) : null}
    </div>
  );
}
