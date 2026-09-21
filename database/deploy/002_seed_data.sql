-- =====================================================================
-- OPTIONAL demo seed data — mirrors the app's original demo content.
--
-- DO NOT run this against your real production database. The three user
-- rows below have '<bcrypt-hash>' as a literal string, not a real hash —
-- login will simply fail for them until you either:
--   (a) skip this file entirely and create your first real Super Admin
--       through the app's own signup/invite flow, or
--   (b) generate real bcrypt hashes and replace the placeholders before
--       running this.
-- This file exists only so a fresh clone has something to click through
-- locally. Run after 001_full_schema.sql:
--   psql "$DATABASE_URL" -f database/deploy/002_seed_data.sql
-- =====================================================================

INSERT INTO events (event_name, event_date, venue) VALUES
    ('Chennai Music Fest 2026', '2026-10-04', 'YMCA Grounds, Chennai');

INSERT INTO departments (event_id, name)
SELECT event_id, d FROM events, UNNEST(ARRAY[
    'Production', 'Artist Relations', 'Sponsorship', 'Marketing', 'Logistics', 'Finance', 'Volunteers'
]) AS d
WHERE event_name = 'Chennai Music Fest 2026';

-- Replace '<bcrypt-hash>' with a real bcrypt hash before running, or skip
-- this INSERT and create your first user through the app instead.
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
