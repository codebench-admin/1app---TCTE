import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { resolveDepartmentId } from '../utils/departments.js';
import { logAudit } from '../utils/audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

async function loadDeliverables(sponsorIds) {
  if (!sponsorIds.length) return {};
  const { rows } = await pool.query(
    `SELECT deliverable_id, sponsor_id, description, is_delivered
     FROM sponsor_deliverables WHERE sponsor_id = ANY($1::bigint[])`,
    [sponsorIds]
  );
  const map = {};
  for (const r of rows) {
    (map[r.sponsor_id] ||= []).push({ id: r.deliverable_id, text: r.description, done: r.is_delivered });
  }
  return map;
}

// Most recent contract's status per sponsor, e.g. so the table can show
// "Signed" vs "Draft" without a click into the sponsor's contract tab.
async function loadLatestContractStatus(sponsorIds) {
  if (!sponsorIds.length) return {};
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (sponsor_id) sponsor_id, status
     FROM sponsor_contracts WHERE sponsor_id = ANY($1::bigint[])
     ORDER BY sponsor_id, created_at DESC`,
    [sponsorIds]
  );
  const map = {};
  for (const r of rows) map[r.sponsor_id] = r.status;
  return map;
}

// Sum of Paid installments per sponsor, for a real "amount collected so
// far" figure instead of the single Prospect/Confirmed/Paid status flag.
async function loadPaidTotals(sponsorIds) {
  if (!sponsorIds.length) return {};
  const { rows } = await pool.query(
    `SELECT sponsor_id, COALESCE(SUM(amount),0) AS total
     FROM sponsor_payments WHERE sponsor_id = ANY($1::bigint[]) AND status='Paid'
     GROUP BY sponsor_id`,
    [sponsorIds]
  );
  const map = {};
  for (const r of rows) map[r.sponsor_id] = Number(r.total);
  return map;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.sponsor_id, s.name, s.tier, s.amount, s.status, s.contact_email, d.name AS department
       FROM sponsors s LEFT JOIN departments d ON d.department_id = s.department_id
       WHERE s.event_id=$1 ORDER BY s.created_at DESC`,
      [req.params.eventId]
    );
    const sponsorIds = rows.map(r => r.sponsor_id);
    const delivMap = await loadDeliverables(sponsorIds);
    const contractMap = await loadLatestContractStatus(sponsorIds);
    const paidMap = await loadPaidTotals(sponsorIds);
    res.json(rows.map(r => ({
      id: r.sponsor_id, name: r.name, tier: r.tier, amount: r.amount, status: r.status,
      contact: r.contact_email, department: r.department, deliverables: delivMap[r.sponsor_id] || [],
      contractStatus: contractMap[r.sponsor_id] || null,
      amountPaid: paidMap[r.sponsor_id] || 0,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, tier, amount, status, contact, department, deliverables } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only add items to your own department' });
    }
    await client.query('BEGIN');
    const departmentId = await resolveDepartmentId(req.params.eventId, department, client);
    const { rows } = await client.query(
      `INSERT INTO sponsors (event_id, name, tier, amount, status, contact_email, department_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING sponsor_id`,
      [req.params.eventId, name, tier || 'Bronze', amount || 0, status || 'Prospect', contact || null, departmentId]
    );
    const sponsorId = rows[0].sponsor_id;
    for (const d of (deliverables || [])) {
      await client.query(
        'INSERT INTO sponsor_deliverables (sponsor_id, description, is_delivered) VALUES ($1,$2,$3)',
        [sponsorId, d.text, !!d.done]
      );
    }
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor', entityId: sponsorId,
      action: 'create', changes: { name, tier, amount, status },
    }, client);
    await client.query('COMMIT');
    res.status(201).json({ id: sponsorId });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.put('/:sponsorId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT d.name AS department FROM sponsors s LEFT JOIN departments d ON d.department_id=s.department_id
       WHERE s.sponsor_id=$1 AND s.event_id=$2`,
      [req.params.sponsorId, req.params.eventId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!canEditDepartment(req.membership, existing.rows[0].department)) {
      return res.status(403).json({ error: 'Not allowed to edit this item' });
    }
    const { name, tier, amount, status, contact, department, deliverables } = req.body;
    if (!canEditDepartment(req.membership, department)) {
      return res.status(403).json({ error: 'You can only move items within your own department' });
    }
    const beforeRow = await client.query('SELECT amount, status FROM sponsors WHERE sponsor_id=$1', [req.params.sponsorId]);
    await client.query('BEGIN');
    const departmentId = await resolveDepartmentId(req.params.eventId, department, client);
    await client.query(
      `UPDATE sponsors SET name=$1, tier=$2, amount=$3, status=$4, contact_email=$5, department_id=$6, updated_at=now()
       WHERE sponsor_id=$7 AND event_id=$8`,
      [name, tier, amount, status, contact || null, departmentId, req.params.sponsorId, req.params.eventId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor', entityId: req.params.sponsorId,
      action: 'update',
      changes: { amount: [beforeRow.rows[0]?.amount, amount], status: [beforeRow.rows[0]?.status, status] },
    }, client);
    // Deliverables are a small checklist — simplest correct approach is to replace them wholesale.
    await client.query('DELETE FROM sponsor_deliverables WHERE sponsor_id=$1', [req.params.sponsorId]);
    for (const d of (deliverables || [])) {
      await client.query(
        'INSERT INTO sponsor_deliverables (sponsor_id, description, is_delivered) VALUES ($1,$2,$3)',
        [req.params.sponsorId, d.text, !!d.done]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// Toggle a single deliverable directly (table checkbox — no full sponsor edit needed)
router.patch('/:sponsorId/deliverables/:deliverableId', async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT d.name AS department FROM sponsors s LEFT JOIN departments d ON d.department_id=s.department_id
       WHERE s.sponsor_id=$1 AND s.event_id=$2`,
      [req.params.sponsorId, req.params.eventId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!canEditDepartment(req.membership, existing.rows[0].department)) {
      return res.status(403).json({ error: 'Not allowed to edit this item' });
    }
    await pool.query(
      'UPDATE sponsor_deliverables SET is_delivered = NOT is_delivered WHERE deliverable_id=$1 AND sponsor_id=$2',
      [req.params.deliverableId, req.params.sponsorId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:sponsorId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor',
      entityId: req.params.sponsorId, action: 'delete',
    });
    await pool.query('DELETE FROM sponsors WHERE sponsor_id=$1 AND event_id=$2', [req.params.sponsorId, req.params.eventId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
