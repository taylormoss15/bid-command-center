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

Forward a bid invitation and it lands on the board as a card for review.

1. Set `BCC_INBOUND_SECRET` (required — the endpoint refuses everything until it
   exists) and `ANTHROPIC_API_KEY` (optional — without it, the app falls back to
   plain text matching and labels every card low-confidence).

2. Point an inbound-email provider at:

   ```
   https://<your-domain>/api/bcc/inbound?token=<BCC_INBOUND_SECRET>
   ```

   | Provider | Notes |
   |---|---|
   | **Cloudflare Email Routing** | Free. Route an address to a Worker that POSTs the message. |
   | **Postmark** | Inbound stream, paid, the most reliable parsing. |
   | **SendGrid Inbound Parse** | Free tier, needs an MX record on a subdomain. |
   | **Mailgun Routes** | Free tier. |

   The endpoint recognises all of their payload shapes.

3. Confirm the wiring:

   ```bash
   curl "https://<your-domain>/api/bcc/inbound?token=<secret>"
   # {"status":"ready","extractor":"claude","model":"claude-opus-5"}
   ```

Forwarded mail never lands straight on the board — it appears under **From your
inbox** on the Command Center and stays out of every total until accepted.

**Cost:** roughly two to three cents per email at current Opus 5 pricing. Set
`BCC_EXTRACTION_MODEL=claude-haiku-4-5` to trade some accuracy for about a fifth
of that.

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

# Growing out of this

Storage is one JSON document behind `lib/bcc/store.ts`, and nothing else in the
codebase touches persistence. When you want per-user logins, an audit trail, or
several estimators writing at once, reimplement `readDb` and `mutate` against
Postgres — Coolify can run one next to the app — and the rest of the app is
unchanged.
