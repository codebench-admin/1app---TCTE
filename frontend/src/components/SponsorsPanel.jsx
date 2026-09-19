import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, X, Check, ChevronDown } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS, TIER_DELIVERABLES, inr } from '../constants.js';
import { Th, Td, Pill, IconBtn, Input, Select, PanelHeader } from './ui.jsx';
import SponsorContractsPanel from './SponsorContractsPanel.jsx';
import { api } from '../api.js';

export default function SponsorsPanel({ eventId, perms }) {
  const [sponsors, setSponsors] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [newDeliverable, setNewDeliverable] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const tiers = ['Title', 'Gold', 'Silver', 'Bronze'];
  const statuses = ['Prospect', 'In Talks', 'Confirmed', 'Paid'];

  const reload = () => api.listSponsors(eventId).then(setSponsors).catch(e => setError(e.message));
  useEffect(reload, [eventId]);

  const openForm = (s) => setForm(s || {
    department: perms.isSuperAdmin ? '' : perms.department,
    tier: 'Bronze',
    deliverables: TIER_DELIVERABLES.Bronze.map(text => ({ text, done: false })),
  });

  const applyTierDefaults = (tier) => setForm({ ...form, tier, deliverables: TIER_DELIVERABLES[tier].map(text => ({ text, done: false })) });
  const toggleDeliverable = (i) => setForm({ ...form, deliverables: form.deliverables.map((d, idx) => idx === i ? { ...d, done: !d.done } : d) });
  const removeDeliverable = (i) => setForm({ ...form, deliverables: form.deliverables.filter((_, idx) => idx !== i) });
  const addDeliverable = () => {
    if (!newDeliverable.trim()) return;
    setForm({ ...form, deliverables: [...(form.deliverables || []), { text: newDeliverable.trim(), done: false }] });
    setNewDeliverable('');
  };

  const save = async () => {
    if (!form.name) return;
    try {
      if (form.id) await api.updateSponsor(eventId, form.id, form);
      else await api.createSponsor(eventId, form);
      setForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => { try { await api.deleteSponsor(eventId, id); reload(); } catch (e) { setError(e.message); } };

  const toggleFromTable = async (sponsorId, deliverableId) => {
    try { await api.toggleDeliverable(eventId, sponsorId, deliverableId); reload(); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <PanelHeader title="Sponsors" perms={perms} onAdd={() => openForm()} addLabel="New sponsor" />
      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}

      {form && (
        <div style={{ background: T.panel, border: `1px solid ${T.borderLight}` }} className="rounded-md p-3 mb-4">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <Input placeholder="Sponsor name" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Select value={form.tier || 'Bronze'} onChange={e => applyTierDefaults(e.target.value)}>
              {tiers.map(t => <option key={t}>{t}</option>)}
            </Select>
            <Input type="number" placeholder="Amount (₹)" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <Select value={form.status || 'Prospect'} onChange={e => setForm({ ...form, status: e.target.value })}>
              {statuses.map(s => <option key={s}>{s}</option>)}
            </Select>
            <Input placeholder="Contact email" value={form.contact || ''} onChange={e => setForm({ ...form, contact: e.target.value })} />
            {perms.isSuperAdmin ? (
              <>
                <Input list="dept-options-sponsor" placeholder="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} />
                <datalist id="dept-options-sponsor">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
              </>
            ) : (
              <Pill text={form.department || perms.department} />
            )}
            <div className="flex gap-1 ml-auto">
              <IconBtn onClick={save} title="Save"><Check size={16} color={T.teal} /></IconBtn>
              <IconBtn onClick={() => setForm(null)} title="Cancel"><X size={16} /></IconBtn>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.border}` }} className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <div style={{ fontSize: 12, fontWeight: 600 }}>Deliverables for this {form.tier || 'Bronze'} sponsor</div>
              <button onClick={() => applyTierDefaults(form.tier || 'Bronze')} style={{ color: T.gold, fontSize: 11 }}>Reset to {form.tier || 'Bronze'} defaults</button>
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
              {(form.deliverables || []).map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!d.done} onChange={() => toggleDeliverable(i)} />
                  <span style={{ fontSize: 12.5, color: d.done ? T.muted : T.text, textDecoration: d.done ? 'line-through' : 'none', flex: 1 }}>{d.text}</span>
                  <IconBtn onClick={() => removeDeliverable(i)} title="Remove"><X size={13} /></IconBtn>
                </div>
              ))}
              {(!form.deliverables || form.deliverables.length === 0) && <div style={{ fontSize: 11.5, color: T.muted }}>No deliverables yet.</div>}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add a custom deliverable" value={newDeliverable} onChange={e => setNewDeliverable(e.target.value)} style={{ flex: 1 }} />
              <IconBtn onClick={addDeliverable} title="Add"><Plus size={15} color={T.gold} /></IconBtn>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Sponsor</Th><Th>Tier</Th><Th>Amount</Th><Th>Status</Th><Th>Contract</Th><Th>Deliverables</Th><Th>Department</Th><Th>—</Th></tr></thead>
          <tbody>
            {sponsors.map(s => {
              const editable = perms.canEditItem(s.department);
              const deliverables = s.deliverables || [];
              const doneCount = deliverables.filter(d => d.done).length;
              const expanded = expandedId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <tr>
                    <Td>{s.name}</Td>
                    <Td><Pill text={s.tier} tone={s.tier === 'Title' ? 'warn' : 'default'} /></Td>
                    <Td>{inr(s.amount)}{s.amountPaid > 0 && <div style={{ fontSize: 10.5, color: T.muted }}>{inr(s.amountPaid)} collected</div>}</Td>
                    <Td><Pill text={s.status} tone={s.status === 'Paid' || s.status === 'Confirmed' ? 'good' : 'default'} /></Td>
                    <Td>{s.contractStatus ? <Pill text={s.contractStatus} tone={s.contractStatus === 'Signed' ? 'good' : (s.contractStatus === 'Sent' ? 'warn' : 'default')} /> : <span style={{ color: T.muted, fontSize: 11 }}>—</span>}</Td>
                    <Td>
                      <button onClick={() => setExpandedId(expanded ? null : s.id)}
                        style={{ color: doneCount === deliverables.length && deliverables.length > 0 ? T.teal : T.muted, fontSize: 12 }}
                        className="flex items-center gap-1">
                        {doneCount}/{deliverables.length} <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    </Td>
                    <Td style={{ color: T.muted }}>{s.department || '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {editable && <IconBtn onClick={() => openForm(s)} title="Edit"><Pencil size={14} /></IconBtn>}
                        {perms.isSuperAdmin && <IconBtn onClick={() => remove(s.id)} title="Delete"><Trash2 size={14} /></IconBtn>}
                      </div>
                    </Td>
                  </tr>
                  {expanded && (
                    <tr>
                      <Td colSpan={8} style={{ background: T.panel }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted }} className="mb-1">Deliverables</div>
                        <div className="flex flex-col gap-1.5 mb-3">
                          {deliverables.length === 0 && <span style={{ fontSize: 11.5, color: T.muted }}>No deliverables listed for this sponsor.</span>}
                          {deliverables.map(d => (
                            <label key={d.id} className="flex items-center gap-2" style={{ cursor: editable ? 'pointer' : 'default' }}>
                              <input type="checkbox" checked={!!d.done} disabled={!editable} onChange={() => toggleFromTable(s.id, d.id)} />
                              <span style={{ fontSize: 12.5, color: d.done ? T.muted : T.text, textDecoration: d.done ? 'line-through' : 'none' }}>{d.text}</span>
                            </label>
                          ))}
                        </div>
                        <div style={{ borderTop: `1px solid ${T.border}` }} className="pt-3">
                          <SponsorContractsPanel eventId={eventId} sponsorId={s.id} editable={editable} />
                        </div>
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
