import { pool } from '../db.js';

// Creates one in-app notification. No email/SMS/WhatsApp provider is
// wired up yet (same gap as teammate invites in members.js) — this is
// the single choke point to add that later without touching every
// route that calls notify().
export async function notify(
  { eventId, userId, type, title, body, linkEntityType, linkEntityId },
  client = pool
) {
  await client.query(
    `INSERT INTO notifications (event_id, user_id, type, title, body, link_entity_type, link_entity_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [eventId, userId, type, title, body || null, linkEntityType || null, linkEntityId || null]
  );
}

// Notifies every event member holding a given role (optionally scoped to
// one department) — e.g. "everyone who is Department Head of Finance".
export async function notifyByRole(
  { eventId, role, department, type, title, body, linkEntityType, linkEntityId },
  client = pool
) {
  const { rows } = await client.query(
    `SELECT em.user_id FROM event_members em
     LEFT JOIN departments d ON d.department_id = em.department_id
     WHERE em.event_id=$1 AND em.role=$2 AND ($3::varchar IS NULL OR d.name = $3)`,
    [eventId, role, department || null]
  );
  for (const r of rows) {
    await notify({ eventId, userId: r.user_id, type, title, body, linkEntityType, linkEntityId }, client);
  }
}
