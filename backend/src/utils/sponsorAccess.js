import { pool } from '../db.js';

// Contracts and payments hang off a sponsor, and inherit that sponsor's
// department for permission checks (same rule sponsors.js already uses) —
// this avoids re-deriving it in every nested route file.
export async function getSponsorDepartment(eventId, sponsorId) {
  const { rows } = await pool.query(
    `SELECT d.name AS department FROM sponsors s
     LEFT JOIN departments d ON d.department_id = s.department_id
     WHERE s.sponsor_id=$1 AND s.event_id=$2`,
    [sponsorId, eventId]
  );
  return rows.length ? rows[0].department : undefined; // undefined = sponsor not found
}
