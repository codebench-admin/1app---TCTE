-- =====================================================================
-- MIGRATION 002 — Phase 1 foundation for CRM/ERP-parity features
--
-- Adds four generic, cross-cutting tables instead of one-off columns on
-- each entity, because file storage, notifications, comments, and an
-- audit trail are needed by every module (sponsors, artists, expenses,
-- tasks), not just one. Later phases (sponsor contracts, artist riders,
-- accounting export, reporting) build on top of these.
--
-- Run after schema.sql:
--   psql runway -f database/migrations/002_phase1_foundation.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- DOCUMENTS — generic file attachments, polymorphic via entity_type.
-- Replaces the old expense_requests.attachment_name/url string-only
-- stub. Backend stores the actual bytes (local disk in dev, swap for
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
