-- =====================================================================
-- MIGRATION 005 — Expense policy rules
--
-- Adds threshold-based auto-flagging: a policy sets a max amount for a
-- department and/or category, and any expense submitted over that limit
-- is flagged (is_policy_flagged) with a note, and Finance is notified
-- immediately rather than waiting for the normal two-stage approval to
-- reach them. This does NOT block submission or auto-reject — it adds
-- visibility, matching how Ramp/Concur "policy enforcement" surfaces
-- violations for review rather than silently rejecting them.
--
-- Run after 004_artist_travel_payments.sql:
--   psql runway -f database/migrations/005_expense_policies.sql
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
