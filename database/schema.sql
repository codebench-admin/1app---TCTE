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
-- EXAMPLE SEED DATA (mirrors the app's demo data — remove in production)
-- =====================================================================
INSERT INTO events (event_name, event_date, venue) VALUES
    ('Chennai Music Fest 2026', '2026-10-04', 'YMCA Grounds, Chennai');

INSERT INTO departments (event_id, name)
SELECT event_id, d FROM events, UNNEST(ARRAY[
    'Production', 'Artist Relations', 'Sponsorship', 'Marketing', 'Logistics', 'Finance', 'Volunteers'
]) AS d
WHERE event_name = 'Chennai Music Fest 2026';

INSERT INTO users (name, email, password_hash) VALUES
    ('Karthik', 'karthik@runway.app', '<bcrypt-hash>'),
    ('Priya',   'priya@runway.app',   '<bcrypt-hash>'),
    ('Meena',   'meena@runway.app',   '<bcrypt-hash>');

INSERT INTO event_members (event_id, user_id, role, department_id)
SELECT e.event_id, u.user_id, 'Super Admin', NULL
FROM events e, users u
WHERE e.event_name = 'Chennai Music Fest 2026' AND u.email = 'karthik@runway.app';

INSERT INTO event_members (event_id, user_id, role, department_id)
SELECT e.event_id, u.user_id, 'Department Head', d.department_id
FROM events e, users u, departments d
WHERE e.event_name = 'Chennai Music Fest 2026'
  AND u.email = 'priya@runway.app'
  AND d.event_id = e.event_id AND d.name = 'Artist Relations';

-- =====================================================================
-- EXAMPLE QUERY: everything for one event, looked up purely by its
-- unique event_name (the pattern the whole app is built around)
-- =====================================================================
-- SELECT t.* FROM tasks t
-- JOIN events e ON e.event_id = t.event_id
-- WHERE e.event_name = 'Chennai Music Fest 2026';
