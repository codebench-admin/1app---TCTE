# Runway — Event Production Console

A full-stack rebuild of the Runway prototype: task/sponsor/artist/stall/budget
management with department-scoped permissions and a 2-level expense approval
workflow (Department Head -> Finance Head).

## Structure

```
runway/
  database/schema.sql     Postgres schema (events.event_name is the unique key
                           every other table hangs off via event_id)
  backend/                Express + PostgreSQL REST API
  frontend/                Vite + React client
```

## Quick start

### 1. Database

```bash
createdb runway
psql runway -f database/schema.sql
psql runway -f database/migrations/002_phase1_foundation.sql
psql runway -f database/migrations/003_sponsor_contracts_payments.sql
psql runway -f database/migrations/004_artist_travel_payments.sql
psql runway -f database/migrations/005_expense_policies.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL and a real JWT_SECRET
npm install
npm run dev                # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env       # point VITE_API_URL at the backend above
npm install
npm run dev                # http://localhost:5173
```

## Design notes / honest simplifications

- **Auth**: real JWT auth against a `users` table (bcrypt-hashed passwords).
  There's no more client-side "act as any teammate" switcher from the
  prototype — that only made sense as a demo convenience and is a security
  anti-pattern in a real app. Every request is authenticated as *you*, and
  permissions are enforced **server-side** (see `utils/permissions.js` and
  the checks in each route), not just hidden/shown in the UI.
- **Multi-event**: a user's role and department are scoped *per event* via
  the `event_members` join table, so the same person can be a Department
  Head on one event and a General User on another.
- **Adding teammates**: a Super Admin adds someone by email from Team &
  Access. If that email has no account yet, the backend creates one with a
  random temporary password and returns it once in the response — there's
  no email-sending infra wired up, so you'll need to share that password
  with them out of band (Slack/WhatsApp/etc). Swap in a real mailer
  (Postmark, SES, Resend...) when you're ready to invite people for real.
- **Deliverables**: stored as child rows (`sponsor_deliverables`) and
  replaced wholesale on sponsor edit — simplest correct approach for a
  checklist of this size.
- **CORS/hosting**: the backend needs Node hosting (Hostinger Business/Cloud
  with Node.js app support, or a VPS) and Postgres (Hostinger shared plans
  are MySQL-only — see the migration note at the bottom of
  `database/schema.sql` if you're stuck on shared hosting).

## CRM/ERP-parity roadmap

Phase 1 (done — `database/migrations/002_phase1_foundation.sql`): the
cross-cutting infrastructure every later feature needs.
- **Documents** — real file storage (`documents` table + `/api/events/:id/documents`),
  replacing the old string-only `attachment_name`/`attachment_url` stub.
  Local disk in dev (`backend/src/utils/storage.js`) — swap for S3/R2 before
  production, since a Node host's local disk isn't durable across deploys.
- **Notifications** — in-app only for now (`notifications` table +
  `/api/events/:id/notifications`), wired into task assignment and every
  expense-approval step. No email/SMS provider is connected — see
  `backend/src/utils/notify.js` to add one later.
- **Comments** — activity feed on tasks/sponsors/artists/expenses
  (`comments` table + `/api/events/:id/comments`).
- **Audit log** — append-only trail of who changed what (`audit_log` table),
  wired into task/sponsor/expense create/update/delete/approve/reject.

Roadmap status: all five originally proposed phases are now built.
1. ~~Foundation (documents, notifications, comments, audit log)~~ — done, Phase 1
2. ~~Sponsor contract lifecycle + payment/installment tracking~~ — done, Phase 2
3. ~~Artist riders/contracts + travel & accommodation logistics + settlement tracking~~ — done, Phase 3
4. ~~Expense policy rules + accounting export~~ — done, Phase 4
5. ~~Reporting dashboard~~ — done, Phase 5

Calendar sync (Google Calendar/iCal) was on the original list and is the
one item genuinely not started — it needs an OAuth flow against Google's
API, which is a different kind of work (external auth, not just
schema+routes+UI) and hasn't been scoped yet.

Phase 2 (done — `database/migrations/003_sponsor_contracts_payments.sql`):
sponsor contract lifecycle (Draft → Sent → Signed → Expired/Terminated,
with renewal chaining and a document attachment) and a payment ledger
(installments against a sponsor's total, with an "overdue" flag computed
at query time). **Caveat**: the "signature" is a typed name + timestamp +
IP recorded server-side — good enough for internal tracking, not a
DocuSign-grade legally binding e-signature. If contracts need to hold up
as signed legal documents on their own, integrate a real e-signature
provider (DocuSign, Zoho Sign) instead of relying on this.

Phase 3 (done — `database/migrations/004_artist_travel_payments.sql`):
- Riders/contracts reuse the generic `documents` table from Phase 1
  (label = "Technical Rider" / "Hospitality Rider" / "Contract" / "Other")
  rather than a new table — upload/download/delete now surfaced on the
  Artists panel.
- `artist_travel_legs` — flights/ground transport/hotel bookings per
  artist, each with a description, timing, and confirmation reference.
- `artist_payments` — deposit/balance/full settlement tracking, mirroring
  the sponsor payment ledger's shape (kept as its own table rather than
  merging with `sponsor_payments`, to avoid touching an already-shipped
  table — a future cleanup could genericize both).

Phase 4 (done — `database/migrations/005_expense_policies.sql`):
- `expense_policies` — Finance/Super Admin set a max amount per
  department and/or category (either can be left blank to mean "all").
  An expense submitted over its matching limit is flagged
  (`is_policy_flagged` + a note) and Finance is notified immediately,
  in parallel with the normal two-stage approval — it does **not** block
  submission or auto-reject, matching how Ramp/Concur surface policy
  violations for review rather than silently enforcing them.
- `GET /api/events/:id/expenses/export` — CSV export of expense requests
  with generic accounting columns (date, ledger/category, debit amount,
  cost center, status, approver). Column names are a starting point, not
  a guaranteed match for Tally's or Zoho Books' import format — check
  against whichever one you're importing into and adjust the column
  mapping in `backend/src/routes/expenses.js` if needed.

Phase 5 (done): the dashboard now runs entirely off a new aggregation
endpoint, `GET /api/events/:id/reports/summary`, instead of computing
stats client-side from several list calls. It adds sponsor collection
(paid vs. pledged vs. overdue), artist settlement, a sponsor contract
status funnel, an "over policy" expense count, and a recent-activity
feed sourced from the Phase 1 audit log — on top of the budget chart and
task completion the dashboard already had.
