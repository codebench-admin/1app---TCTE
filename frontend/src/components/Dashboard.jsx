import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Clock3, ShieldAlert, Activity } from 'lucide-react';
import { T } from '../theme.js';
import { inr } from '../constants.js';
import { Pill } from './ui.jsx';
import { api } from '../api.js';

const CONTRACT_TONE = { Draft: 'default', Sent: 'warn', Signed: 'good', Expired: 'default', Terminated: 'bad' };

function describeActivity(a) {
  const entity = a.entityType.replace('_', ' ');
  const verb = { create: 'created', update: 'updated', delete: 'deleted', approve: 'approved', reject: 'rejected' }[a.action] || a.action;
  return `${a.user || 'Someone'} ${verb} a ${entity}`;
}

export default function Dashboard({ eventId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getReportsSummary(eventId).then(setSummary).catch(e => setError(e.message));
  }, [eventId]);

  if (error) return <div style={{ color: T.red, fontSize: 12 }}>{error}</div>;
  if (!summary) return null;

  const { budget, sponsors, artists, tasks, expenses, recentActivity } = summary;
  const income = budget.byCategory.filter(b => b.type === 'Income').reduce((s, b) => s + b.actual, 0);
  const expenseTotal = budget.byCategory.filter(b => b.type === 'Expense').reduce((s, b) => s + b.actual, 0);
  const net = income - expenseTotal;
  const chartData = budget.byCategory.map(b => ({ name: b.category, Budgeted: b.budgeted, Actual: b.actual }));

  const cards = [
    { label: 'Tasks completed', value: `${tasks.done}/${tasks.total}`, sub: tasks.overdue > 0 ? `${tasks.overdue} overdue` : 'on track', accent: tasks.overdue > 0 ? T.red : undefined },
    { label: 'Sponsor collection', value: inr(sponsors.totalCollected), sub: `of ${inr(sponsors.totalPledged)} pledged`, accent: sponsors.totalOverdue > 0 ? T.red : T.teal },
    { label: 'Artist settlement', value: inr(artists.totalPaid), sub: `of ${inr(artists.totalFees)} in fees` },
    { label: 'Net position', value: inr(net), sub: net >= 0 ? 'in surplus' : 'over budget', accent: net >= 0 ? T.teal : T.red },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.map((c, i) => (
          <div key={i} style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-3.5">
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{c.label}</div>
            <div className="em-display" style={{ fontSize: 22, fontWeight: 700, color: c.accent || T.text }}>{c.value}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock3 size={15} color={T.gold} />
            <span style={{ fontSize: 12.5 }}>{expenses.pending} expense request{expenses.pending === 1 ? '' : 's'} awaiting approval</span>
          </div>
          {expenses.flagged > 0 && (
            <span style={{ color: T.red, fontSize: 12 }} className="flex items-center gap-1">
              <ShieldAlert size={13} /> {expenses.flagged} over policy
            </span>
          )}
        </div>

        <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4">
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Sponsor contract status</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(sponsors.contractFunnel).length === 0 && <span style={{ fontSize: 11.5, color: T.muted }}>No contracts started yet.</span>}
            {Object.entries(sponsors.contractFunnel).map(([status, n]) => (
              <Pill key={status} text={`${status} · ${n}`} tone={CONTRACT_TONE[status] || 'default'} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4 mb-4">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Budget: planned vs actual</div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: T.muted, fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fill: T.muted, fontSize: 10 }} tickFormatter={(v) => `${v / 100000}L`} />
              <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12 }} formatter={(v) => inr(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Budgeted" fill={T.blue} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Actual" fill={T.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }} className="flex items-center gap-1.5"><Activity size={14} color={T.gold} /> Recent activity</div>
        {recentActivity.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>Nothing logged yet.</div>}
        <div className="flex flex-col gap-1.5">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-center justify-between" style={{ fontSize: 12 }}>
              <span style={{ color: T.text }}>{describeActivity(a)}</span>
              <span style={{ color: T.muted, fontSize: 11 }}>{new Date(a.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
