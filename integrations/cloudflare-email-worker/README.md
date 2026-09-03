# bids@yourdomain.com → the board

Cloudflare Email Routing is free and, if your DNS is already on Cloudflare, it
is the shortest path from an address to the app. Everything else — Postmark,
SendGrid, Mailgun — works too and needs no Worker; see `DEPLOY.md`. Use this if
you want the free option.

Email Routing can only deliver to a verified mailbox or to a Worker. Since we
need an HTTP POST, we use a Worker: it hands the message to the app **and**
forwards a copy to your real inbox, so an invitation is never lost to a
deploy, an outage, or a refused sender.

## Setup, about ten minutes

1. **Turn on Email Routing.** Cloudflare dashboard → your domain → **Email** →
   **Email Routing** → **Get started**. Accept the MX records it offers. This
   replaces any existing MX records on the root domain, so if you receive mail
   at `@yourdomain.com` today, stop and use a subdomain or another provider
   instead.

2. **Verify a destination address** — your everyday inbox. Cloudflare emails
   you a confirmation link.

3. **Create the Worker.** Workers & Pages → **Create** → **Worker**, name it
   `bid-intake`, deploy the placeholder, then **Edit code** and paste
   `worker.js` from this directory over what is there. Deploy.

4. **Give it the two secrets.** Worker → **Settings** → **Variables and
   Secrets**:

   | Name | Type | Value |
   |---|---|---|
   | `BCC_URL` | Secret | `https://yourdomain.com/api/bcc/inbound` |
   | `BCC_TOKEN` | Secret | the same string as `BCC_INBOUND_SECRET` on the app |
   | `FORWARD_TO` | Text | *optional* — your verified address, to keep a copy |

5. **Route the address.** Email → **Email Routing** → **Routing rules** →
   **Create address**: custom address `bids`, action **Send to a Worker**,
   worker `bid-intake`. Save.

6. **Tell the app who you are.** On the app (Vercel → Settings →
   Environment Variables), set `BCC_INBOUND_SENDERS` to the addresses allowed
   to post, then redeploy:

   ```
   BCC_INBOUND_SENDERS=you@yourdomain.com, you@gmail.com, @yourdomain.com
   ```

7. **Try it.** Forward a real bid invitation to `bids@yourdomain.com`. It shows
   up under **From your inbox** on the Command Center within a few seconds.

## When something does not arrive

Worker → **Logs** → **Begin log stream**, then forward another email. The
Worker logs exactly what the app said back:

| Log line | What it means |
|---|---|
| `{"status":"created",...}` | Worked. It is on the board waiting for review. |
| `{"status":"recipient_added",...}` | Matched a project already on the board; added the GC as another bid path. |
| `{"status":"update_noted",...}` | An addendum on a bid you already track. |
| `{"status":"ignored",...}` | Read fine, but did not look like a bid invitation. |
| `returned 401` | `BCC_TOKEN` does not match `BCC_INBOUND_SECRET`. |
| `returned 403` | The sender is not in `BCC_INBOUND_SENDERS`. The response names the address to add. |
| `BCC_URL or BCC_TOKEN is not set` | Step 4 was skipped, or the secrets went on the wrong Worker. |

With `FORWARD_TO` set, every one of those still leaves a copy in your inbox.
