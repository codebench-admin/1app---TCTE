import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { getArtistDepartment } from '../utils/artistAccess.js';
import { logAudit } from '../utils/audit.js';
import { notifyByRole } from '../utils/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

const KINDS = ['Deposit', 'Balance', 'Full'];

function withComputedFields(r) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = r.status === 'Pending' && r.due_date && r.due_date.toISOString().slice(0, 10) < today;
  return {
    id: r.payment_id, kind: r.kind, amount: r.amount, dueDate: r.due_date, paidDate: r.paid_date,
    status: r.status, method: r.method, referenceNote: r.reference_note,
    recordedBy: r.recorded_by_name, createdAt: r.created_at, overdue,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS recorded_by_name FROM artist_payments p
       LEFT JOIN users u ON u.user_id = p.recorded_by
       WHERE p.artist_id=$1 AND p.event_id=$2 ORDER BY p.due_date NULLS LAST, p.created_at`,
      [req.params.artistId, req.params.eventId]
    );
    const items = rows.map(withComputedFields);
    const totalScheduled = items.reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = items.filter(p => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0);
    res.json({ items, summary: { totalScheduled, totalPaid, outstanding: totalScheduled - totalPaid } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this artist' });

    const { kind, amount, dueDate, referenceNote } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO artist_payments (artist_id, event_id, kind, amount, due_date, reference_note, recorded_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending') RETURNING payment_id`,
      [req.params.artistId, req.params.eventId, kind || 'Balance', amount, dueDate || null, referenceNote || null, req.userId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'artist_payment',
      entityId: rows[0].payment_id, action: 'create', changes: { amount, kind: kind || 'Balance' },
    });
    await notifyByRole({
      eventId: req.params.eventId, role: 'Department Head', department: 'Finance',
      type: 'artist_payment_scheduled', title: `Artist ${kind || 'Balance'} payment scheduled: ₹${amount}`,
      body: dueDate ? `Due ${dueDate}` : null, linkEntityType: 'artist', linkEntityId: req.params.artistId,
    });
    res.status(201).json({ id: rows[0].payment_id });
  } catch (e) { next(e); }
});

router.patch('/:paymentId/mark-paid', async (req, res, next) => {
  try {
    const dept = await getArtistDepartment(req.params.eventId, req.params.artistId);
    if (dept === undefined) return res.status(404).json({ error: 'Artist not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this artist' });

    const { paidDate, method, referenceNote } = req.body;
    const existing = await pool.query('SELECT status FROM artist_payments WHERE payment_id=$1 AND artist_id=$2', [req.params.paymentId, req.params.artistId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `UPDATE artist_payments SET status='Paid', paid_date=$1, method=$2, reference_note=COALESCE($3,reference_note), updated_at=now()
       WHERE payment_id=$4`,
      [paidDate || new Date().toISOString().slice(0, 10), method || null, referenceNote || null, req.params.paymentId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'artist_payment',
      entityId: req.params.paymentId, action: 'update', changes: { status: ['Pending', 'Paid'] },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:paymentId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    const existing = await pool.query('SELECT status FROM artist_payments WHERE payment_id=$1 AND artist_id=$2 AND event_id=$3', [req.params.paymentId, req.params.artistId, req.params.eventId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status === 'Paid') return res.status(409).json({ error: 'A paid installment is a financial record and cannot be deleted' });
    await pool.query('DELETE FROM artist_payments WHERE payment_id=$1', [req.params.paymentId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
