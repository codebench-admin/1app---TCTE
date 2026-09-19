import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { resolveDepartmentId } from '../utils/departments.js';
import { logAudit } from '../utils/audit.js';
import { notify } from '../utils/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

async function resolveAssigneeId(eventId, assigneeName) {
  if (!assigneeName) return null;
  const u = await pool.query(
    `SELECT u.user_id FROM users u JOIN event_members em ON em.user_id=u.user_id
     WHERE em.event_id=$1 AND u.name=$2 LIMIT 1`,
    [eventId, assigneeName]
  );
  return u.rows[0]?.user_id || null;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.task_id, t.title, u.name AS assignee, d.name AS department, t.priority, t.status, t.due_date
       FROM tasks t
       LEFT JOIN users u ON u.user_id = t.assignee_id
       LEFT JOIN departments d ON d.department_id = t.department_id
       WHERE t.event_id=$1 ORDER BY t.created_at DESC`,
      [req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.task_id, title: r.title, assignee: r.assignee, department: r.department,
      priority: r.priority, status: r.status, due: r.due_date,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, assignee, department, priority, status, due } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only add items to your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    const assigneeId = await resolveAssigneeId(req.params.eventId, assignee);
    const { rows } = await pool.query(
      `INSERT INTO tasks (event_id, title, assignee_id, department_id, priority, status, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING task_id`,
      [req.params.eventId, title, assigneeId, departmentId, priority || 'Medium', status || 'To Do', due || null]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'task',
      entityId: rows[0].task_id, action: 'create', changes: { title, assignee, priority, status, due },
    });
    if (assigneeId && assigneeId !== req.userId) {
      await notify({
        eventId: req.params.eventId, userId: assigneeId, type: 'task_assigned',
        title: `New task: ${title}`, body: due ? `Due ${due}` : null,
        linkEntityType: 'task', linkEntityId: rows[0].task_id,
      });
    }
    res.status(201).json({ id: rows[0].task_id });
  } catch (e) { next(e); }
});

router.put('/:taskId', async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT d.name AS department FROM tasks t LEFT JOIN departments d ON d.department_id=t.department_id
       WHERE t.task_id=$1 AND t.event_id=$2`,
      [req.params.taskId, req.params.eventId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!canEditDepartment(req.membership, existing.rows[0].department)) {
      return res.status(403).json({ error: 'Not allowed to edit this item' });
    }
    const { title, assignee, department, priority, status, due } = req.body;
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only move items within your own department' });
    }
    const departmentId = await resolveDepartmentId(req.params.eventId, department);
    const assigneeId = await resolveAssigneeId(req.params.eventId, assignee);
    const before = await pool.query('SELECT assignee_id, status FROM tasks WHERE task_id=$1', [req.params.taskId]);
    await pool.query(
      `UPDATE tasks SET title=$1, assignee_id=$2, department_id=$3, priority=$4, status=$5, due_date=$6, updated_at=now()
       WHERE task_id=$7 AND event_id=$8`,
      [title, assigneeId, departmentId, priority, status, due || null, req.params.taskId, req.params.eventId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'task', entityId: req.params.taskId,
      action: 'update', changes: { status: [before.rows[0]?.status, status] },
    });
    if (assigneeId && assigneeId !== before.rows[0]?.assignee_id && assigneeId !== req.userId) {
      await notify({
        eventId: req.params.eventId, userId: assigneeId, type: 'task_assigned',
        title: `Task assigned to you: ${title}`, body: due ? `Due ${due}` : null,
        linkEntityType: 'task', linkEntityId: req.params.taskId,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:taskId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    await pool.query('DELETE FROM tasks WHERE task_id=$1 AND event_id=$2', [req.params.taskId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
