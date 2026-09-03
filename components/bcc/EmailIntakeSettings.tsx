"use client";

import { useState } from "react";

import { useData } from "@/components/providers/DataProvider";
import { IconAlert, IconMail, IconTrash } from "@/components/ui/Icons";
import { Button, Chip, cx } from "@/components/ui/primitives";
import { formatDate } from "@/lib/bcc/format";

/**
 * Who may forward mail onto this board.
 *
 * This lives in the data rather than the environment on purpose: standing up a
 * second account should be typing an address into a box, not editing a deploy
 * and waiting for a rebuild.
 */
export function EmailIntakeSettings() {
  const { db, workspace, updateSettings, toast } = useData();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const settings = db?.settings;
  const senders = settings?.approvedSenders ?? [];
  const confirming = settings?.confirmIntake !== false;

  const add = async () => {
    const value = address.trim();
    if (!value) return;
    setBusy("add");
    try {
      await updateSettings({ addSender: { address: value, label: label.trim() || undefined } });
      setAddress("");
      setLabel("");
      toast("Sender approved", {
        detail: `Mail from ${value.toLowerCase()} will land on the ${workspace === "demo" ? "demo" : "live"} board.`,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that sender", {
        tone: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, shown: string) => {
    setBusy(id);
    try {
      await updateSettings({ removeSenderId: id });
      toast("Sender removed", { detail: `${shown} can no longer post here.`, tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const toggleConfirm = async () => {
    setBusy("confirm");
    try {
      await updateSettings({ confirmIntake: !confirming });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
        Email intake
      </h3>

      <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
        Forward a bid invitation and it lands under <strong className="font-medium text-ink-soft">From your inbox</strong>.
        Only these addresses may post to the {workspace === "demo" ? "demo" : "live"} board — anyone
        else is turned away, and the refusal names the address so you know what to add.
      </p>

      {senders.length === 0 ? (
        <div className="mb-3 flex gap-2.5 rounded-xl border border-warn/30 bg-warn-tint p-3">
          <IconAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[12px] leading-relaxed text-warn-ink">
            No approved senders yet, so <strong className="font-medium">every</strong> forwarded
            email lands on the live board. Add the mailboxes you forward from and everything else
            gets refused.
          </p>
        </div>
      ) : (
        <ul className="mb-3 divide-y divide-line-faint overflow-hidden rounded-xl border border-line">
          {senders.map((sender) => (
            <li key={sender.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-muted">
                <IconMail size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium tabular-nums text-ink">
                    {sender.address}
                  </span>
                  {sender.address.startsWith("@") ? <Chip>whole company</Chip> : null}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">
                  {sender.label ? `${sender.label} · ` : ""}
                  {sender.count
                    ? `${sender.count} email${sender.count === 1 ? "" : "s"} landed${sender.lastUsedAt ? `, last ${formatDate(sender.lastUsedAt)}` : ""}`
                    : "nothing received yet"}
                </span>
              </span>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void remove(sender.id, sender.address)}
              >
                <IconTrash size={12} />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="you@company.com, or @company.com"
          className="h-9 min-w-[15rem] flex-1 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-ink"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Whose mailbox (optional)"
          className="h-9 w-[12rem] rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-ink"
        />
        <Button variant="volt" disabled={busy !== null || !address.trim()} onClick={() => void add()}>
          {busy === "add" ? "Adding…" : "Approve sender"}
        </Button>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 transition hover:bg-canvas">
        <input
          type="checkbox"
          checked={confirming}
          disabled={busy !== null}
          onChange={() => void toggleConfirm()}
          className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-ink">
            Reply to confirm what landed
          </span>
          <span className={cx("mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted")}>
            Whoever forwards an email gets a reply saying what was created, what it read out of
            the message, and what is worth checking — so you know it worked without opening the
            app. Goes to the forwarder only, never to the GC.
          </span>
        </span>
      </label>

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
        Addresses set in <code className="text-ink-soft">BCC_INBOUND_SENDERS</code> keep working
        as well, and are checked after these. Plus-tags and dots in a Gmail address are ignored,
        so <code className="text-ink-soft">you+bids@gmail.com</code> matches{" "}
        <code className="text-ink-soft">you@gmail.com</code>.
      </p>
    </section>
  );
}
