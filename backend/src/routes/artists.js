import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { resolveDepartmentId } from '../utils/departments.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

async function loadDocumentCounts(artistIds) {
  if (!artistIds.length) return {};
  const { rows } = await pool.query(
    `SELECT entity_id, COUNT(*) AS n FROM documents WHERE entity_type='artist' AND entity_id = ANY($1::bigint[])
     GROUP BY entity_id`,
    [artistIds]
  );
  const map = {};
  for (const r of rows) map[r.entity_id] = Number(r.n);
  return map;
}

async function loadPaidTotals(artistIds) {
  if (!artistIds.length) return {};
  const { rows } = await pool.query(
    `SELECT artist_id, COALESCE(SUM(amount),0) AS total FROM artist_payments
     WHERE artist_id = ANY($1::bigint[]) AND status='Paid' GROUP BY artist_id`,
    [artistIds]
  );
  const map = {};
  for (const r of rows) map[r.artist_id] = Number(r.total);
  return map;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.artist_id, a.name, a.genre, a.fee, a.status, a.performance_slot, d.name AS department
       FROM artists a LEFT JOIN departments d ON d.department_id=a.department_id
       WHERE a.event_id=$1 ORDER BY a.created_at DESC`,
      [req.params.eventId]
    );
    const artistIds = rows.map(r => r.artist_id);
    const docCounts = await loadDocumentCounts(artistIds);
    const paidMap = await loadPaidTotals(artistIds);
    res.json(rows.map(r => ({
      id: r.artist_id, name: r.name, genre: r.genre, fee: r.fee, status: r.status,
      slot: r.performance_slot, department: r.department,
      documentCount: docCounts[r.artist_id] || 0,
      amountPaid: paidMap[r.artist_id] || 0,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, genre, fee, status, slot, department } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only add items to your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    const { rows } = await pool.query(
      `INSERT INTO artists (event_id, name, genre, fee, status, performance_slot, department_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING artist_id`,
      [req.params.eventId, name, genre || null, fee || 0, status || 'Inquiry', slot || null, departmentId]
    );
    res.status(201).json({ id: rows[0].artist_id });
  } catch (e) { next(e); }
});

router.put('/:artistId', async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT d.name AS department FROM artists a LEFT JOIN departments d ON d.department_id=a.department_id
       WHERE a.artist_id=$1 AND a.event_id=$2`,
      [req.params.artistId, req.params.eventId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!canEditDepartment(req.membership, existing.rows[0].department)) {
      return res.status(403).json({ error: 'Not allowed to edit this item' });
    }
    const { name, genre, fee, status, slot, department } = req.body;
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only move items within your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    await pool.query(
      `UPDATE artists SET name=$1, genre=$2, fee=$3, status=$4, performance_slot=$5, department_id=$6, updated_at=now()
       WHERE artist_id=$7 AND event_id=$8`,
      [name, genre, fee, status, slot, departmentId, req.params.artistId, req.params.eventId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:artistId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    await pool.query('DELETE FROM artists WHERE artist_id=$1 AND event_id=$2', [req.params.artistId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
