# Deploying the Bid Command Center

Target: a private URL with a passcode login, where data is saved permanently and
survives every future deploy. About ten minutes, most of it waiting.

The stack is a standard Next.js app, so **Vercel** is the shortest path — but
nothing here is Vercel-specific. Any Node host works as long as you set the same
environment variables.

---

## 1. Push the code to GitHub

Create an **empty** private repo (no README, no .gitignore, no licence), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Import it into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → pick the repo.
2. Leave every build setting alone. Next.js is detected automatically.
3. Click **Deploy**.

The first deploy will succeed and the site will load — but do not put real work in
it yet. Until step 3 it is storing data in a file that Vercel throws away on the
next deploy. The **Data & backup** panel in the sidebar tells you which mode you
are in, and the sidebar shows an amber dot while storage is not durable.

## 3. Add durable storage — the important step

1. In the Vercel project: **Storage** → **Create Database** → choose a
   Redis / KV store (Upstash is the default offering; the free tier is far more
   than this app needs).
2. **Connect** it to the project. Vercel injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically — you do not have to copy anything.
3. Redeploy (**Deployments** → ⋯ → **Redeploy**).

Open **Data & backup** in the sidebar. The banner should now read *"Storage is
durable."* That is the confirmation that your edits are permanent.

If you would rather use a store you already have, the app reads either naming
convention: `KV_REST_API_URL` / `KV_REST_API_TOKEN`, or
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

## 4. Set your passcode

**Settings** → **Environment Variables**, add both to Production:

| Name | Value |
|---|---|
| `BCC_PASSCODE` | the passcode you will type to log in |
| `BCC_SESSION_SECRET` | any long random string — signs the login cookie |

Generate a secret with `openssl rand -hex 32`.

Redeploy once more so the variables take effect. Until `BCC_PASSCODE` is set the
app falls back to `elite` and the login screen says so in an amber box.

## 5. Make it yours

Log in and open **Data & backup** → **Clear all data and start real**. That empties
the demo pipeline for good — it does not come back. Then add your live projects,
either with **New project** (⌘K, or the button top right) or by restoring a backup.

---

## Using it week to week

- The login cookie lasts 30 days, so you sign in about once a month.
- It works on a phone. The follow-up queue, logging, stage changes, and Trello
  links are all built for a one-handed update after a call.
- Once a week, hit **Data & backup → Download full backup (JSON)** and keep the
  file somewhere. It is the only export that can be restored, and restoring is one
  click. The CSV exports are for spreadsheets and accountants, not for restoring.

## If something goes wrong

| Symptom | Cause |
|---|---|
| Data disappears after a deploy | Step 3 was skipped or the KV store is not connected. Check the banner in **Data & backup**. |
| Login rejects the right passcode | `BCC_PASSCODE` was added but not redeployed. |
| "Could not acquire the write lock" | Two writes collided. Retry; the lock clears itself after ten seconds. |

## Cost

Vercel Hobby and an Upstash free-tier store cover this comfortably — one user, a
few hundred writes a week, a dataset measured in hundreds of kilobytes. Vercel
Hobby is for non-commercial use; if that matters to Elite, the Pro plan is $20/mo
and nothing about the app changes.

## Growing out of this

Storage is one JSON document behind `lib/bcc/store.ts`. Nothing else in the
codebase touches persistence. When you want per-user logins, an audit trail, or
more than one estimator writing at once, reimplement `readDb` and `mutate` against
Postgres (Supabase, Neon, or Vercel Postgres) and the rest of the app is unchanged.
