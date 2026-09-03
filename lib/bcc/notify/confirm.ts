import { currency, formatDateTime } from "../format";
import { materialLabel } from "../taxonomy";
import type { Project } from "../types";

import { projectUrl } from "./digest";
import { INK, LINE, MUTED, OK, VOLT, WARN, esc, send } from "./theme";
import type { SendResult } from "./theme";

// ---------------------------------------------------------------------------
// The reply that goes back to whoever forwarded an invitation.
//
// The point of it is to close the loop: you forward an email from your phone,
// and a few seconds later you know whether it landed, what it read out of it,
// and what it wants you to check. Without that you are left wondering, and
// wondering means opening the app to look — which is the trip this was meant
// to save.
//
// It goes to the FORWARDER, never to the GC quoted inside the message.
// ---------------------------------------------------------------------------

export type IntakeOutcomeKind = "created" | "recipient" | "update" | "noted" | "ignored";

export interface IntakeReply {
  kind: IntakeOutcomeKind;
  /** The address that forwarded it. */
  to: string;
  /** The subject of the message they sent. */
  subject: string;
  /** Message-ID of the forward, so the reply threads under it. */
  messageId?: string | null;
  project?: Project | null;
  gc?: string | null;
  /** Existing bid paths on the project, after this email was applied. */
  bidPaths?: number;
  uncertainties?: string[];
  differences?: string[];
  extractedBy?: "claude" | "heuristic";
}

interface Copy {
  headline: string;
  body: string;
  accent: string;
}

function copy(reply: IntakeReply): Copy {
  const gc = reply.gc ?? "the general contractor";
  switch (reply.kind) {
    case "created":
      return {
        headline: "On the board",
        body: "It is waiting under From your inbox. Nothing counts toward your pipeline until you confirm it.",
        accent: OK,
      };
    case "recipient":
      return {
        headline: "Added as another bid path",
        body: `This job was already on the board, so ${gc} was added to it rather than creating a second project. Your unique pipeline has not moved — only the proposal activity.`,
        accent: OK,
      };
    case "update":
      return {
        headline: "Recorded on the bid you already track",
        body: `Nothing new was created. The message is attached to the ${gc} bid path so you can read it in context.`,
        accent: INK,
      };
    case "noted":
      return {
        headline: "Logged on the matching project",
        body: "The email did not name a general contractor, so it was filed as a note on the project rather than a bid path.",
        accent: INK,
      };
    case "ignored":
      return {
        headline: "Not added",
        body: "This did not read as a bid invitation, so nothing was put on the board. If that is wrong, add the project by hand and forward the email again once it exists.",
        accent: WARN,
      };
  }
}

function facts(project: Project): [string, string][] {
  const out: [string, string][] = [["Project", project.code]];
  if (project.city) out.push(["Location", `${project.city}, ${project.state}`]);
  if (project.bidDueDate) out.push(["Bid due", formatDateTime(project.bidDueDate)]);
  out.push([
    "Value",
    project.expectedValue ? currency(project.expectedValue) : "not stated in the email",
  ]);
  if (project.materials.length > 0) {
    out.push(["Systems", project.materials.map(materialLabel).join(", ")]);
  }
  if (project.roofAreaSqFt) {
    out.push(["Roof area", `${project.roofAreaSqFt.toLocaleString()} sq ft`]);
  }
  return out;
}

export function replySubject(reply: IntakeReply): string {
  const name = reply.project?.name ?? reply.subject ?? "your email";
  switch (reply.kind) {
    case "created":
      return `On the board — ${name}`;
    case "recipient":
      return `Added to ${name} — ${reply.gc ?? "another GC"}`;
    case "update":
      return `Noted on ${name}`;
    case "noted":
      return `Logged on ${name}`;
    case "ignored":
      return `Not added — ${reply.subject || "your forwarded email"}`;
  }
}

export function renderReplyHtml(reply: IntakeReply, baseUrl: string): string {
  const { headline, body, accent } = copy(reply);
  const project = reply.project ?? null;
  const link = project ? projectUrl(baseUrl, project.id) : baseUrl;
  const checks = [...(reply.differences ?? []), ...(reply.uncertainties ?? [])];

  const factRows = project
    ? facts(project)
        .map(
          ([label, value]) => `
      <tr>
        <td style="padding:5px 14px 5px 0;color:${MUTED};font-size:13px;white-space:nowrap">${esc(label)}</td>
        <td style="padding:5px 0;color:${INK};font-size:13px;font-weight:600">${esc(value)}</td>
      </tr>`,
        )
        .join("")
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F7F6F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:26px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

      <tr><td style="border-left:3px solid ${accent};padding-left:12px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${accent}">${esc(headline)}</div>
        <div style="font-size:19px;font-weight:700;color:${INK};margin-top:5px;line-height:1.3">${esc(project?.name ?? reply.subject ?? "Your forwarded email")}</div>
        <div style="font-size:13.5px;color:${MUTED};margin-top:7px;line-height:1.55">${esc(body)}</div>
      </td></tr>

      ${
        project
          ? `<tr><td style="padding-top:18px">
        <table role="presentation" cellpadding="0" cellspacing="0">${factRows}</table>
      </td></tr>`
          : ""
      }

      ${
        reply.kind === "recipient" && project
          ? `<tr><td style="padding-top:14px">
        <div style="background:#FAFAF8;border:1px solid ${LINE};border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;color:${INK};font-weight:600">${reply.bidPaths ?? 2} GCs are bidding this job</div>
          <div style="font-size:12.5px;color:${MUTED};margin-top:3px;line-height:1.5">
            ${esc(currency(project.expectedValue))} of unique pipeline, counted once — however many proposals go out.
          </div>
        </div>
      </td></tr>`
          : ""
      }

      ${
        checks.length > 0
          ? `<tr><td style="padding-top:16px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${WARN}">Worth checking</div>
        <ul style="margin:7px 0 0;padding-left:18px;color:${INK};font-size:13px;line-height:1.6">
          ${checks.map((c) => `<li style="margin-bottom:3px">${esc(c)}</li>`).join("")}
        </ul>
      </td></tr>`
          : ""
      }

      <tr><td style="padding-top:22px">
        <a href="${link}" style="background:${VOLT};color:${INK};font-size:13px;font-weight:700;padding:11px 16px;border-radius:9px;text-decoration:none;display:inline-block">
          ${project ? "Open it in Bid Command Center" : "Open Bid Command Center"}
        </a>
      </td></tr>

      <tr><td style="padding-top:20px;border-top:1px solid ${LINE};margin-top:16px">
        <div style="font-size:11.5px;color:${MUTED};line-height:1.55;padding-top:14px">
          Automatic reply to the message you forwarded${reply.subject ? ` — “${esc(reply.subject)}”` : ""}.
          ${reply.extractedBy === "heuristic" ? "Read by simple text matching rather than the AI reader, so check every field." : ""}
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderReplyText(reply: IntakeReply, baseUrl: string): string {
  const { headline, body } = copy(reply);
  const project = reply.project ?? null;
  const checks = [...(reply.differences ?? []), ...(reply.uncertainties ?? [])];

  const lines = [
    headline.toUpperCase(),
    project?.name ?? reply.subject ?? "Your forwarded email",
    "",
    body,
  ];

  if (project) {
    lines.push("");
    for (const [label, value] of facts(project)) lines.push(`${label}: ${value}`);
  }

  if (reply.kind === "recipient" && project) {
    lines.push(
      "",
      `${reply.bidPaths ?? 2} GCs are bidding this job — ${currency(project.expectedValue)} of unique pipeline, counted once.`,
    );
  }

  if (checks.length > 0) {
    lines.push("", "Worth checking:");
    for (const check of checks) lines.push(`  - ${check}`);
  }

  lines.push("", project ? projectUrl(baseUrl, project.id) : baseUrl);
  if (reply.extractedBy === "heuristic") {
    lines.push(
      "",
      "Read by simple text matching rather than the AI reader, so check every field.",
    );
  }
  return lines.join("\n");
}

/**
 * Replies to the forwarder. Threads under their message where the provider
 * gave us a Message-ID, so the confirmation sits with the forward instead of
 * starting a new conversation.
 */
export async function sendIntakeReply(
  reply: IntakeReply,
  baseUrl: string,
): Promise<SendResult> {
  if (!reply.to.includes("@")) return { sent: false, reason: "no address to reply to" };

  const headers = reply.messageId
    ? { "In-Reply-To": reply.messageId, References: reply.messageId }
    : undefined;

  return send({
    to: [reply.to],
    subject: replySubject(reply),
    html: renderReplyHtml(reply, baseUrl),
    text: renderReplyText(reply, baseUrl),
    headers,
  });
}
