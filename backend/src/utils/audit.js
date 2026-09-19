import { pool } from '../db.js';

// Records one audit_log row. Pass a `client` (from pool.connect()) when
// called inside a transaction so the audit entry commits/rolls back with
// the rest of the write; otherwise it uses the shared pool.
//
// `changes` should be a small before/after diff, e.g. { amount: [500, 750] },
// not a full row dump — keep entries something a human can actually read.
export async function logAudit(
  { eventId, userId, entityType, entityId, action, changes },
  client = pool
) {
  await client.query(
    `INSERT INTO audit_log (event_id, user_id, entity_type, entity_id, action, changes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [eventId, userId || null, entityType, entityId, action, changes ? JSON.stringify(changes) : null]
  );
}
