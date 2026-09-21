-- =====================================================================
-- RUNWAY — Full database schema, consolidated for a single deployment
--
-- This is schema.sql + all 4 migrations (002-005) concatenated in the
-- order they must run, for a ONE-SHOT deploy to a fresh Railway Postgres
-- instance. Deploying piece by piece (schema.sql, then each migration
-- separately) works too and is what to use if you ever add a 006 later —
-- this file is just the shortcut for standing up a brand-new database.
--
-- Run once, against an empty database:
--   psql "$DATABASE_URL" -f database/deploy/001_full_schema.sql
--
-- Contains NO seed/demo data on purpose — see 002_seed_data.sql (optional,
-- demo users only, do not run against a real production database as-is).
-- =====================================================================

-- =====================================================================
-- RUNWAY — Event Management System
-- Relational schema (PostgreSQL dialect, portable to MySQL with minor tweaks)
--
-- Design notes:
--   • events.event_name is UNIQUE — every other table hangs off event_id,
--     which in turn traces back to that unique event_name. This is what
--     scopes every task/sponsor/artist/stall/budget row to a single event.
--   • departments are normalized per event (the same department name can
--     exist independently in two different events).
--   • users are global login identities; event_members maps a user to a
--     role + department *within* a specific event, since the same person
--     could be a Department Head on one event and a General User on another.
--   • Money fields use NUMERIC(12,2) for exact decimal arithmetic (avoid
--     FLOAT for currency).
--   • Every child table cascades on event deletion, so removing an event
--     cleans up its whole subtree.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CORE: EVENTS
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id        BIGSERIAL PRIMARY KEY,
    event_name      VARCHAR(150) NOT NULL UNIQUE,   -- the unique key referenced app-wide
    event_date      DATE NOT NULL,
    venue           VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- USERS (global login identity — one row per person, across all events)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id         BIGSERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,          -- store a bcrypt/argon2 hash, never plaintext
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- DEPARTMENTS (scoped per event)
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    department_id   BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, name)
);

-- ---------------------------------------------------------------------
-- EVENT MEMBERS (a user's role + department WITHIN one event)
-- ---------------------------------------------------------------------
CREATE TYPE member_role AS ENUM ('Super Admin', 'Department Head', 'General User');

CREATE TABLE event_members (
    event_member_id BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role            member_role NOT NULL,
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    -- Super Admin rows may have a NULL department_id (cross-department access).
    -- Department Head / General User rows should always carry a department_id;
    -- enforce that at the application layer or via a CHECK constraint below.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id),
    CONSTRAINT chk_department_required
        CHECK (role = 'Super Admin' OR department_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------
CREATE TYPE task_priority AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE task_status   AS ENUM ('To Do', 'In Progress', 'Done');

CREATE TABLE tasks (
    task_id         BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    assignee_id     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    priority        task_priority NOT NULL DEFAULT 'Medium',
    status          task_status NOT NULL DEFAULT 'To Do',
    due_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_event ON tasks(event_id);
CREATE INDEX idx_tasks_department ON tasks(department_id);

-- ---------------------------------------------------------------------
-- SPONSORS + DELIVERABLES (deliverables are per-sponsor checklist items,
-- typically seeded from a tier default list at the application layer)
-- ---------------------------------------------------------------------
CREATE TYPE sponsor_tier   AS ENUM ('Title', 'Gold', 'Silver', 'Bronze');
CREATE TYPE sponsor_status AS ENUM ('Prospect', 'In Talks', 'Confirmed', 'Paid');

CREATE TABLE sponsors (
    sponsor_id      BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    tier            sponsor_tier NOT NULL DEFAULT 'Bronze',
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          sponsor_status NOT NULL DEFAULT 'Prospect',
    contact_email   VARCHAR(150),
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsors_event ON sponsors(event_id);

CREATE TABLE sponsor_deliverables (
    deliverable_id  BIGSERIAL PRIMARY KEY,
    sponsor_id      BIGINT NOT NULL REFERENCES sponsors(sponsor_id) ON DELETE CASCADE,
    description     VARCHAR(300) NOT NULL,
    is_delivered    BOOLEAN NOT NULL DEFAULT false,
    delivered_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliverables_sponsor ON sponsor_deliverables(sponsor_id);

-- Optional: default deliverable templates per tier, reusable across events
CREATE TABLE tier_deliverable_templates (
    template_id     BIGSERIAL PRIMARY KEY,
    tier            sponsor_tier NOT NULL,
    description     VARCHAR(300) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- ARTISTS
-- ---------------------------------------------------------------------
CREATE TYPE artist_status AS ENUM ('Inquiry', 'Negotiating', 'Confirmed', 'Contracted');

CREATE TABLE artists (
    artist_id       BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    genre           VARCHAR(100),
    fee             NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          artist_status NOT NULL DEFAULT 'Inquiry',
    performance_slot VARCHAR(100),          -- free text ("2026-10-04 20:00" or "TBD")
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_artists_event ON artists(event_id);

-- ---------------------------------------------------------------------
-- STALL MANAGEMENT
-- ---------------------------------------------------------------------
CREATE TYPE stall_category AS ENUM ('Sponsor Stall', 'Paid Stall', 'Promotional Stall', 'Experience Stall');
CREATE TYPE stall_status   AS ENUM ('Planned', 'Allotted', 'Setup In Progress', 'Live');

CREATE TABLE stalls (
    stall_id        BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,             -- stall number / label, e.g. "A1"
    category        stall_category NOT NULL,
    dimensions      VARCHAR(50),                      -- e.g. "10x10 ft"
    setup_budget    NUMERIC(12,2) NOT NULL DEFAULT 0,
    assigned_to     VARCHAR(150),                      -- sponsor or vendor name
    status          stall_status NOT NULL DEFAULT 'Planned',
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, name)                           -- stall numbers are unique per event
);
CREATE INDEX idx_stalls_event ON stalls(event_id);
CREATE INDEX idx_stalls_category ON stalls(category);

-- ---------------------------------------------------------------------
-- BUDGET LINES (one row per category, per event)
-- ---------------------------------------------------------------------
CREATE TYPE budget_type AS ENUM ('Income', 'Expense');

CREATE TABLE budget_lines (
    budget_line_id  BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    category        VARCHAR(100) NOT NULL,
    type            budget_type NOT NULL,
    budgeted        NUMERIC(12,2) NOT NULL DEFAULT 0,
    actual          NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, category)
);
CREATE INDEX idx_budget_lines_event ON budget_lines(event_id);

-- ---------------------------------------------------------------------
-- EXPENSE REQUESTS (2-level approval: Department Head -> Finance Head)
-- ---------------------------------------------------------------------
CREATE TYPE expense_status AS ENUM (
    'Pending Head Approval', 'Pending Finance Approval', 'Approved', 'Rejected'
);

CREATE TABLE expense_requests (
    expense_id          BIGSERIAL PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    budget_line_id       BIGINT NOT NULL REFERENCES budget_lines(budget_line_id) ON DELETE RESTRICT,
    description          VARCHAR(300),
    amount               NUMERIC(12,2) NOT NULL,
    department_id        BIGINT REFERENCES departments(department_id) ON DELETE SET NULL,
    submitted_by         BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    attachment_name       VARCHAR(255),          -- filename reference; actual file lives in object storage (S3 etc.)
    attachment_url        VARCHAR(500),
    status                expense_status NOT NULL DEFAULT 'Pending Head Approval',

    head_approved_by      BIGINT REFERENCES users(user_id),
    head_approved_at      TIMESTAMPTZ,

    finance_approved_by   BIGINT REFERENCES users(user_id),
    finance_approved_at   TIMESTAMPTZ,

    rejected_by           BIGINT REFERENCES users(user_id),
    rejection_stage        VARCHAR(30),           -- 'Department Head' or 'Finance Head'
    rejection_reason        VARCHAR(500),
    rejected_at             TIMESTAMPTZ,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_event ON expense_requests(event_id);
CREATE INDEX idx_expenses_status ON expense_requests(status);
CREATE INDEX idx_expenses_department ON expense_requests(department_id);

-- =====================================================================
-- TRIGGERS: keep updated_at fresh (Postgres example; repeat per table
-- or generalize with a single trigger function as below)
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_updated        BEFORE UPDATE ON events        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated         BEFORE UPDATE ON tasks         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sponsors_updated      BEFORE UPDATE ON sponsors      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_artists_updated       BEFORE UPDATE ON artists       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stalls_updated        BEFORE UPDATE ON stalls        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_budget_lines_updated  BEFORE UPDATE ON budget_lines  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_expenses_updated      BEFORE UPDATE ON expense_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- MIGRATION 002 — Phase 1 foundation (documents, notifications, comments, audit log)
-- =====================================================================
-- S3/R2 in prod — see backend/src/utils/storage.js) and rows here just
-- point at them, so the same table serves expense receipts, sponsor
-- contracts, artist riders, or anything else that needs a file.
-- ---------------------------------------------------------------------
CREATE TABLE documents (
    document_id     BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    entity_type     VARCHAR(30) NOT NULL,   -- 'expense' | 'sponsor' | 'artist' | 'task'
    entity_id       BIGINT NOT NULL,
    uploaded_by     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,  -- storage key/path, not a public URL
    mime_type       VARCHAR(120),
    size_bytes      BIGINT,
    label           VARCHAR(100),           -- e.g. 'Contract', 'Rider', 'Receipt' — free text, filterable
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_event ON documents(event_id);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — in-app notifications. No mailer is wired up (same gap
-- the original README flagged for teammate invites), so these surface
-- in-app for now; swap in a real provider (Postmark/SES/Resend) in
-- backend/src/utils/notify.js to also fan out to email/WhatsApp later.
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,   -- 'task_assigned' | 'expense_submitted' | 'expense_approved' | ...
    title           VARCHAR(200) NOT NULL,
    body            VARCHAR(500),
    link_entity_type VARCHAR(30),           -- lets the frontend deep-link, e.g. 'expense'
    link_entity_id  BIGINT,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_event ON notifications(event_id);

-- ---------------------------------------------------------------------
-- COMMENTS — lightweight activity feed / discussion thread, polymorphic
-- the same way documents are. Covers the "coordination context beyond a
-- title and due date" gap on tasks, sponsors, and artists.
-- ---------------------------------------------------------------------
CREATE TABLE comments (
    comment_id      BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       BIGINT NOT NULL,
    user_id         BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body            VARCHAR(2000) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- AUDIT_LOG — who changed what, when. Append-only, never updated or
-- deleted. `changes` stores a small before/after JSON diff, not a full
-- row dump, to keep entries readable.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    audit_id        BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    user_id         BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       BIGINT NOT NULL,
    action          VARCHAR(30) NOT NULL,   -- 'create' | 'update' | 'delete' | 'approve' | 'reject'
    changes         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_event ON audit_log(event_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- =====================================================================
-- MIGRATION 003 — Sponsor contract lifecycle + payment tracking
-- =====================================================================
-- =====================================================================

CREATE TABLE sponsor_contracts (
    contract_id             BIGSERIAL PRIMARY KEY,
    sponsor_id              BIGINT NOT NULL REFERENCES sponsors(sponsor_id) ON DELETE CASCADE,
    event_id                BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    document_id             BIGINT REFERENCES documents(document_id) ON DELETE SET NULL, -- the uploaded contract PDF
    status                  VARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft | Sent | Signed | Expired | Terminated
    start_date              DATE,
    end_date                DATE,
    signed_by_name          VARCHAR(150),
    signed_by_email         VARCHAR(150),
    signed_at               TIMESTAMPTZ,
    signature_ip            VARCHAR(50),
    renewed_from_contract_id BIGINT REFERENCES sponsor_contracts(contract_id) ON DELETE SET NULL,
    notes                   VARCHAR(1000),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_contracts_sponsor ON sponsor_contracts(sponsor_id);
CREATE INDEX idx_sponsor_contracts_event ON sponsor_contracts(event_id);
CREATE INDEX idx_sponsor_contracts_status ON sponsor_contracts(status);

CREATE TABLE sponsor_payments (
    payment_id      BIGSERIAL PRIMARY KEY,
    sponsor_id      BIGINT NOT NULL REFERENCES sponsors(sponsor_id) ON DELETE CASCADE,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    contract_id     BIGINT REFERENCES sponsor_contracts(contract_id) ON DELETE SET NULL,
    amount          NUMERIC(12,2) NOT NULL,
    due_date        DATE,
    paid_date       DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Paid | Waived
    method          VARCHAR(50),   -- Bank Transfer, UPI, Cheque, ...
    reference_note  VARCHAR(300),
    recorded_by     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_payments_sponsor ON sponsor_payments(sponsor_id);
CREATE INDEX idx_sponsor_payments_event ON sponsor_payments(event_id);
CREATE INDEX idx_sponsor_payments_status ON sponsor_payments(status);

-- Note: "Overdue" is not a stored status — it's computed at query time as
-- (status = 'Pending' AND due_date < today) in the API layer, since there's
-- no scheduler/cron in this app to flip a stored flag reliably.

-- =====================================================================
-- MIGRATION 004 — Artist travel logistics + payment/settlement tracking
-- =====================================================================
-- Run after 003_sponsor_contracts_payments.sql:
--   psql runway -f database/migrations/004_artist_travel_payments.sql
-- =====================================================================

CREATE TABLE artist_travel_legs (
    leg_id            BIGSERIAL PRIMARY KEY,
    artist_id         BIGINT NOT NULL REFERENCES artists(artist_id) ON DELETE CASCADE,
    event_id          BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    leg_type          VARCHAR(20) NOT NULL,   -- 'Flight' | 'Ground' | 'Hotel'
    description       VARCHAR(300),           -- e.g. "AI 502 BLR → MAA" or "Taj Coromandel, 2 nights"
    departure_at      TIMESTAMPTZ,
    arrival_at        TIMESTAMPTZ,
    location          VARCHAR(200),           -- pickup point / hotel address
    confirmation_ref  VARCHAR(100),
    notes             VARCHAR(500),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_artist_travel_artist ON artist_travel_legs(artist_id);
CREATE INDEX idx_artist_travel_event ON artist_travel_legs(event_id);

CREATE TABLE artist_payments (
    payment_id      BIGSERIAL PRIMARY KEY,
    artist_id       BIGINT NOT NULL REFERENCES artists(artist_id) ON DELETE CASCADE,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    kind            VARCHAR(20) NOT NULL DEFAULT 'Balance', -- 'Deposit' | 'Balance' | 'Full'
    amount          NUMERIC(12,2) NOT NULL,
    due_date        DATE,
    paid_date       DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Paid
    method          VARCHAR(50),
    reference_note  VARCHAR(300),
    recorded_by     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_artist_payments_artist ON artist_payments(artist_id);
CREATE INDEX idx_artist_payments_event ON artist_payments(event_id);
CREATE INDEX idx_artist_payments_status ON artist_payments(status);

-- =====================================================================
-- MIGRATION 005 — Expense policy rules
-- =====================================================================
-- =====================================================================

ALTER TABLE expense_requests ADD COLUMN is_policy_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expense_requests ADD COLUMN policy_note VARCHAR(300);

CREATE TABLE expense_policies (
    policy_id       BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    department_id   BIGINT REFERENCES departments(department_id) ON DELETE CASCADE, -- NULL = every department
    category        VARCHAR(100),          -- NULL = every category; matches budget_lines.category by name
    max_amount      NUMERIC(12,2) NOT NULL,
    created_by      BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_policies_event ON expense_policies(event_id);
