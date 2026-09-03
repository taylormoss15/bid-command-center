# Deploying the Bid Command Center

Goal: a private URL with a passcode login, where data is saved permanently and
survives every future deploy.

Two supported paths. **Coolify is the recommended one** — see the note at the
bottom for why, and for when Vercel is the better answer.

---

# Path A — Coolify (recommended)

Coolify deploys this from GitHub onto your own server. The important part is the
**persistent volume**: with one mounted, the app stores everything on a real disk
that outlives the container, so there is no external database to run or pay for.

## 1. Push the code to GitHub

An **empty** private repo under `taylormoss15` (no README, no .gitignore, no
licence), then:

```bash
git remote add origin https://github.com/taylormoss15/<repo>.git
git push -u origin main
```

## 2. Create the resource in Coolify

1. **+ New** → **Resource** → **Public/Private Repository** → pick the repo.
2. **Build Pack: Dockerfile.** The repo has one at the root. Nixpacks would also
   work, but the Dockerfile pins Node 22, runs as a non-root user, and produces a
   ~25 MB standalone build instead of shipping the whole toolchain.
3. **Port: 3000.**
4. Set your domain, and let Coolify issue the Let's Encrypt certificate.

## 3. Mount the volume — the step that makes data permanent

**Storage** → **+ Add** → **Volume Mount**:

| Field | Value |
|---|---|
| Name | `bid-data` |
| Destination Path | `/data` |

That must match `BCC_DATA_DIR` below. Without it the container still runs, but
everything is lost on the next rebuild.

## 4. Environment variables

**Environment Variables** → add:

| Name | Value |
|---|---|
| `BCC_DATA_DIR` | `/data` |
| `BCC_PASSCODE` | the passcode you will type to log in |
| `BCC_SESSION_SECRET` | any long random string — `openssl rand -hex 32` |

Optional, for email intake (Path C below):

| Name | Value |
|---|---|
| `BCC_INBOUND_SECRET` | another long random string |
| `ANTHROPIC_API_KEY` | an Anthropic API key |

## 5. Deploy and confirm

Hit **Deploy**. When it goes green:

```bash
curl https://<your-domain>/api/bcc/health
# {"status":"ok","storage":"volume","durable":true}
```

`"durable": true` is the confirmation that your edits are permanent. The app also
says so in its own words: sidebar → **Data & backup** shows a green
*"Storage is durable — mounted volume"* banner, and an amber one with a warning
dot if the volume is missing.

Coolify's health check picks up the same endpoint automatically — the Dockerfile
declares it.

## 6. Make it yours

Log in, then **Data & backup** → **Clear all data and start real**. That empties
the demo pipeline for good. Add your live projects from there.

## Backups on Coolify

Two layers, and you want both:

1. **Coolify's scheduled backups** on the `bid-data` volume, to S3 or local.
2. **Data & backup → Download full backup (JSON)** once a week. It restores in one
   click from the same panel, and it is the copy that does not depend on the server
   still being alive.

## Updating

`git push` → Coolify rebuilds and redeploys. The volume is untouched, so the
pipeline is exactly where you left it. Turn on **Auto Deploy** if you want pushes
to ship without pressing anything.

---

# Path B — Vercel

Use this if you would rather not run a server for this one app.

1. <https://vercel.com/new> → import the repo → **Deploy**. No build settings to change.
2. **Storage** → **Create Database** → a Redis/KV store → **Connect** to the project.
   Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. **Settings** → **Environment Variables** → add `BCC_PASSCODE` and
   `BCC_SESSION_SECRET`. Redeploy.

Step 2 is not optional. Vercel's filesystem is thrown away on every deploy, so
without the KV store the app runs in `file` mode — it comes up and is usable, but
anything you enter is lost on the next push. The **Data & backup** banner is amber
and `/api/bcc/health` reports `"durable": false` until the store is connected.
**Do not enter real bids before that banner turns green.**

**Any Redis works.** The app detects whichever credentials the provider injects:

| Provider gives you | Variables read |
|---|---|
| Upstash, Vercel KV | `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| Redis Cloud, or any TCP server | `REDIS_URL` (also `KV_URL`, `STORAGE_URL`) |

REST is preferred on serverless — stateless HTTP, with no connection to keep
alive between invocations — but a `redis://` URL works too.

**Leave "Custom Prefix" empty** when connecting a marketplace database. A prefix
renames the injected variables to something the app does not look for.

**Free option:** Upstash's own free tier at <https://upstash.com> is the cheapest
route — create a Redis database there, then paste `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` into Vercel's environment variables by hand. Vercel's
marketplace listings start around $8/month, far more storage than this app will
ever use.

**Licence note:** Vercel's Hobby plan is for non-commercial use. Elite Roofing's
bid board is commercial, so this path means Pro at $20/month.

---

# Path C — Email intake (optional, either path)

Forward a bid invitation to one address and it appears on the board, already
filled in, waiting for you to confirm it.

## 1. Environment variables

| Name | Required | What it does |
|---|---|---|
| `BCC_INBOUND_SECRET` | **yes** | Shared secret. Until it exists the endpoint refuses everything — it never accepts anonymous writes. |
| `ANTHROPIC_API_KEY` | no | Reads the email properly. Without it the app falls back to plain text matching and labels every card low-confidence. |
| `RESEND_API_KEY` | no | Sends a confirmation reply back to whoever forwarded the email. Shared with the digest. |
| `BCC_INBOUND_SENDERS` | no | Fallback approved senders. The list normally lives in the app. |
| `BCC_INBOUND_DEFAULT_WORKSPACE` | no | Where mail from an unrecognised sender goes. Unset means refuse it. |
| `BCC_EXTRACTION_MODEL` | no | Defaults to `claude-opus-5`. |

## 2. Who is allowed to forward

**In the app: Data & backup → Email intake.** Type an address, press Approve
sender. Each board keeps its own list, so setting up another account is a form
rather than a deploy — nothing here needs an environment variable or a rebuild.

- A full address, or a whole company written as `@eliteroofing.com`.
- An exact address beats a domain rule, so one mailbox on a shared domain can
  be pointed at the demo board while the rest go live.
- `+tag` suffixes are ignored, and so are dots in a Gmail address, so
  `taylor+bids@gmail.com` still matches `taylor@gmail.com`.
- Anyone else is refused, and the refusal names the address so you know what to
  add.
- The panel shows how many emails each entry has actually carried, so stale
  ones are obvious.

Until a board has approved anyone, **every** sender routes to the live board —
which is what a brand new deployment needs in order to receive its first email
at all. Approve one address and everything else starts getting refused.

`BCC_INBOUND_SENDERS` still works and is checked after the stored list. Same
format, plus `=live` or `=demo` per entry:

```
BCC_INBOUND_SENDERS=taylor@eliteroofing.com, @eliteroofing.com, sales@eliteroofing.com=demo
```

A word on what this is: a From header can be forged, so sender matching is
**routing, not security**. `BCC_INBOUND_SECRET` is what guards the door. What
the sender rules buy you is that a misconfigured provider, a newsletter, or a
GC who found the address on a bid tab cannot quietly fill your board with junk.

Want GCs to be able to email the address directly? Set
`BCC_INBOUND_DEFAULT_WORKSPACE=live` and unrecognised senders land on the live
board instead of bouncing.

## 2b. The confirmation reply

With `RESEND_API_KEY` set (the digest's key — there is nothing new to sign up
for), whoever forwards an email gets a reply within seconds: what landed, the
fields it read out of the message, anything worth checking, and a link straight
to the project. It threads under the message you forwarded, and it goes to the
**forwarder only** — never to the GC quoted inside.

The point is that forwarding from a phone stops being an act of faith. Turn it
off per board with the checkbox under Data & backup → Email intake.

## 3. Point a mail provider at it

```
https://<your-domain>/api/bcc/inbound?token=<BCC_INBOUND_SECRET>
```

| Provider | Notes |
|---|---|
| **Cloudflare Email Routing** | Free, and the obvious pick if your DNS is already there. Needs a small Worker — one is written for you in `integrations/cloudflare-email-worker/`, with step-by-step setup in its README. |
| **Postmark** | Inbound stream, paid, the most reliable parsing. Points straight at the URL, no Worker. |
| **SendGrid Inbound Parse** | Free tier, needs an MX record on a subdomain. Points straight at the URL. |
| **Mailgun Routes** | Free tier. Points straight at the URL. |

The endpoint recognises all of their payload shapes.

## 4. Confirm the wiring

```bash
curl "https://<your-domain>/api/bcc/inbound?token=<secret>"
```

```json
{
  "status": "ready",
  "extractor": "claude",
  "model": "claude-opus-5",
  "approvedSenders": ["taylor@eliteroofing.com → live", "@eliteroofing.com → live"],
  "sendersFromEnvironment": "BCC_INBOUND_SENDERS is not set",
  "unrecognisedSenders": "refused",
  "confirmationReplies": "sent from Bid Command Center <bids@yourdomain.com>",
  "demoWorkspace": "available"
}
```

Then forward a real invitation and watch **From your inbox** on the Command
Center.

## What happens to a forwarded email

The sender picks the board. Then the app works out whether it already knows the
job, because the whole model rests on one project per physical opportunity
however many GCs bid it:

| Situation | What you get |
|---|---|
| A job we have never seen | A new project in **Identified**, marked for review. It counts for nothing until you accept it. |
| A job already on the board, from a GC not yet on it | A **second bid recipient** on the existing project — not a second project. Unique pipeline does not move; proposal activity does. |
| A bid we already track (an addendum, a date change) | A note on that bid path, with the email attached and any disagreement spelled out: *"This email says bids are due Oct 14; the board says Oct 9."* |
| The same email twice | Nothing. It is already waiting for you. |
| A newsletter | Ignored, with a reason, so the provider stops retrying. |

Two rules hold in every case. **Nothing an email says changes a project** — a
moved bid date is reported, never applied, because that is your call. And the
email body is treated as data, never as instructions: it goes to the model
inside a delimited block with a fixed output schema, and there is nothing a
forwarded message can say that will make this system act on it.

The app also lines the extraction up with what you already have: it sends the
names of GCs on file so a regular does not come back as a second spelling, and
it recognises a GC by the email domain of anyone already on file — so an
invitation from a new person at a company you know still lands under that
company.

**Cost:** roughly two to three cents per email at current Opus 5 pricing. Set
`BCC_EXTRACTION_MODEL=claude-haiku-4-5` to trade some accuracy for about a
fifth of that.

---

# Path D — the morning digest (optional, either path)

One email each weekday listing what needs a call, with a link per project.

1. Sign up at <https://resend.com> (free tier is ample) and create an API key.
   Sending from your own domain needs a DNS record; until then the digest can go
   out from Resend's shared `onboarding@resend.dev` sender.

2. Add these environment variables:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | from Resend |
   | `BCC_NOTIFY_EMAIL` | where the digest goes — comma-separate for several |
   | `BCC_NOTIFY_FROM` | *optional* — `Bid Command Center <bids@yourdomain.com>` |
   | `CRON_SECRET` | any long random string; the scheduler presents it |

   Without `CRON_SECRET` the scheduled endpoint refuses to run — it will not sit
   there unauthenticated and able to send mail.

3. On Vercel the schedule is already declared in `vercel.json`
   (`0 13 * * 1-5` — 7am Mountain in summer, 6am in winter; Vercel Cron runs on
   UTC and does not follow daylight saving). Redeploy and it registers itself.
   Self-hosting instead? Point any scheduler at:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/bcc/cron/digest
   ```

4. Prove it now rather than waiting for tomorrow: **Data & backup → Send me one
   now**. That forces a send even on a quiet day and reports what it found.

---

# Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Storage falls back to `./data/db.json` with no configuration. The app reports
`file` mode, which is honest: that directory is fine on your own machine and is
not durable on a host that rebuilds the filesystem.

With Docker:

```bash
export BCC_PASSCODE=... BCC_SESSION_SECRET=...
docker compose up --build
```

The compose file mounts a named volume at `/data`, which is the same arrangement
Coolify creates.

---

# Which host, and why

**Coolify, for a fleet of personal projects.** One VPS (Hetzner CX22 at about
€4/month, or a $12 DigitalOcean droplet) hosts every app you have, with real disks,
real Postgres and Redis containers when a project needs them, and no per-project
cost. Git-push deploys, automatic HTTPS, preview environments. For *this* app it is
strictly simpler than Vercel: a mounted volume replaces the external key-value
store entirely.

The trade is that you own uptime, backups, and Coolify updates. One server is one
point of failure — hence the two backup layers above.

**Vercel, for anything public-facing where you want zero operations** and a CDN in
front of it. Better DX for Next.js specifically, preview URLs on every PR, nothing
to patch. Costs $20/month for commercial use, and every project needs its own
external database because there is no disk.

**A reasonable split:** personal projects and internal tools on Coolify; anything
customer-facing that must not go down while you are on a roof on Vercel.

---

# If something goes wrong

| Symptom | Cause |
|---|---|
| Data disappears after a deploy | No volume mounted, or `BCC_DATA_DIR` does not match the mount path. Check `/api/bcc/health` for `"durable": true`. |
| `"storage":"file"` on a server | `BCC_DATA_DIR` is not set. |
| Login rejects the right passcode | `BCC_PASSCODE` was added but the app was not redeployed. |
| Container restarts in a loop | Health check failing. Check the app logs; the endpoint is `/api/bcc/health` and needs no auth. |
| "Could not acquire the write lock" | Two writes collided. Retry; the lock clears itself after ten seconds. |
| Email intake returns 401 | `BCC_INBOUND_SECRET` unset, or the `token` in the URL does not match it. |
| Email intake returns 403 | The forwarding address is not approved. The response body names it — add it under Data & backup → Email intake, or set `BCC_INBOUND_DEFAULT_WORKSPACE`. |
| No confirmation reply arrives | `RESEND_API_KEY` unset, the checkbox is off for that board, or the message was a duplicate (those are silent by design). The POST response says which. |
| A forwarded email went to the wrong board | Whichever rule in `BCC_INBOUND_SENDERS` matched the From address decided it. An exact address beats an `@domain` rule. |
| A forwarded email created a duplicate project | The name and city did not look close enough to what is on the board. Merge by hand and it will match next time. |

# Growing out of this

Storage is one JSON document behind `lib/bcc/store.ts`, and nothing else in the
codebase touches persistence. When you want per-user logins, an audit trail, or
several estimators writing at once, reimplement `readDb` and `mutate` against
Postgres — Coolify can run one next to the app — and the rest of the app is
unchanged.
