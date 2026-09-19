import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { getSponsorDepartment } from '../utils/sponsorAccess.js';
import { logAudit } from '../utils/audit.js';
import { notifyByRole } from '../utils/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

function withComputedFields(r) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = r.status === 'Pending' && r.due_date && r.due_date.toISOString().slice(0, 10) < today;
  return {
    id: r.payment_id, amount: r.amount, dueDate: r.due_date, paidDate: r.paid_date,
    status: r.status, method: r.method, referenceNote: r.reference_note,
    recordedBy: r.recorded_by_name, createdAt: r.created_at, overdue,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS recorded_by_name FROM sponsor_payments p
       LEFT JOIN users u ON u.user_id = p.recorded_by
       WHERE p.sponsor_id=$1 AND p.event_id=$2 ORDER BY p.due_date NULLS LAST, p.created_at`,
      [req.params.sponsorId, req.params.eventId]
    );
    const items = rows.map(withComputedFields);
    const totalDue = items.reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = items.filter(p => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0);
    const totalOverdue = items.filter(p => p.overdue).reduce((s, p) => s + Number(p.amount), 0);
    res.json({ items, summary: { totalDue, totalPaid, outstanding: totalDue - totalPaid, totalOverdue } });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const { amount, dueDate, contractId, referenceNote } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const { rows } = await pool.query(
      `INSERT INTO sponsor_payments (sponsor_id, event_id, contract_id, amount, due_date, reference_note, recorded_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending') RETURNING payment_id`,
      [req.params.sponsorId, req.params.eventId, contractId || null, amount, dueDate || null, referenceNote || null, req.userId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_payment',
      entityId: rows[0].payment_id, action: 'create', changes: { amount, dueDate },
    });
    await notifyByRole({
      eventId: req.params.eventId, role: 'Department Head', department: 'Finance',
      type: 'sponsor_payment_scheduled', title: `Sponsor installment scheduled: ₹${amount}`,
      body: dueDate ? `Due ${dueDate}` : null, linkEntityType: 'sponsor', linkEntityId: req.params.sponsorId,
    });
    res.status(201).json({ id: rows[0].payment_id });
  } catch (e) { next(e); }
});

router.patch('/:paymentId/mark-paid', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const { paidDate, method, referenceNote } = req.body;
    const existing = await pool.query('SELECT status FROM sponsor_payments WHERE payment_id=$1 AND sponsor_id=$2', [req.params.paymentId, req.params.sponsorId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      `UPDATE sponsor_payments SET status='Paid', paid_date=$1, method=$2, reference_note=COALESCE($3,reference_note), updated_at=now()
       WHERE payment_id=$4`,
      [paidDate || new Date().toISOString().slice(0, 10), method || null, referenceNote || null, req.params.paymentId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_payment',
      entityId: req.params.paymentId, action: 'update', changes: { status: ['Pending', 'Paid'] },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/:paymentId', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const existing = await pool.query('SELECT status FROM sponsor_payments WHERE payment_id=$1 AND sponsor_id=$2', [req.params.paymentId, req.params.sponsorId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status === 'Paid') return res.status(409).json({ error: 'A paid installment cannot be edited — record a correction instead' });

    const { amount, dueDate, referenceNote } = req.body;
    await pool.query(
      `UPDATE sponsor_payments SET amount=$1, due_date=$2, reference_note=$3, updated_at=now() WHERE payment_id=$4`,
      [amount, dueDate || null, referenceNote || null, req.params.paymentId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:paymentId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    const existing = await pool.query('SELECT status FROM sponsor_payments WHERE payment_id=$1 AND sponsor_id=$2 AND event_id=$3', [req.params.paymentId, req.params.sponsorId, req.params.eventId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status === 'Paid') return res.status(409).json({ error: 'A paid installment is a financial record and cannot be deleted' });
    await pool.query('DELETE FROM sponsor_payments WHERE payment_id=$1', [req.params.paymentId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
