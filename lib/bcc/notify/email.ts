import { currency, formatDate, formatDateTime } from "../format";
import { STAGE_MAP } from "../stages";
import type { Digest, DigestBid, DigestItem } from "./digest";
import { projectUrl } from "./digest";
import { DANGER, INK, LINE, MUTED, VOLT, WARN, esc, send } from "./theme";
import type { SendResult } from "./theme";

export type { SendResult } from "./theme";

// ---------------------------------------------------------------------------
// The digest email.
//
// Sent through Resend's REST API — no SDK, same as the Redis client. Every row
// links straight to the project it is about, so the mail is a to-do list you
// can work from a phone rather than a report you have to act on later.
// ---------------------------------------------------------------------------


function row(item: DigestItem, baseUrl: string, accent: string): string {
  const late =
    item.daysLate > 0
      ? `<span style="color:${DANGER};font-weight:600">${item.daysLate} day${item.daysLate === 1 ? "" : "s"} late</span> · `
      : "";
  return `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid ${LINE}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-left:3px solid ${accent};padding-left:12px">
            <a href="${projectUrl(baseUrl, item.projectId)}" style="color:${INK};font-size:15px;font-weight:600;text-decoration:none">${esc(item.name)}</a>
            <div style="color:${MUTED};font-size:13px;margin-top:3px">
              ${esc(item.gc)} · ${currency(item.value)} · ${esc(STAGE_MAP[item.stage as keyof typeof STAGE_MAP]?.label ?? item.stage)}
            </div>
            <div style="color:${INK};font-size:13px;margin-top:5px">
              ${late}${esc(item.reason)}
            </div>
            <div style="color:${MUTED};font-size:12px;margin-top:3px">
              ${item.lastContact ? `Last contact ${formatDate(item.lastContact)}` : "No contact logged"}${item.dueDate ? ` · Due ${formatDate(item.dueDate)}` : ""}
            </div>
          </td>
          <td align="right" valign="top" style="padding-left:12px;white-space:nowrap">
            <a href="${projectUrl(baseUrl, item.projectId)}"
               style="background:${INK};color:#ffffff;font-size:12px;font-weight:600;padding:8px 12px;border-radius:8px;text-decoration:none;display:inline-block">
              Log follow-up
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function section(title: string, note: string, items: DigestItem[], baseUrl: string, accent: string): string {
  if (items.length === 0) return "";
  return `
  <tr><td style="padding:26px 0 6px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${accent}">${esc(title)} · ${items.length}</div>
    <div style="font-size:12.5px;color:${MUTED};margin-top:2px">${esc(note)}</div>
  </td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((i) => row(i, baseUrl, accent)).join("")}</table></td></tr>`;
}

function compactRow(item: DigestItem, baseUrl: string): string {
  const when = item.dueDate ? formatDate(item.dueDate) : "";
  return `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${LINE}">
      <a href="${projectUrl(baseUrl, item.projectId)}" style="color:${INK};font-size:14px;font-weight:600;text-decoration:none">${esc(item.name)}</a>
      <div style="color:${MUTED};font-size:12.5px;margin-top:2px">
        ${esc(item.gc)} · ${currency(item.value)} · ${esc(item.reason)}${when ? ` · ${when}` : ""}
      </div>
    </td>
  </tr>`;
}

function bidRow(bid: DigestBid, baseUrl: string): string {
  const when =
    bid.daysAway === 0 ? "today" : bid.daysAway === 1 ? "tomorrow" : `in ${bid.daysAway} days`;
  return `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${LINE}">
      <a href="${projectUrl(baseUrl, bid.projectId)}" style="color:${INK};font-size:14px;font-weight:600;text-decoration:none">${esc(bid.name)}</a>
      <div style="color:${MUTED};font-size:12.5px;margin-top:2px">
        ${esc(bid.gc)} · ${currency(bid.value)} · due ${when}, ${formatDateTime(bid.dueDate)}
      </div>
    </td>
  </tr>`;
}

export function renderDigestHtml(digest: Digest, baseUrl: string): string {
  const heading = new Date(`${digest.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const actionCount =
    digest.overdue.length + digest.dueToday.length + digest.unscheduled.length;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF9;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

      <tr><td style="padding-bottom:4px">
        <span style="display:inline-block;background:${INK};color:${VOLT};font-size:11px;font-weight:800;letter-spacing:.04em;padding:5px 7px;border-radius:6px">ER</span>
        <span style="color:${MUTED};font-size:12px;margin-left:8px">Bid Command Center</span>
      </td></tr>

      <tr><td style="padding-top:10px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;color:${INK}">${esc(heading)}</div>
        <div style="font-size:14px;color:${MUTED};margin-top:4px">
          ${actionCount === 0
            ? "Nothing overdue and nothing due today."
            : `${actionCount} ${actionCount === 1 ? "opportunity needs" : "opportunities need"} attention — ${currency(digest.totals.actionValue)} of pipeline.`}
        </div>
      </td></tr>

      ${section("Overdue", "The date has passed. These first.", digest.overdue, baseUrl, DANGER)}
      ${section("Due today", "Booked for today.", digest.dueToday, baseUrl, INK)}
      ${section("No next action", "Active opportunities with nothing booked — the quiet way to lose a job.", digest.unscheduled, baseUrl, WARN)}

      ${digest.comingUp.length > 0 ? `
      <tr><td style="padding:26px 0 6px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${INK}">Coming up · ${digest.comingUp.length}</div>
        <div style="font-size:12.5px;color:${MUTED};margin-top:2px">Already booked for the next few days — nothing to do yet.</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${digest.comingUp.map((i) => compactRow(i, baseUrl)).join("")}</table></td></tr>` : ""}

      ${digest.bidsDueSoon.length > 0 ? `
      <tr><td style="padding:26px 0 6px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${INK}">Bids closing this week · ${digest.bidsDueSoon.length}</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${digest.bidsDueSoon.map((b) => bidRow(b, baseUrl)).join("")}</table></td></tr>` : ""}

      <tr><td style="padding-top:26px">
        <a href="${baseUrl}" style="background:${VOLT};color:${INK};font-size:13px;font-weight:700;padding:11px 16px;border-radius:9px;text-decoration:none;display:inline-block">
          Open the Bid Command Center
        </a>
      </td></tr>

      <tr><td style="padding-top:20px;border-top:1px solid ${LINE};margin-top:20px">
        <div style="font-size:11.5px;color:${MUTED};padding-top:14px">
          ${digest.totals.activeCount} active projects. Every link opens straight to the project,
          where you can log what happened and book the next follow-up.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderDigestText(digest: Digest, baseUrl: string): string {
  const lines: string[] = [];
  const heading = new Date(`${digest.today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  lines.push(`Bid Command Center — ${heading}`, "");

  const block = (title: string, items: DigestItem[]) => {
    if (items.length === 0) return;
    lines.push(`${title.toUpperCase()} (${items.length})`);
    for (const i of items) {
      lines.push(
        `- ${i.name} — ${i.gc}, ${currency(i.value)}`,
        `  ${i.daysLate > 0 ? `${i.daysLate} days late. ` : ""}${i.reason}`,
        `  ${projectUrl(baseUrl, i.projectId)}`,
      );
    }
    lines.push("");
  };

  block("Overdue", digest.overdue);
  block("Due today", digest.dueToday);
  block("No next action", digest.unscheduled);

  if (digest.comingUp.length > 0) {
    lines.push(`COMING UP (${digest.comingUp.length})`);
    for (const i of digest.comingUp) {
      lines.push(
        `- ${i.name} — ${i.gc}, ${i.reason}${i.dueDate ? `, ${formatDate(i.dueDate)}` : ""}`,
      );
    }
    lines.push("");
  }

  if (digest.bidsDueSoon.length > 0) {
    lines.push(`BIDS CLOSING THIS WEEK (${digest.bidsDueSoon.length})`);
    for (const b of digest.bidsDueSoon) {
      lines.push(`- ${b.name} — ${b.gc}, due ${formatDateTime(b.dueDate)}`);
    }
    lines.push("");
  }

  lines.push(baseUrl);
  return lines.join("\n");
}

/** Send through Resend. Missing configuration is reported, never thrown. */
export async function sendDigestEmail(
  digest: Digest,
  baseUrl: string,
): Promise<SendResult> {
  const to = process.env.BCC_NOTIFY_EMAIL;
  if (!to) return { sent: false, reason: "BCC_NOTIFY_EMAIL is not set" };

  const actionCount =
    digest.overdue.length + digest.dueToday.length + digest.unscheduled.length;
  const subject =
    actionCount === 0
      ? `Bid follow-ups — nothing due${digest.bidsDueSoon.length ? `, ${digest.bidsDueSoon.length} bids closing` : ""}`
      : `${actionCount} follow-up${actionCount === 1 ? "" : "s"} need you${digest.overdue.length ? ` — ${digest.overdue.length} overdue` : ""}`;

  return send({
    to: to.split(",").map((address) => address.trim()).filter(Boolean),
    subject,
    html: renderDigestHtml(digest, baseUrl),
    text: renderDigestText(digest, baseUrl),
  });
}
