import { demoEnabled, type Workspace } from "../auth";
import { newId } from "../store";
import { readDb } from "../store";
import type { ApprovedSender, Database, WorkspaceSettings } from "../types";

import { normalizeSenderPattern, type SenderRule } from "./routing";

// ---------------------------------------------------------------------------
// Approved senders, stored per board.
//
// Deciding where an email goes means asking every board whether it recognises
// the sender, which is why this reads across workspaces rather than sitting
// behind the usual single-workspace call. There are two of them, so that is two
// reads and no index to keep.
//
// Live is asked first: if the same address were somehow approved on both
// boards, real work beats a sandbox.
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: WorkspaceSettings = { approvedSenders: [] };

export function settingsOf(db: Database): WorkspaceSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...db.settings,
    approvedSenders: db.settings?.approvedSenders ?? [],
  };
}

/** The boards that could claim an inbound email. */
export function inboundWorkspaces(): Workspace[] {
  return demoEnabled() ? ["live", "demo"] : ["live"];
}

/** Every approved address on every board, as routing rules. */
export async function storedSenderRules(): Promise<SenderRule[]> {
  const rules: SenderRule[] = [];
  for (const workspace of inboundWorkspaces()) {
    const db = await readDb(workspace);
    for (const sender of settingsOf(db).approvedSenders) {
      const pattern = normalizeSenderPattern(sender.address);
      if (pattern) rules.push({ pattern, workspace });
    }
  }
  return rules;
}

/**
 * Records that an approved address was used, so the settings panel can show
 * which entries are actually carrying mail and which are stale. Called inside
 * the same write as the intake itself.
 */
export function touchSender(db: Database, address: string, at: string): void {
  const canonical = normalizeSenderPattern(address);
  if (!canonical) return;

  const settings = db.settings;
  if (!settings?.approvedSenders) return;

  const domain = canonical.includes("@") ? `@${canonical.split("@").pop()}` : null;
  const match =
    settings.approvedSenders.find((s) => normalizeSenderPattern(s.address) === canonical) ??
    settings.approvedSenders.find((s) => normalizeSenderPattern(s.address) === domain);
  if (!match) return;

  match.lastUsedAt = at;
  match.count = (match.count ?? 0) + 1;
}

/** Cleans one address submitted from the settings panel. */
export function buildApprovedSender(
  address: string,
  label?: string,
): ApprovedSender | null {
  const normalized = normalizeSenderPattern(address);
  if (!normalized) return null;
  return {
    id: newId("snd"),
    address: normalized,
    label: label?.trim() ? label.trim().slice(0, 60) : undefined,
    addedAt: new Date().toISOString(),
    lastUsedAt: null,
    count: 0,
  };
}
