import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT user_id, name, email FROM users WHERE user_id=$1', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ id: rows[0].user_id, name: rows[0].name, email: rows[0].email });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id=$1', [req.userId]);
    const user = rows[0];

    if (email && email.toLowerCase() !== user.email) {
      const dupe = await pool.query('SELECT user_id FROM users WHERE email=$1 AND user_id<>$2', [email.toLowerCase(), req.userId]);
      if (dupe.rows.length) return res.status(409).json({ error: 'Another account already uses this email' });
    }

    let passwordHash = user.password_hash;
    if (currentPassword || newPassword) {
      const ok = await bcrypt.compare(currentPassword || '', user.password_hash);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
      if (!newPassword) return res.status(400).json({ error: 'Enter a new password' });
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const { rows: updated } = await pool.query(
      'UPDATE users SET name=$1, email=$2, password_hash=$3, updated_at=now() WHERE user_id=$4 RETURNING user_id, name, email',
      [name || user.name, (email || user.email).toLowerCase(), passwordHash, req.userId]
    );
    res.json({ id: updated[0].user_id, name: updated[0].name, email: updated[0].email });
  } catch (e) { next(e); }
});

export default router;
