import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Loads the requester's membership (role + department) for :eventId and
// attaches it as req.membership. Must run after requireAuth.
export function requireEventMember(pool) {
  return async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      const { rows } = await pool.query(
        `SELECT em.role, em.department_id, d.name AS department
         FROM event_members em
         LEFT JOIN departments d ON d.department_id = em.department_id
         WHERE em.event_id = $1 AND em.user_id = $2`,
        [eventId, req.userId]
      );
      if (rows.length === 0) return res.status(403).json({ error: 'Not a member of this event' });
      req.membership = rows[0];
      next();
    } catch (e) { next(e); }
  };
}
