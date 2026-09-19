-- =====================================================================
-- MIGRATION 004 — Artist travel logistics + payment/settlement tracking
--
-- Riders and contracts for artists deliberately do NOT get a new table
-- here — they're just documents (entity_type='artist', label='Technical
-- Rider' / 'Hospitality Rider' / 'Contract') using the generic table from
-- 002_phase1_foundation.sql. That's what it was built for.
--
-- What's new:
--   • artist_travel_legs — flights/ground transport/hotel bookings per
--     artist, closing the "travel/accommodation logistics" gap.
--   • artist_payments — deposit-vs-balance settlement tracking, mirroring
--     sponsor_payments' shape. Kept as its own table rather than
--     generalizing sponsor_payments into a polymorphic one, to avoid a
--     schema migration on an already-shipped Phase 2 table; a future
--     cleanup could merge both into one `payments` table keyed by
--     entity_type if that duplication starts to hurt.
--
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
