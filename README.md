# Bid Command Center

Executive pipeline, follow-up, and install-forecast dashboard for **Elite Roofing**'s
commercial bid board.

It answers five questions on one screen: what is available to win, what needs a call
today, which opportunities are moving, how much probability-weighted work is in the
pipeline, and how much work is actually contracted and scheduled.

It is not a replacement for Trello. Every project carries a link to its Trello card,
where the plans, addenda, takeoffs, and documents live.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The first request seeds `data/db.json` with a realistic Wasatch Front pipeline —
20 projects, 12 GCs, live follow-up dates — generated **relative to the day you first
run it**, so the board always opens on something due today.

Log in with the passcode. Set one before this goes anywhere public:

```bash
cp .env.example .env.local
# BCC_PASSCODE=...          the login passcode      (defaults to "elite")
# BCC_SESSION_SECRET=...    signs the session cookie
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

**Putting it on the web:** see [DEPLOY.md](./DEPLOY.md) — Coolify (recommended,
with a mounted volume) or Vercel (with a KV store). Both end at a private URL with
a passcode and permanent storage.

With Docker:

```bash
export BCC_PASSCODE=... BCC_SESSION_SECRET=...
docker compose up --build
```

---

## The one modelling rule

A **Project** is the unique physical opportunity. A **Bid Recipient** is one proposal
path from that project to one GC. Expected value and win probability live on the
Project; submitted amounts, revisions, and follow-up dates live on the Bid Recipient.

That separation is what keeps the forecast honest:

> A $350,000 project bid to four GCs is **$1.4M of proposal activity** and
> **$350,000 of unique pipeline value.**

The five money figures are computed separately and never summed together:

| Figure | Means |
|---|---|
| Raw proposal volume | Every proposal to every GC — estimating output |
| Active unique pipeline | Expected value, counted once per project |
| Probability-weighted pipeline | Unique value × win probability |
| Apparent awards | Selected, no executed agreement yet |
| Contracted backlog | Signed value still to perform |

Awarded and Contracted stay separate on purpose. *Awarded* means Elite has been
selected; *Contracted* means the work can be counted as backlog.

---

## What is in it

| Screen | Does |
|---|---|
| **Command Center** | The five figures, today's calls, pipeline by stage, a nine-month forecast strip, biggest opportunities, and what is going quiet |
| **Bid Board** | Kanban by stage with drag-and-drop, card quick-edit, and confirmation before Contracted / Lost / Cancelled |
| **Projects** | Sortable, filterable table — 19 columns, multi-sort (shift-click), column picker, sticky header, expandable rows showing every GC |
| **Follow-ups** | Queue grouped by urgency, plus a month calendar. Overdue, due today, and *unscheduled* are all first-class |
| **Install Forecast** | Timeline of probable and contracted work with monthly roll-ups and a concurrent-project count that makes collisions obvious |
| **Clients & GCs** | Per-GC volume, win rate by count and dollars, bid-to-award time, contacts, and full project history |
| **Analytics** | Win rates by count, dollars, GC, project type, roofing system, and bid size; cycle times; proposals per month; loss reasons; estimated vs contracted |

Everywhere: `⌘K` command bar, project side panel, one-click Trello, and CSV export of
projects, bid recipients, activities, and organizations.

### Email intake

Forward a bid invitation to the address your mail provider points at
`POST /api/bcc/inbound?token=…` and it comes back as a project card on the Command
Center — name, GC, contact, location, bid date and time, materials, scope flags,
square footage, and a value when the email states one.

Three rules make this safe to leave switched on:

- **Nothing lands on the board unreviewed.** Every arrival is a draft in *Identified*
  with `needsReview` set. It is excluded from pipeline totals, the board, the table,
  the follow-up queue, and GC history until you press **Add to board**.
- **The email is data, never instructions.** It is passed to the model inside a
  delimited block with a fixed output schema. There is nothing a forwarded message can
  say that changes what the system does with it.
- **It says what it is unsure about.** Every card shows a confidence level and the
  extractor's own list of guesses, alongside the original message.

Set `ANTHROPIC_API_KEY` for the model-based reader. Without one it falls back to text
matching — good enough for dates, dollar amounts, and materials, and clearly labelled
as such.

### Pipeline tabs

**Bidding · Awarded · Contracted · Closed · All** are saved filtered views over the
`stage` field — not a second status. Moving a project's stage moves it between tabs
on its own.

---

## Design

Mostly white, black accents, one volt highlight (`#C8F235`) used for selection, focus,
and the awarded band on the forecast. Colour otherwise only ever means status:
green for contracted, amber for due-soon, red for overdue and risk. Tabular figures
everywhere so numbers never jitter as they change.

---

## Architecture

```
app/
  (app)/                 authenticated screens — passcode checked in the layout
  api/bcc/               projects · recipients · activities · auth · export · data
components/
  bcc/                   domain components (board, table, panel, forecast, modals)
  providers/             one client store: the whole database plus every mutation
  shell/                 app frame, sidebar, command bar
  ui/                    design-system primitives
lib/bcc/
  types.ts               Project · BidRecipient · Organization · Activity · Contract
  stages.ts              14 stages, default probabilities, tab grouping
  calc.ts                every number the product reports
  store.ts               the only code that touches persistence
  seed.ts                the demo pipeline
```

**Persistence** is a single JSON document, read in one shot and written under a lock
(`lib/bcc/store.ts`). Two backends, chosen automatically:

| | When | Durable? |
|---|---|---|
| **kv** | any Redis credentials are present — REST (`KV_REST_API_*`, `UPSTASH_REDIS_REST_*`) or TCP (`REDIS_URL`) | Yes — for serverless hosts with no disk |
| **volume** | `BCC_DATA_DIR` is set | Yes — a mounted volume on your own server |
| **file** | neither | Only on your own machine |

The app tells you which one is live: **Data & backup** in the sidebar shows a green
banner for durable storage and an amber one otherwise, the sidebar carries an amber
dot while writes are not permanent, and `GET /api/bcc/health` reports the same thing
for your host's monitor. No caller reaches past `readDb` / `mutate`,
so moving to Postgres means reimplementing those two functions and nothing else.

**Backups.** *Data & backup* downloads the whole database as JSON and restores it in
one click — the CSV exports are for spreadsheets, not for restoring. The same panel
clears the demo pipeline for good when you are ready to put real work in.

**State** is one client-side store (`DataProvider`). Every mutation returns the new
database; stage drags apply optimistically and roll back if the write fails.

### Deliberate departures from the spec

- The board card omits the stage chip. The column header already *is* the stage, and
  the spec's own rule — readable in three seconds — wins. Stage is in the card tooltip
  and everywhere else.
- "Change since last period" on the summary cards is reported as *value added in the
  last 30 days* rather than a snapshot delta. No value history is stored yet, so
  anything else would be invented.
- Drag-and-drop uses native HTML5 events, which do not fire on touch. Stage is
  editable from the card's quick-edit popover and the project panel, so mobile is not
  blocked.

---

## Not built yet

Email/calendar sync, BuildingConnected import, QuickBooks earned-revenue updates,
team roles, and the notification/automation rules from §17 of the spec. The Trello
integration is a stored URL by design — the data model is shaped so a real Trello API
sync can be added without restructuring `Project`.
