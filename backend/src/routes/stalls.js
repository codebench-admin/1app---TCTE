import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { resolveDepartmentId } from '../utils/departments.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.stall_id, st.name, st.category, st.dimensions, st.setup_budget, st.assigned_to, st.status, d.name AS department
       FROM stalls st LEFT JOIN departments d ON d.department_id=st.department_id
       WHERE st.event_id=$1 ORDER BY st.created_at DESC`,
      [req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.stall_id, name: r.name, category: r.category, dimensions: r.dimensions,
      setupBudget: r.setup_budget, assignedTo: r.assigned_to, status: r.status, department: r.department,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, category, dimensions, setupBudget, assignedTo, status, department } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name and category are required' });
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only add items to your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    const { rows } = await pool.query(
      `INSERT INTO stalls (event_id, name, category, dimensions, setup_budget, assigned_to, status, department_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING stall_id`,
      [req.params.eventId, name, category, dimensions || null, setupBudget || 0, assignedTo || null, status || 'Planned', departmentId]
    );
    res.status(201).json({ id: rows[0].stall_id });
  } catch (e) { next(e); }
});

router.put('/:stallId', async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT d.name AS department FROM stalls st LEFT JOIN departments d ON d.department_id=st.department_id
       WHERE st.stall_id=$1 AND st.event_id=$2`,
      [req.params.stallId, req.params.eventId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!canEditDepartment(req.membership, existing.rows[0].department)) {
      return res.status(403).json({ error: 'Not allowed to edit this item' });
    }
    const { name, category, dimensions, setupBudget, assignedTo, status, department } = req.body;
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only move items within your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    await pool.query(
      `UPDATE stalls SET name=$1, category=$2, dimensions=$3, setup_budget=$4, assigned_to=$5, status=$6, department_id=$7, updated_at=now()
       WHERE stall_id=$8 AND event_id=$9`,
      [name, category, dimensions, setupBudget, assignedTo, status, departmentId, req.params.stallId, req.params.eventId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:stallId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    await pool.query('DELETE FROM stalls WHERE stall_id=$1 AND event_id=$2', [req.params.stallId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
