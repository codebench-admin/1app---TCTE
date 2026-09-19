import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, ChevronDown } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS, inr } from '../constants.js';
import { Th, Td, Pill, IconBtn, Input, Select, PanelHeader, EditForm } from './ui.jsx';
import ArtistLogisticsPanel from './ArtistLogisticsPanel.jsx';
import { api } from '../api.js';

export default function ArtistsPanel({ eventId, perms }) {
  const [artists, setArtists] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const statuses = ['Inquiry', 'Negotiating', 'Confirmed', 'Contracted'];

  const reload = () => api.listArtists(eventId).then(setArtists).catch(e => setError(e.message));
  useEffect(reload, [eventId]);

  const openForm = (a) => setForm(a || { department: perms.isSuperAdmin ? '' : perms.department, status: 'Inquiry' });

  const save = async () => {
    if (!form.name) return;
    try {
      if (form.id) await api.updateArtist(eventId, form.id, form);
      else await api.createArtist(eventId, form);
      setForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };
  const remove = async (id) => { try { await api.deleteArtist(eventId, id); reload(); } catch (e) { setError(e.message); } };

  return (
    <div>
      <PanelHeader title="Artists" perms={perms} onAdd={() => openForm()} addLabel="New artist" />
      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}

      {form && (
        <EditForm onCancel={() => setForm(null)} onSave={save}>
          <Input placeholder="Artist / act name" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Genre" value={form.genre || ''} onChange={e => setForm({ ...form, genre: e.target.value })} />
          <Input type="number" placeholder="Fee (₹)" value={form.fee || ''} onChange={e => setForm({ ...form, fee: e.target.value })} />
          <Select value={form.status || 'Inquiry'} onChange={e => setForm({ ...form, status: e.target.value })}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </Select>
          <Input placeholder="Slot / date" value={form.slot || ''} onChange={e => setForm({ ...form, slot: e.target.value })} />
          {perms.isSuperAdmin ? (
            <>
              <Input list="dept-options-artist" placeholder="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} />
              <datalist id="dept-options-artist">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
            </>
          ) : (
            <Pill text={form.department || perms.department} />
          )}
        </EditForm>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Artist</Th><Th>Genre</Th><Th>Fee</Th><Th>Status</Th><Th>Slot</Th><Th>Logistics</Th><Th>Department</Th><Th>—</Th></tr></thead>
          <tbody>
            {artists.map(a => {
              const editable = perms.canEditItem(a.department);
              const expanded = expandedId === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr>
                    <Td>{a.name}</Td>
                    <Td style={{ color: T.muted }}>{a.genre || '—'}</Td>
                    <Td>{inr(a.fee)}{a.amountPaid > 0 && <div style={{ fontSize: 10.5, color: T.muted }}>{inr(a.amountPaid)} paid</div>}</Td>
                    <Td><Pill text={a.status} tone={a.status === 'Contracted' || a.status === 'Confirmed' ? 'good' : 'default'} /></Td>
                    <Td style={{ color: T.muted }}>{a.slot || '—'}</Td>
                    <Td>
                      <button onClick={() => setExpandedId(expanded ? null : a.id)} style={{ color: T.muted, fontSize: 12 }} className="flex items-center gap-1">
                        {a.documentCount || 0} doc{a.documentCount === 1 ? '' : 's'} <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    </Td>
                    <Td style={{ color: T.muted }}>{a.department || '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {editable && <IconBtn onClick={() => openForm(a)} title="Edit"><Pencil size={14} /></IconBtn>}
                        {perms.isSuperAdmin && <IconBtn onClick={() => remove(a.id)} title="Delete"><Trash2 size={14} /></IconBtn>}
                      </div>
                    </Td>
                  </tr>
                  {expanded && (
                    <tr>
                      <Td colSpan={8} style={{ background: T.panel }}>
                        <ArtistLogisticsPanel eventId={eventId} artistId={a.id} editable={editable} />
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
