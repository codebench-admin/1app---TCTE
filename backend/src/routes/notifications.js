import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

// A user only ever sees their own notifications — no department scoping
// needed here since notifications are already targeted at one user_id.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT notification_id, type, title, body, link_entity_type, link_entity_id, is_read, created_at
       FROM notifications WHERE event_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [req.params.eventId, req.userId]
    );
    res.json(rows.map(r => ({
      id: r.notification_id, type: r.type, title: r.title, body: r.body,
      linkEntityType: r.link_entity_type, linkEntityId: r.link_entity_id,
      isRead: r.is_read, createdAt: r.created_at,
    })));
  } catch (e) { next(e); }
});

router.patch('/:notificationId/read', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read=true WHERE notification_id=$1 AND event_id=$2 AND user_id=$3',
      [req.params.notificationId, req.params.eventId, req.userId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read=true WHERE event_id=$1 AND user_id=$2 AND is_read=false',
      [req.params.eventId, req.userId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
