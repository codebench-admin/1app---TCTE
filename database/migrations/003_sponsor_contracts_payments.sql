-- =====================================================================
-- MIGRATION 003 — Sponsor contract lifecycle + payment tracking
--
-- Closes the two biggest gaps vs. sponsorship CRMs (KORE, SponsorFlo,
-- Sponsorworks): a sponsor row today is just name/tier/amount/status with
-- no contract record and no way to track partial payments. This adds:
--   • sponsor_contracts — versioned contract records with a lightweight
--     e-signature (typed name + timestamp + IP, not a DocuSign-grade
--     legal signature — call out that limitation to sponsors if it
--     matters for your paperwork) and renewal chaining.
--   • sponsor_payments  — installments against a sponsor's total amount,
--     so "Paid" stops being one boolean and becomes a real ledger.
--
-- Run after 002_phase1_foundation.sql (contracts reference documents):
--   psql runway -f database/migrations/003_sponsor_contracts_payments.sql
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
