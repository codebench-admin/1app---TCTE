import { pool } from '../db.js';

// Mirrors sponsorAccess.js — travel legs and payments hang off an artist
// and inherit that artist's department for permission checks.
export async function getArtistDepartment(eventId, artistId) {
  const { rows } = await pool.query(
    `SELECT d.name AS department FROM artists a
     LEFT JOIN departments d ON d.department_id = a.department_id
     WHERE a.artist_id=$1 AND a.event_id=$2`,
    [artistId, eventId]
  );
  return rows.length ? rows[0].department : undefined; // undefined = artist not found
}
