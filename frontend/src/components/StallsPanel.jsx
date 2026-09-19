import React, { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS, STALL_CATEGORIES, STALL_STATUSES, inr } from '../constants.js';
import { Th, Td, Pill, IconBtn, Input, Select, PanelHeader, EditForm } from './ui.jsx';
import { api } from '../api.js';

export default function StallsPanel({ eventId, perms }) {
  const [stalls, setStalls] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [catFilter, setCatFilter] = useState('All');

  const reload = () => api.listStalls(eventId).then(setStalls).catch(e => setError(e.message));
  useEffect(reload, [eventId]);

  const openForm = (s) => setForm(s || { department: perms.isSuperAdmin ? '' : perms.department, category: STALL_CATEGORIES[0], status: 'Planned' });

  const save = async () => {
    if (!form.name || !form.category) return;
    try {
      if (form.id) await api.updateStall(eventId, form.id, form);
      else await api.createStall(eventId, form);
      setForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };
  const remove = async (id) => { try { await api.deleteStall(eventId, id); reload(); } catch (e) { setError(e.message); } };

  const visible = catFilter === 'All' ? stalls : stalls.filter(s => s.category === catFilter);
  const totalBudget = visible.reduce((sum, s) => sum + Number(s.setupBudget || 0), 0);

  return (
    <div>
      <PanelHeader title="Stall Management" perms={perms} onAdd={() => openForm()} addLabel="New stall">
        <Select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="All">All categories</option>
          {STALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </Select>
      </PanelHeader>

      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}

      <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-3 mb-4 flex items-center justify-between">
        <span style={{ fontSize: 12, color: T.muted }}>{visible.length} stall{visible.length === 1 ? '' : 's'} in view</span>
        <span style={{ fontSize: 13, fontWeight: 700 }} className="em-display">{inr(totalBudget)} total setup budget</span>
      </div>

      {form && (
        <EditForm onCancel={() => setForm(null)} onSave={save}>
          <Input placeholder="Stall name / number" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Select value={form.category || STALL_CATEGORIES[0]} onChange={e => setForm({ ...form, category: e.target.value })}>
            {STALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input placeholder="Dimensions (e.g. 10x10 ft)" value={form.dimensions || ''} onChange={e => setForm({ ...form, dimensions: e.target.value })} />
          <Input type="number" placeholder="Setup budget (₹)" value={form.setupBudget || ''} onChange={e => setForm({ ...form, setupBudget: e.target.value })} />
          <Input placeholder="Assigned to (sponsor / vendor)" value={form.assignedTo || ''} onChange={e => setForm({ ...form, assignedTo: e.target.value })} />
          <Select value={form.status || 'Planned'} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STALL_STATUSES.map(s => <option key={s}>{s}</option>)}
          </Select>
          {perms.isSuperAdmin ? (
            <>
              <Input list="dept-options-stall" placeholder="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} />
              <datalist id="dept-options-stall">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
            </>
          ) : (
            <Pill text={form.department || perms.department} />
          )}
        </EditForm>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Stall</Th><Th>Category</Th><Th>Dimensions</Th><Th>Setup Budget</Th><Th>Assigned To</Th><Th>Status</Th><Th>Dept</Th><Th>—</Th></tr></thead>
          <tbody>
            {visible.map(s => {
              const editable = perms.canEditItem(s.department);
              return (
                <tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td><Pill text={s.category} tone={s.category === 'Sponsor Stall' ? 'warn' : s.category === 'Experience Stall' ? 'good' : 'default'} /></Td>
                  <Td style={{ color: T.muted }}>{s.dimensions || '—'}</Td>
                  <Td>{inr(s.setupBudget)}</Td>
                  <Td style={{ color: T.muted }}>{s.assignedTo || '—'}</Td>
                  <Td><Pill text={s.status} tone={s.status === 'Live' ? 'good' : s.status === 'Setup In Progress' ? 'warn' : 'default'} /></Td>
                  <Td style={{ color: T.muted }}>{s.department || '—'}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {editable && <IconBtn onClick={() => openForm(s)} title="Edit"><Pencil size={14} /></IconBtn>}
                      {perms.isSuperAdmin && <IconBtn onClick={() => remove(s.id)} title="Delete"><Trash2 size={14} /></IconBtn>}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><Td style={{ color: T.muted }}>No stalls in this view.</Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
