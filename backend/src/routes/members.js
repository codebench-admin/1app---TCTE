import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT em.event_member_id, u.user_id, u.name, u.email, em.role, d.name AS department
       FROM event_members em
       JOIN users u ON u.user_id = em.user_id
       LEFT JOIN departments d ON d.department_id = em.department_id
       WHERE em.event_id = $1 ORDER BY u.name`,
      [req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.event_member_id, userId: r.user_id, name: r.name, email: r.email, role: r.role, department: r.department,
    })));
  } catch (e) { next(e); }
});

// Super Admin adds a teammate by email. If no account exists for that email
// yet, one is created with a random temporary password, returned ONCE here
// so the admin can share it out of band (no email-sending infra wired up).
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can add teammates' });
    const { name, email, role, department } = req.body;
    if (!name || !email || !role) return res.status(400).json({ error: 'name, email, and role are required' });

    await client.query('BEGIN');
    let tempPassword = null;
    let userRow;
    const existing = await client.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) {
      userRow = existing.rows[0];
    } else {
      tempPassword = Math.random().toString(36).slice(2, 10);
      const hash = await bcrypt.hash(tempPassword, 10);
      const created = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *',
        [name, email.toLowerCase(), hash]
      );
      userRow = created.rows[0];
    }

    let departmentId = null;
    if (department) {
      const d = await client.query('SELECT department_id FROM departments WHERE event_id=$1 AND name=$2', [req.params.eventId, department]);
      departmentId = d.rows[0]
        ? d.rows[0].department_id
        : (await client.query(
            'INSERT INTO departments (event_id, name) VALUES ($1,$2) RETURNING department_id',
            [req.params.eventId, department]
          )).rows[0].department_id;
    }

    const member = await client.query(
      `INSERT INTO event_members (event_id, user_id, role, department_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (event_id, user_id) DO UPDATE SET role=$3, department_id=$4
       RETURNING event_member_id`,
      [req.params.eventId, userRow.user_id, role, departmentId]
    );
    await client.query('COMMIT');
    res.status(201).json({
      id: member.rows[0].event_member_id, userId: userRow.user_id, name: userRow.name, email: userRow.email,
      role, department: department || null, tempPassword,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.patch('/:memberId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can edit teammates' });
    const { role, department } = req.body;
    let departmentId = null;
    if (department) {
      const d = await pool.query('SELECT department_id FROM departments WHERE event_id=$1 AND name=$2', [req.params.eventId, department]);
      departmentId = d.rows[0]
        ? d.rows[0].department_id
        : (await pool.query(
            'INSERT INTO departments (event_id, name) VALUES ($1,$2) RETURNING department_id',
            [req.params.eventId, department]
          )).rows[0].department_id;
    }
    await pool.query(
      'UPDATE event_members SET role=COALESCE($1,role), department_id=$2 WHERE event_member_id=$3 AND event_id=$4',
      [role, departmentId, req.params.memberId, req.params.eventId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:memberId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can remove teammates' });
    await pool.query('DELETE FROM event_members WHERE event_member_id=$1 AND event_id=$2', [req.params.memberId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
