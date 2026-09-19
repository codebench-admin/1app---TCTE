import { pool } from '../db.js';

// Departments are normalized per event. This resolves a department NAME
// (as the UI works with) to its department_id, creating the row the first
// time a new department name is used for that event.
export async function resolveDepartmentId(eventId, name, clientOrPool = pool) {
  if (!name) return null;
  const existing = await clientOrPool.query(
    'SELECT department_id FROM departments WHERE event_id=$1 AND name=$2',
    [eventId, name]
  );
  if (existing.rows.length) return existing.rows[0].department_id;
  const created = await clientOrPool.query(
    'INSERT INTO departments (event_id, name) VALUES ($1,$2) RETURNING department_id',
    [eventId, name]
  );
  return created.rows[0].department_id;
}
