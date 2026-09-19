import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireEventMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireEventMember(pool));

router.get('/summary', async (req, res, next) => {
  try {
    const eventId = req.params.eventId;

    const budgetRows = (await pool.query(
      `SELECT category, type, budgeted, actual FROM budget_lines WHERE event_id=$1`, [eventId]
    )).rows;
    const totalBudgeted = budgetRows.reduce((s, b) => s + Number(b.budgeted), 0);
    const totalActual = budgetRows.reduce((s, b) => s + Number(b.actual), 0);

    const sponsorTotals = (await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS pledged FROM sponsors WHERE event_id=$1`, [eventId]
    )).rows[0];
    const sponsorPaid = (await pool.query(
      `SELECT COALESCE(SUM(sp.amount),0) AS paid FROM sponsor_payments sp WHERE sp.event_id=$1 AND sp.status='Paid'`, [eventId]
    )).rows[0];
    const sponsorOverdue = (await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS overdue FROM sponsor_payments
       WHERE event_id=$1 AND status='Pending' AND due_date < CURRENT_DATE`, [eventId]
    )).rows[0];
    const contractFunnel = (await pool.query(
      `SELECT status, COUNT(*) AS n FROM (
         SELECT DISTINCT ON (sponsor_id) sponsor_id, status FROM sponsor_contracts
         WHERE event_id=$1 ORDER BY sponsor_id, created_at DESC
       ) latest GROUP BY status`, [eventId]
    )).rows;
    const sponsorByTier = (await pool.query(
      `SELECT tier, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM sponsors WHERE event_id=$1 GROUP BY tier`, [eventId]
    )).rows;

    const artistTotals = (await pool.query(
      `SELECT COALESCE(SUM(fee),0) AS fees FROM artists WHERE event_id=$1`, [eventId]
    )).rows[0];
    const artistPaid = (await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS paid FROM artist_payments WHERE event_id=$1 AND status='Paid'`, [eventId]
    )).rows[0];
    const artistByStatus = (await pool.query(
      `SELECT status, COUNT(*) AS n FROM artists WHERE event_id=$1 GROUP BY status`, [eventId]
    )).rows;

    const taskTotals = (await pool.query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='Done') AS done,
              COUNT(*) FILTER (WHERE status<>'Done' AND due_date < CURRENT_DATE) AS overdue
       FROM tasks WHERE event_id=$1`, [eventId]
    )).rows[0];
    const taskByStatus = (await pool.query(
      `SELECT status, COUNT(*) AS n FROM tasks WHERE event_id=$1 GROUP BY status`, [eventId]
    )).rows;

    const expenseTotals = (await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='Approved') AS approved,
              COUNT(*) FILTER (WHERE status LIKE 'Pending%') AS pending,
              COUNT(*) FILTER (WHERE status='Rejected') AS rejected,
              COUNT(*) FILTER (WHERE is_policy_flagged) AS flagged,
              COALESCE(SUM(amount) FILTER (WHERE status='Approved'),0) AS approved_amount
       FROM expense_requests WHERE event_id=$1`, [eventId]
    )).rows[0];

    const recentActivity = (await pool.query(
      `SELECT a.entity_type, a.entity_id, a.action, a.changes, a.created_at, u.name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.user_id = a.user_id
       WHERE a.event_id=$1 ORDER BY a.created_at DESC LIMIT 15`, [eventId]
    )).rows;

    res.json({
      budget: { totalBudgeted, totalActual, byCategory: budgetRows.map(b => ({ category: b.category, type: b.type, budgeted: Number(b.budgeted), actual: Number(b.actual) })) },
      sponsors: {
        totalPledged: Number(sponsorTotals.pledged), totalCollected: Number(sponsorPaid.paid),
        totalOverdue: Number(sponsorOverdue.overdue),
        byTier: sponsorByTier.map(r => ({ tier: r.tier, count: Number(r.n), total: Number(r.total) })),
        contractFunnel: Object.fromEntries(contractFunnel.map(r => [r.status, Number(r.n)])),
      },
      artists: {
        totalFees: Number(artistTotals.fees), totalPaid: Number(artistPaid.paid),
        byStatus: Object.fromEntries(artistByStatus.map(r => [r.status, Number(r.n)])),
      },
      tasks: {
        total: Number(taskTotals.total), done: Number(taskTotals.done), overdue: Number(taskTotals.overdue),
        byStatus: Object.fromEntries(taskByStatus.map(r => [r.status, Number(r.n)])),
      },
      expenses: {
        total: Number(expenseTotals.total), approved: Number(expenseTotals.approved),
        pending: Number(expenseTotals.pending), rejected: Number(expenseTotals.rejected),
        flagged: Number(expenseTotals.flagged), approvedAmount: Number(expenseTotals.approved_amount),
      },
      recentActivity: recentActivity.map(r => ({
        entityType: r.entity_type, entityId: r.entity_id, action: r.action,
        changes: r.changes, createdAt: r.created_at, user: r.user_name,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
