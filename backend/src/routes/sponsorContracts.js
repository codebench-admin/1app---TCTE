import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { canEditDepartment } from '../utils/permissions.js';
import { getSponsorDepartment } from '../utils/sponsorAccess.js';
import { logAudit } from '../utils/audit.js';
import { notify, notifyByRole } from '../utils/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

const STATUSES = ['Draft', 'Sent', 'Signed', 'Expired', 'Terminated'];

router.get('/', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    const { rows } = await pool.query(
      `SELECT c.contract_id, c.status, c.start_date, c.end_date, c.signed_by_name, c.signed_at,
              c.renewed_from_contract_id, c.notes, c.created_at,
              doc.document_id, doc.file_name
       FROM sponsor_contracts c LEFT JOIN documents doc ON doc.document_id = c.document_id
       WHERE c.sponsor_id=$1 AND c.event_id=$2 ORDER BY c.created_at DESC`,
      [req.params.sponsorId, req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.contract_id, status: r.status, startDate: r.start_date, endDate: r.end_date,
      signedByName: r.signed_by_name, signedAt: r.signed_at, renewedFrom: r.renewed_from_contract_id,
      notes: r.notes, createdAt: r.created_at,
      document: r.document_id ? { id: r.document_id, fileName: r.file_name } : null,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const { startDate, endDate, notes, documentId } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO sponsor_contracts (sponsor_id, event_id, document_id, start_date, end_date, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Draft') RETURNING contract_id`,
      [req.params.sponsorId, req.params.eventId, documentId || null, startDate || null, endDate || null, notes || null]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_contract',
      entityId: rows[0].contract_id, action: 'create', changes: { sponsorId: req.params.sponsorId },
    });
    res.status(201).json({ id: rows[0].contract_id });
  } catch (e) { next(e); }
});

// Update dates/notes/document, or move it through Draft -> Sent (etc.)
router.put('/:contractId', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const { status, startDate, endDate, notes, documentId } = req.body;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const before = await pool.query('SELECT status FROM sponsor_contracts WHERE contract_id=$1 AND sponsor_id=$2', [req.params.contractId, req.params.sponsorId]);
    if (!before.rows.length) return res.status(404).json({ error: 'Contract not found' });

    await pool.query(
      `UPDATE sponsor_contracts SET status=COALESCE($1,status), start_date=$2, end_date=$3, notes=$4,
       document_id=COALESCE($5,document_id), updated_at=now()
       WHERE contract_id=$6 AND sponsor_id=$7`,
      [status || null, startDate || null, endDate || null, notes || null, documentId || null, req.params.contractId, req.params.sponsorId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_contract',
      entityId: req.params.contractId, action: 'update',
      changes: { status: [before.rows[0].status, status || before.rows[0].status] },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Lightweight e-signature capture: typed name + timestamp + IP.
// This is NOT a legally binding e-signature standard (no DocuSign/identity
// verification) — good enough for internal tracking, not for paperwork
// that needs to hold up as a signed legal document on its own.
router.post('/:contractId/sign', async (req, res, next) => {
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    const { signedByName, signedByEmail } = req.body;
    if (!signedByName) return res.status(400).json({ error: 'signedByName is required' });

    const existing = await pool.query('SELECT sponsor_id FROM sponsor_contracts WHERE contract_id=$1 AND event_id=$2', [req.params.contractId, req.params.eventId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Contract not found' });

    await pool.query(
      `UPDATE sponsor_contracts SET status='Signed', signed_by_name=$1, signed_by_email=$2,
       signed_at=now(), signature_ip=$3, updated_at=now() WHERE contract_id=$4`,
      [signedByName, signedByEmail || null, req.ip, req.params.contractId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_contract',
      entityId: req.params.contractId, action: 'update', changes: { status: ['*', 'Signed'], signedByName },
    });
    await notifyByRole({
      eventId: req.params.eventId, role: 'Department Head', department: dept,
      type: 'sponsor_contract_signed', title: `Sponsor contract signed by ${signedByName}`,
      linkEntityType: 'sponsor', linkEntityId: req.params.sponsorId,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Renewal: marks the current contract Expired and creates a fresh Draft
// chained to it via renewed_from_contract_id, carrying dates forward a year
// unless the caller overrides them.
router.post('/:contractId/renew', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const dept = await getSponsorDepartment(req.params.eventId, req.params.sponsorId);
    if (dept === undefined) return res.status(404).json({ error: 'Sponsor not found' });
    if (!canEditDepartment(req.membership, dept)) return res.status(403).json({ error: 'Not allowed to edit this sponsor' });

    const old = await client.query('SELECT end_date FROM sponsor_contracts WHERE contract_id=$1 AND sponsor_id=$2', [req.params.contractId, req.params.sponsorId]);
    if (!old.rows.length) return res.status(404).json({ error: 'Contract not found' });

    const { startDate, endDate, notes } = req.body;
    await client.query('BEGIN');
    await client.query(`UPDATE sponsor_contracts SET status='Expired', updated_at=now() WHERE contract_id=$1`, [req.params.contractId]);
    const { rows } = await client.query(
      `INSERT INTO sponsor_contracts (sponsor_id, event_id, start_date, end_date, notes, status, renewed_from_contract_id)
       VALUES ($1,$2,$3,$4,$5,'Draft',$6) RETURNING contract_id`,
      [req.params.sponsorId, req.params.eventId, startDate || null, endDate || null, notes || null, req.params.contractId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'sponsor_contract',
      entityId: rows[0].contract_id, action: 'create', changes: { renewedFrom: req.params.contractId },
    }, client);
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].contract_id });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// Only a never-sent Draft can be deleted outright — once a contract has
// been sent or signed it's a record, not a mistake to erase (mark it
// Terminated via PUT instead, which preserves the audit trail).
router.delete('/:contractId', async (req, res, next) => {
  try {
    if (req.membership.role !== 'Super Admin') return res.status(403).json({ error: 'Only a Super Admin can delete' });
    const existing = await pool.query('SELECT status FROM sponsor_contracts WHERE contract_id=$1 AND sponsor_id=$2 AND event_id=$3', [req.params.contractId, req.params.sponsorId, req.params.eventId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'Draft') return res.status(409).json({ error: 'Only a Draft contract can be deleted — terminate it instead' });
    await pool.query('DELETE FROM sponsor_contracts WHERE contract_id=$1', [req.params.contractId]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
