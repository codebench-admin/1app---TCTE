import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { resolveDepartmentId } from '../utils/departments.js';
import { logAudit } from '../utils/audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

// Only Super Admin or the Finance department head can set spend policy —
// same authority level as final expense approval.
function canManagePolicies(membership) {
  return membership.role === 'Super Admin' || (membership.role === 'Department Head' && membership.department === 'Finance');
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.policy_id, p.category, p.max_amount, p.created_at, d.name AS department
       FROM expense_policies p LEFT JOIN departments d ON d.department_id = p.department_id
       WHERE p.event_id=$1 ORDER BY p.created_at DESC`,
      [req.params.eventId]
    );
    res.json(rows.map(r => ({ id: r.policy_id, department: r.department, category: r.category, maxAmount: r.max_amount, createdAt: r.created_at })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!canManagePolicies(req.membership)) return res.status(403).json({ error: 'Only Finance or a Super Admin can set spend policy' });
    const { department, category, maxAmount } = req.body;
    if (!maxAmount) return res.status(400).json({ error: 'maxAmount is required' });
    const departmentId = await resolveDepartmentId(req.params.eventId, department || null);
    const { rows } = await pool.query(
      `INSERT INTO expense_policies (event_id, department_id, category, max_amount, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING policy_id`,
      [req.params.eventId, departmentId, category || null, maxAmount, req.userId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'expense_policy',
      entityId: rows[0].policy_id, action: 'create', changes: { department, category, maxAmount },
    });
    res.status(201).json({ id: rows[0].policy_id });
  } catch (e) { next(e); }
});

router.delete('/:policyId', async (req, res, next) => {
  try {
    if (!canManagePolicies(req.membership)) return res.status(403).json({ error: 'Only Finance or a Super Admin can remove spend policy' });
    await pool.query('DELETE FROM expense_policies WHERE policy_id=$1 AND event_id=$2', [req.params.policyId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
