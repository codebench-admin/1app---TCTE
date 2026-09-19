import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// List events the current user belongs to, with their role/department on each
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.event_id, e.event_name, e.event_date, e.venue, em.role, d.name AS department
       FROM event_members em
       JOIN events e ON e.event_id = em.event_id
       LEFT JOIN departments d ON d.department_id = em.department_id
       WHERE em.user_id = $1
       ORDER BY e.event_date`,
      [req.userId]
    );
    res.json(rows.map(r => ({
      id: r.event_id, name: r.event_name, date: r.event_date, venue: r.venue,
      role: r.role, department: r.department,
    })));
  } catch (e) { next(e); }
});

// Create a new event — creator becomes its Super Admin, standard departments seeded
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, date, venue } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date are required' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO events (event_name, event_date, venue) VALUES ($1,$2,$3) RETURNING event_id, event_name, event_date, venue',
      [name, date, venue || null]
    );
    const event = rows[0];
    await client.query(
      `INSERT INTO event_members (event_id, user_id, role) VALUES ($1,$2,'Super Admin')`,
      [event.event_id, req.userId]
    );
    const defaults = ['Production', 'Artist Relations', 'Sponsorship', 'Marketing', 'Logistics', 'Finance', 'Volunteers'];
    for (const d of defaults) {
      await client.query('INSERT INTO departments (event_id, name) VALUES ($1,$2)', [event.event_id, d]);
    }
    await client.query('COMMIT');
    res.status(201).json({
      id: event.event_id, name: event.event_name, date: event.event_date, venue: event.venue, role: 'Super Admin',
    });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.get('/:eventId/departments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT department_id, name FROM departments WHERE event_id=$1 ORDER BY name',
      [req.params.eventId]
    );
    res.json(rows.map(r => ({ id: r.department_id, name: r.name })));
  } catch (e) { next(e); }
});

export default router;
