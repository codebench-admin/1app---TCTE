import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

const ALLOWED_ENTITY_TYPES = ['task', 'sponsor', 'artist', 'expense'];

router.get('/', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }
    const { rows } = await pool.query(
      `SELECT c.comment_id, c.body, c.created_at, u.name AS author
       FROM comments c JOIN users u ON u.user_id = c.user_id
       WHERE c.event_id=$1 AND c.entity_type=$2 AND c.entity_id=$3
       ORDER BY c.created_at ASC`,
      [req.params.eventId, entityType, entityId]
    );
    res.json(rows.map(r => ({ id: r.comment_id, body: r.body, author: r.author, createdAt: r.created_at })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { entityType, entityId, body } = req.body;
    if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    const { rows } = await pool.query(
      `INSERT INTO comments (event_id, entity_type, entity_id, user_id, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING comment_id, created_at`,
      [req.params.eventId, entityType, entityId, req.userId, body.trim()]
    );
    res.status(201).json({ id: rows[0].comment_id, createdAt: rows[0].created_at });
  } catch (e) { next(e); }
});

router.delete('/:commentId', async (req, res, next) => {
  try {
    const existing = await pool.query('SELECT user_id FROM comments WHERE comment_id=$1 AND event_id=$2', [req.params.commentId, req.params.eventId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const isOwner = existing.rows[0].user_id === req.userId;
    if (!isOwner && req.membership.role !== 'Super Admin') {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }
    await pool.query('DELETE FROM comments WHERE comment_id=$1', [req.params.commentId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
