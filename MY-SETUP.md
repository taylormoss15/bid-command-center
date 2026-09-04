# Elite Roofing — how this deployment is wired

The live configuration for **bidcommandcenter.com**, kept here so it does not
live in a chat log. `DEPLOY.md` is the generic guide; this is the specific one.

**No secret values in this file.** It records names and where they go. The
values themselves live in Vercel and Cloudflare.

---

## Where it runs

| | |
|---|---|
| Host | Vercel, project `bid-command-center`, auto-deploys on push to `main` |
| Domain | bidcommandcenter.com (DNS at Cloudflare) |
| Storage | Redis, connected through the Vercel marketplace — confirm with `/api/bcc/health` returning `"durable": true` |
| Outbound mail | Resend |
| Inbound mail | Cloudflare Email Routing → Worker (below) |

**Any environment variable change needs a redeploy to take effect.** Vercel
applies env vars at build time, not to a running deployment.

---

## Environment variables on Vercel

| Name | Purpose |
|---|---|
| `BCC_PASSCODE` | The live board's login |
| `BCC_DEMO_PASSCODE` | Opens the demo board instead. Separate storage, invisible to live. |
| `BCC_SESSION_SECRET` | Signs the session cookie |
| `BCC_APP_URL` | `https://bidcommandcenter.com` — where links in emails point |
| `BCC_INBOUND_SECRET` | Password for the inbound email endpoint. Must match `BCC_TOKEN` on the Cloudflare Worker. |
| `ANTHROPIC_API_KEY` | Optional. Reads forwarded invitations properly. Without it, plain text matching. |
| `RESEND_API_KEY` | Sends the morning digest and the intake confirmation replies |
| `BCC_NOTIFY_EMAIL` | Where the digest goes |
| `BCC_NOTIFY_FROM` | Sender for both emails |
| `CRON_SECRET` | Vercel Cron presents this. Without it the digest endpoint refuses to run. |

Storage variables (`KV_REST_API_*` / `REDIS_URL`) are injected by the
marketplace connection — do not paste them by hand.

---

## Email intake: bids@bidcommandcenter.com

Cloudflare Email Routing cannot POST to a URL on its own, so a Worker sits in
between. It forwards a copy to a real inbox **first**, then posts to the app —
so an invitation is never lost to a deploy, an outage, or a refused sender.

### Cloudflare, once

1. **Email → Email Routing → Get started.** Accept the MX records.
   This replaces MX on the root domain. Fine here, because no mailboxes exist
   at bidcommandcenter.com. It does not touch the A/CNAME records, so it is
   unrelated to the Vercel domain and the proxy setting.
2. **Verify a destination address** — an everyday inbox.
3. **Workers & Pages → Create → Worker**, named `bid-intake`. Deploy the
   placeholder, then Edit code and paste
   `integrations/cloudflare-email-worker/worker.js` over it. Deploy.
4. **Worker → Settings → Variables and Secrets:**

   | Name | Type | Value |
   |---|---|---|
   | `BCC_URL` | Secret | `https://bidcommandcenter.com/api/bcc/inbound` |
   | `BCC_TOKEN` | Secret | same string as `BCC_INBOUND_SECRET` on Vercel |
   | `FORWARD_TO` | Text | the verified address from step 2 |

5. **Email Routing → Routing rules → Create address:** custom address `bids`,
   action **Send to a Worker**, worker `bid-intake`.

### In the app, no deploy needed

**Data & backup → Email intake.** Approve the mailboxes you forward from — a
full address, or a whole company as `@eliteroofing.com`. Each board keeps its
own list, which is why standing up another account never touches Vercel.

Until a board has approved anyone, every sender lands on live. The first
approval is what starts turning strangers away.

### Checking it

```bash
curl "https://bidcommandcenter.com/api/bcc/inbound?token=<BCC_INBOUND_SECRET>"
```

Reports the extractor in use, the approved senders, what happens to
unrecognised ones, and whether confirmation replies are on.

When a forward does not arrive: Worker → **Logs** → **Begin log stream**, then
forward another email. `401` means the tokens do not match; `403` means the
sender is not approved and the response names the address.

---

## Keyboard

| Key | Does |
|---|---|
| `N` | New project |
| `F` | Follow-up queue |
| `⌘K` | Search projects, GCs, cities |

Bare letters, because ⌘N and ⌘T belong to the browser. They stand down inside
any field and whenever a dialog is open.

## The follow-up cadence

Three messages after a bid goes out, then work to the GC's own date:

| | When | For |
|---|---|---|
| 1 | 6 business days after the bid was due | Confirm they have everything. Do not ask whether you won. |
| 2 | 8 business days later | Have you started levelling? |
| 3 | 10 business days later | **Ask them for a date to circle back**, then honour it. |

After the third, the app stops proposing dates — use the one they gave you. Set
it as the next follow-up with a note in *Waiting on*, and the board leaves them
alone until then.

Counted in business days and rolled off weekends. The clock starts at the bid
due date, not the day you submitted, so bidding early never means chasing
early. A revision sent *after* the due date does move the clock.

Exceptions the app handles on its own:

- **Engaged** (Active follow-up, Shortlisted, Apparent low) — the script is set
  aside. Answer them immediately; chase about weekly if it goes quiet.
- **Awarded but unsigned** (Verbal award, Contract received) — chase the
  contract, not the bid.
- **Not yet submitted** — no cadence. There is nothing to follow up on.

The message for whichever step a bid is on is on the **Message** button in the
follow-up queue and inside Set follow-up, ready to copy. GCs marked *strong* or
*preferred* get the shorter, more familiar wording.

Recording a submitted bid books the first follow-up automatically, but only
when nothing is already booked — a date set by hand always wins.

---

## Still to do

- [ ] `BCC_APP_URL` set on Vercel, then redeploy
- [ ] Cloudflare Email Routing + Worker (above)
- [ ] Approve senders under Data & backup → Email intake
- [ ] `ANTHROPIC_API_KEY` — optional; about 2–3¢ per email, or a fifth of that
      with `BCC_EXTRACTION_MODEL=claude-haiku-4-5`
- [ ] Grey-cloud both DNS records so Vercel's domain check goes green. Proxied
      records point at Cloudflare's IPs, so Vercel can never verify them — this
      is a permanent state, not slow propagation. The site works either way.
