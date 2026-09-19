import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { getArtistDepartment } from '../utils/artistAccess.js';
import { logAudit } from '../utils/audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

const LEG_TYPES = ['Flight', 'Ground', 'Hotel'];

router.get('/', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    const { rows } = await pool.query(
      `SELECT leg_id, leg_type, description, departure_at, arrival_at, location, confirmation_ref, notes
       FROM artist_travel_legs WHERE artist_id=$1 AND event_id=$2
       ORDER BY COALESCE(departure_at, created_at)`,
      [req.params.artistId, req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.leg_id, type: r.leg_type, description: r.description,
      departureAt: r.departure_at, arrivalAt: r.arrival_at, location: r.location,
      confirmationRef: r.confirmation_ref, notes: r.notes,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this artist' });

    const { type, description, departureAt, arrivalAt, location, confirmationRef, notes } = req.body;
    if (!type || !LEG_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${LEG_TYPES.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO artist_travel_legs (artist_id, event_id, leg_type, description, departure_at, arrival_at, location, confirmation_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING leg_id`,
      [req.params.artistId, req.params.eventId, type, description || null, departureAt || null, arrivalAt || null,
       location || null, confirmationRef || null, notes || null]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'artist_travel_leg',
      entityId: rows[0].leg_id, action: 'create', changes: { artistId: req.params.artistId, type },
    });
    res.status(201).json({ id: rows[0].leg_id });
  } catch (e) { next(e); }
});

router.put('/:legId', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this artist' });

    const existing = await pool.query('SELECT leg_id FROM artist_travel_legs WHERE leg_id=$1 AND artist_id=$2', [req.params.legId, req.params.artistId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const { type, description, departureAt, arrivalAt, location, confirmationRef, notes } = req.body;
    if (type && !LEG_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${LEG_TYPES.join(', ')}` });
    await pool.query(
      `UPDATE artist_travel_legs SET leg_type=COALESCE($1,leg_type), description=$2, departure_at=$3, arrival_at=$4,
       location=$5, confirmation_ref=$6, notes=$7, updated_at=now() WHERE leg_id=$8`,
      [type || null, description || null, departureAt || null, arrivalAt || null, location || null,
       confirmationRef || null, notes || null, req.params.legId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:legId', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this artist' });
    await pool.query('DELETE FROM artist_travel_legs WHERE leg_id=$1 AND artist_id=$2', [req.params.legId, req.params.artistId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
