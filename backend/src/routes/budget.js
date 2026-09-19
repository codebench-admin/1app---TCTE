import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT budget_line_id, category, type, budgeted, actual FROM budget_lines WHERE event_id=$1 ORDER BY created_at',
      [req.params.eventId]
    );
    res.json(rows.map(r => ({ id: r.budget_line_id, category: r.category, type: r.type, budgeted: r.budgeted, actual: r.actual })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { category, type, budgeted, actual } = req.body;
    if (!category) return res.status(400).json({ error: 'category is required' });
    const { rows } = await pool.query(
      `INSERT INTO budget_lines (event_id, category, type, budgeted, actual) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (event_id, category) DO UPDATE SET type=$3, budgeted=$4, actual=$5, updated_at=now()
       RETURNING budget_line_id`,
      [req.params.eventId, category, type || 'Expense', budgeted || 0, actual || 0]
    );
    res.status(201).json({ id: rows[0].budget_line_id });
  } catch (e) { next(e); }
});

router.put('/:lineId', async (req, res, next) => {
  try {
    const { category, type, budgeted, actual } = req.body;
    await pool.query(
      'UPDATE budget_lines SET category=$1, type=$2, budgeted=$3, actual=$4, updated_at=now() WHERE budget_line_id=$5 AND event_id=$6',
      [category, type, budgeted, actual, req.params.lineId, req.params.eventId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:lineId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete budget lines' });
    await pool.query('DELETE FROM budget_lines WHERE budget_line_id=$1 AND event_id=$2', [req.params.lineId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
