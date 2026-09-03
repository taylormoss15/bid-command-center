/**
 * Cloudflare Email Worker — bids@yourdomain.com → Bid Command Center.
 *
 * Cloudflare Email Routing can hand a message to a Worker instead of a
 * mailbox. This Worker reads the message, posts it to the app's inbound
 * endpoint, and — importantly — forwards a copy to a real mailbox either way.
 * If the app is down, mid-deploy, or refuses the sender, the invitation still
 * lands in an inbox. Nothing is ever swallowed.
 *
 * Two secrets, set with `wrangler secret put` or in the dashboard:
 *
 *   BCC_URL       https://bidcommandcenter.com/api/bcc/inbound
 *   BCC_TOKEN     the same value as BCC_INBOUND_SECRET on the app
 *
 * One optional plain variable:
 *
 *   FORWARD_TO    a verified destination address to copy every message to
 */

export default {
  async email(message, env, ctx) {
    // Forward first. A copy in a real inbox is the safety net, so it must not
    // depend on the API call succeeding.
    if (env.FORWARD_TO) {
      ctx.waitUntil(
        message.forward(env.FORWARD_TO).catch((error) => {
          console.error("forward failed", error);
        }),
      );
    }

    if (!env.BCC_URL || !env.BCC_TOKEN) {
      console.error("BCC_URL or BCC_TOKEN is not set — nothing was posted");
      return;
    }

    const raw = await streamToString(message.raw, message.rawSize);
    const parsed = parseMessage(raw);

    const payload = {
      // The plain `{from, to, subject, text}` shape the endpoint recognises.
      from: message.headers.get("from") || message.from,
      to: message.headers.get("to") || message.to,
      subject: message.headers.get("subject") || "",
      text: parsed.text,
      html: parsed.html,
      date: message.headers.get("date") || new Date().toISOString(),
      // Lets the app's confirmation reply thread with the forward.
      "message-id": message.headers.get("message-id") || "",
    };

    try {
      const response = await fetch(env.BCC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bcc-token": env.BCC_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      const body = await response.text();
      if (!response.ok) {
        console.error(`bid command center returned ${response.status}: ${body}`);
        return;
      }
      console.log(`bid command center: ${body}`);
    } catch (error) {
      console.error("could not reach bid command center", error);
    }
  },
};

async function streamToString(stream, size) {
  // Guard against a giant attachment: the useful details are in the body.
  const cap = Math.min(size ?? 1_000_000, 1_500_000);
  const reader = stream.getReader();
  const chunks = [];
  let read = 0;

  while (read < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    read += value.length;
  }
  reader.releaseLock();

  const joined = new Uint8Array(read);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(joined);
}

/**
 * Enough MIME handling for a forwarded invitation: find the first text/plain
 * part, fall back to the first text/html part, and decode quoted-printable
 * and base64 bodies. The app does the HTML→text conversion if only HTML came
 * through, so this deliberately stops at "give it the body".
 */
export function parseMessage(raw) {
  const parts = splitParts(raw);

  const plain = parts.find((p) => p.type.startsWith("text/plain"));
  const html = parts.find((p) => p.type.startsWith("text/html"));

  return {
    text: plain ? plain.body : "",
    html: html ? html.body : "",
  };
}

function splitParts(raw) {
  const { headers, body } = splitHeaders(raw);
  const contentType = headers["content-type"] || "text/plain";
  const boundary = /boundary="?([^";\s]+)"?/i.exec(contentType)?.[1];

  if (!boundary) {
    return [
      {
        type: contentType,
        body: decodeBody(body, headers["content-transfer-encoding"], contentType),
      },
    ];
  }

  const out = [];
  for (const chunk of body.split(`--${boundary}`)) {
    const trimmed = chunk.replace(/^\r?\n/, "");
    if (!trimmed || trimmed.startsWith("--")) continue;

    const inner = splitHeaders(trimmed);
    const innerType = inner.headers["content-type"] || "text/plain";

    if (/^multipart\//i.test(innerType)) {
      out.push(...splitParts(trimmed));
      continue;
    }
    out.push({
      type: innerType.toLowerCase(),
      body: decodeBody(
        inner.body,
        inner.headers["content-transfer-encoding"],
        innerType,
      ),
    });
  }
  return out;
}

function splitHeaders(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) return { headers: {}, body: raw };

  const headerBlock = raw
    .slice(0, split)
    // Unfold headers that wrap onto a continuation line.
    .replace(/\r?\n[ \t]+/g, " ");
  const body = raw.slice(split).replace(/^\r?\n\r?\n/, "");

  const headers = {};
  for (const line of headerBlock.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { headers, body };
}

function decodeBody(body, encoding, contentType) {
  const how = (encoding || "").toLowerCase();
  let decoded = body;

  if (how === "base64") {
    try {
      const binary = atob(body.replace(/\s+/g, ""));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      decoded = new TextDecoder(charsetOf(contentType)).decode(bytes);
    } catch {
      decoded = body;
    }
  } else if (how === "quoted-printable") {
    decoded = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
  return decoded.trim();
}

function charsetOf(contentType) {
  const charset = /charset="?([^";\s]+)"?/i.exec(contentType || "")?.[1];
  return charset && charset.toLowerCase() !== "us-ascii" ? charset : "utf-8";
}
