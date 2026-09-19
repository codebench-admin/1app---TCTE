import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';
import { resolveDepartmentId } from '../utils/departments.js';
import { logAudit } from '../utils/audit.js';
import { notify, notifyByRole } from '../utils/notify.js';
import { toCsv } from '../utils/csv.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

function canApproveHead(membership, itemDepartment) {
  return membership.role === 'Super Admin' || (membership.role === 'Department Head' && membership.department === itemDepartment);
}
function canApproveFinance(membership) {
  return membership.role === 'Super Admin' || (membership.role === 'Department Head' && membership.department === 'Finance');
}

// A policy applies if its department is unset (all departments) or matches,
// AND its category is unset (all categories) or matches. Returns the
// tightest (lowest) matching limit, since that's the one actually breached.
async function findBreachedPolicy(eventId, departmentId, category, amount) {
  const { rows } = await pool.query(
    `SELECT max_amount, department_id FROM expense_policies
     WHERE event_id=$1 AND (department_id=$2 OR department_id IS NULL) AND (category=$3 OR category IS NULL)
     ORDER BY max_amount ASC`,
    [eventId, departmentId, category]
  );
  const breached = rows.find(r => Number(amount) > Number(r.max_amount));
  return breached || null;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ex.expense_id, bl.category, ex.description, ex.amount, d.name AS department,
              su.name AS submitted_by, ex.attachment_name, ex.status,
              ex.is_policy_flagged, ex.policy_note,
              hu.name AS head_approved_by, ex.head_approved_at,
              fu.name AS finance_approved_by, ex.finance_approved_at,
              ru.name AS rejected_by, ex.rejection_stage, ex.rejection_reason, ex.rejected_at, ex.created_at
       FROM expense_requests ex
       JOIN budget_lines bl ON bl.budget_line_id = ex.budget_line_id
       LEFT JOIN departments d ON d.department_id = ex.department_id
       LEFT JOIN users su ON su.user_id = ex.submitted_by
       LEFT JOIN users hu ON hu.user_id = ex.head_approved_by
       LEFT JOIN users fu ON fu.user_id = ex.finance_approved_by
       LEFT JOIN users ru ON ru.user_id = ex.rejected_by
       WHERE ex.event_id=$1 ORDER BY ex.created_at DESC`,
      [req.params.eventId]
    );
    res.json(rows.map(r => ({
      id: r.expense_id, category: r.category, description: r.description, amount: r.amount, department: r.department,
      submittedBy: r.submitted_by, attachmentName: r.attachment_name, status: r.status, createdAt: r.created_at,
      isFlagged: r.is_policy_flagged, policyNote: r.policy_note,
      headApproval: r.head_approved_by ? { by: r.head_approved_by, date: r.head_approved_at } : null,
      financeApproval: r.finance_approved_by ? { by: r.finance_approved_by, date: r.finance_approved_at } : null,
      rejection: r.rejected_by ? { by: r.rejected_by, stage: r.rejection_stage, reason: r.rejection_reason, date: r.rejected_at } : null,
    })));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { category, description, amount, department, attachmentName } = req.body;
    if (!category || !amount) return res.status(400).json({ error: 'category and amount are required' });
    const bl = await pool.query('SELECT budget_line_id FROM budget_lines WHERE event_id=$1 AND category=$2', [req.params.eventId, category]);
    if (!bl.rows.length) return res.status(400).json({ error: 'Unknown budget category' });
    const resolvedDepartment = department || req.membership.department;
    const departmentId = await resolveDepartmentId(req.params.eventId, resolvedDepartment);
    const breach = await findBreachedPolicy(req.params.eventId, departmentId, category, amount);
    const { rows } = await pool.query(
      `INSERT INTO expense_requests (event_id, budget_line_id, description, amount, department_id, submitted_by, attachment_name, status, is_policy_flagged, policy_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending Head Approval',$8,$9) RETURNING expense_id`,
      [req.params.eventId, bl.rows[0].budget_line_id, description || null, amount, departmentId, req.userId, attachmentName || null,
       !!breach, breach ? `Exceeds policy limit of ₹${breach.max_amount} for ${category}` : null]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'expense',
      entityId: rows[0].expense_id, action: 'create', changes: { category, amount, department: resolvedDepartment },
    });
    await notifyByRole({
      eventId: req.params.eventId, role: 'Department Head', department: resolvedDepartment,
      type: 'expense_submitted', title: `Expense awaiting your approval: ₹${amount}`,
      body: description || category, linkEntityType: 'expense', linkEntityId: rows[0].expense_id,
    });
    if (breach) {
      // Policy breaches go straight to Finance for visibility, without
      // waiting for the department head stage to reach them.
      await notifyByRole({
        eventId: req.params.eventId, role: 'Department Head', department: 'Finance',
        type: 'expense_policy_flagged', title: `Over-policy expense submitted: ₹${amount}`,
        body: `Exceeds the ₹${breach.max_amount} limit for ${category}`,
        linkEntityType: 'expense', linkEntityId: rows[0].expense_id,
      });
    }
    res.status(201).json({ id: rows[0].expense_id, flagged: !!breach });
  } catch (e) { next(e); }
});

router.post('/:expenseId/approve-head', async (req, res, next) => {
  try {
    const ex = await pool.query(
      `SELECT d.name AS department, ex.status FROM expense_requests ex
       LEFT JOIN departments d ON d.department_id=ex.department_id
       WHERE ex.expense_id=$1 AND ex.event_id=$2`,
      [req.params.expenseId, req.params.eventId]
    );
    if (!ex.rows.length) return res.status(404).json({ error: 'Not found' });
    if (ex.rows[0].status !== 'Pending Head Approval') return res.status(409).json({ error: 'Not awaiting department head approval' });
    if (!canApproveHead(req.membership, ex.rows[0].department)) return res.status(403).json({ error: 'Not authorized to approve for this department' });
    await pool.query(
      `UPDATE expense_requests SET status='Pending Finance Approval', head_approved_by=$1, head_approved_at=now(), updated_at=now()
       WHERE expense_id=$2`,
      [req.userId, req.params.expenseId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'expense',
      entityId: req.params.expenseId, action: 'approve', changes: { stage: 'Department Head' },
    });
    await notifyByRole({
      eventId: req.params.eventId, role: 'Department Head', department: 'Finance',
      type: 'expense_submitted', title: 'Expense awaiting finance approval',
      linkEntityType: 'expense', linkEntityId: req.params.expenseId,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:expenseId/approve-finance', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const ex = await client.query(
      'SELECT status, budget_line_id, amount, submitted_by FROM expense_requests WHERE expense_id=$1 AND event_id=$2',
      [req.params.expenseId, req.params.eventId]
    );
    if (!ex.rows.length) return res.status(404).json({ error: 'Not found' });
    if (ex.rows[0].status !== 'Pending Finance Approval') return res.status(409).json({ error: 'Not awaiting finance approval' });
    if (!canApproveFinance(req.membership)) return res.status(403).json({ error: 'Only the Finance department head can give final approval' });

    await client.query('BEGIN');
    await client.query(
      `UPDATE expense_requests SET status='Approved', finance_approved_by=$1, finance_approved_at=now(), updated_at=now() WHERE expense_id=$2`,
      [req.userId, req.params.expenseId]
    );
    await client.query(
      'UPDATE budget_lines SET actual = actual + $1, updated_at=now() WHERE budget_line_id=$2',
      [ex.rows[0].amount, ex.rows[0].budget_line_id]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'expense',
      entityId: req.params.expenseId, action: 'approve', changes: { stage: 'Finance Head' },
    }, client);
    await client.query('COMMIT');
    if (ex.rows[0].submitted_by !== req.userId) {
      await notify({
        eventId: req.params.eventId, userId: ex.rows[0].submitted_by, type: 'expense_approved',
        title: `Expense approved: ₹${ex.rows[0].amount}`,
        linkEntityType: 'expense', linkEntityId: req.params.expenseId,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.post('/:expenseId/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const ex = await pool.query(
      `SELECT d.name AS department, ex.status, ex.submitted_by, ex.amount FROM expense_requests ex
       LEFT JOIN departments d ON d.department_id=ex.department_id
       WHERE ex.expense_id=$1 AND ex.event_id=$2`,
      [req.params.expenseId, req.params.eventId]
    );
    if (!ex.rows.length) return res.status(404).json({ error: 'Not found' });
    const status = ex.rows[0].status;
    let stage = null;
    if (status === 'Pending Head Approval') {
      if (!canApproveHead(req.membership, ex.rows[0].department)) return res.status(403).json({ error: 'Not authorized' });
      stage = 'Department Head';
    } else if (status === 'Pending Finance Approval') {
      if (!canApproveFinance(req.membership)) return res.status(403).json({ error: 'Not authorized' });
      stage = 'Finance Head';
    } else {
      return res.status(409).json({ error: 'This request is not awaiting approval' });
    }
    await pool.query(
      `UPDATE expense_requests SET status='Rejected', rejected_by=$1, rejection_stage=$2, rejection_reason=$3, rejected_at=now(), updated_at=now()
       WHERE expense_id=$4`,
      [req.userId, stage, reason || 'No reason given', req.params.expenseId]
    );
    await logAudit({
      eventId: req.params.eventId, userId: req.userId, entityType: 'expense',
      entityId: req.params.expenseId, action: 'reject', changes: { stage, reason: reason || 'No reason given' },
    });
    if (ex.rows[0].submitted_by !== req.userId) {
      await notify({
        eventId: req.params.eventId, userId: ex.rows[0].submitted_by, type: 'expense_rejected',
        title: `Expense rejected: ₹${ex.rows[0].amount}`, body: reason || null,
        linkEntityType: 'expense', linkEntityId: req.params.expenseId,
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Accounting export — a generic CSV with the columns Tally/Zoho Books
// imports typically expect (date, category as ledger head, description,
// debit amount, cost center as department). Column names may need
// adjusting to match your chart of accounts on the receiving end.
router.get('/export', async (req, res, next) => {
  try {
    if (!canApproveFinance(req.membership)) return res.status(403).json({ error: 'Only Finance or a Super Admin can export accounting data' });
    const { status } = req.query; // optional filter, e.g. ?status=Approved
    const { rows } = await pool.query(
      `SELECT ex.created_at, bl.category, ex.description, ex.amount, d.name AS department,
              ex.status, su.name AS submitted_by, fu.name AS finance_approved_by, ex.finance_approved_at
       FROM expense_requests ex
       JOIN budget_lines bl ON bl.budget_line_id = ex.budget_line_id
       LEFT JOIN departments d ON d.department_id = ex.department_id
       LEFT JOIN users su ON su.user_id = ex.submitted_by
       LEFT JOIN users fu ON fu.user_id = ex.finance_approved_by
       WHERE ex.event_id=$1 ${status ? 'AND ex.status=$2' : ''}
       ORDER BY ex.created_at`,
      status ? [req.params.eventId, status] : [req.params.eventId]
    );
    const csv = toCsv(
      [
        { key: 'date', header: 'Date' },
        { key: 'ledgerHead', header: 'Ledger/Category' },
        { key: 'description', header: 'Description' },
        { key: 'debitAmount', header: 'Debit Amount' },
        { key: 'costCenter', header: 'Cost Center/Department' },
        { key: 'status', header: 'Status' },
        { key: 'submittedBy', header: 'Submitted By' },
        { key: 'approvedBy', header: 'Finance Approved By' },
        { key: 'approvedAt', header: 'Finance Approved Date' },
      ],
      rows.map(r => ({
        date: r.created_at.toISOString().slice(0, 10), ledgerHead: r.category, description: r.description || '',
        debitAmount: r.amount, costCenter: r.department || '', status: r.status,
        submittedBy: r.submitted_by || '', approvedBy: r.finance_approved_by || '',
        approvedAt: r.finance_approved_at ? r.finance_approved_at.toISOString().slice(0, 10) : '',
      }))
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${req.params.eventId}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

export default router;
