import React, { useEffect, useState } from 'react';
import { Upload, Download, Trash2, Plane, Car, BedDouble } from 'lucide-react';
import { T } from '../theme.js';
import { inr } from '../constants.js';
import { Pill, IconBtn, Input, Select } from './ui.jsx';
import { api } from '../api.js';

const LEG_ICON = { Flight: Plane, Ground: Car, Hotel: BedDouble };
const DOC_LABELS = ['Technical Rider', 'Hospitality Rider', 'Contract', 'Other'];

export default function ArtistLogisticsPanel({ eventId, artistId, editable }) {
  const [documents, setDocuments] = useState([]);
  const [legs, setLegs] = useState([]);
  const [payments, setPayments] = useState({ items: [], summary: {} });
  const [error, setError] = useState('');
  const [pendingLabel, setPendingLabel] = useState('Technical Rider');
  const [newLeg, setNewLeg] = useState(null);
  const [newPayment, setNewPayment] = useState(null);

  const reload = () => {
    api.listDocuments(eventId, 'artist', artistId).then(setDocuments).catch(e => setError(e.message));
    api.listArtistTravelLegs(eventId, artistId).then(setLegs).catch(e => setError(e.message));
    api.listArtistPayments(eventId, artistId).then(setPayments).catch(e => setError(e.message));
  };
  useEffect(reload, [eventId, artistId]);

  const uploadDoc = async (file) => {
    try {
      await api.uploadDocument(eventId, { entityType: 'artist', entityId: artistId, label: pendingLabel, file });
      reload();
    } catch (e) { setError(e.message); }
  };
  const removeDoc = async (id) => { try { await api.deleteDocument(eventId, id); reload(); } catch (e) { setError(e.message); } };

  const saveLeg = async () => {
    if (!newLeg?.type) return;
    try { await api.createArtistTravelLeg(eventId, artistId, newLeg); setNewLeg(null); reload(); } catch (e) { setError(e.message); }
  };
  const removeLeg = async (id) => { try { await api.deleteArtistTravelLeg(eventId, artistId, id); reload(); } catch (e) { setError(e.message); } };

  const savePayment = async () => {
    if (!newPayment?.amount) return;
    try { await api.createArtistPayment(eventId, artistId, newPayment); setNewPayment(null); reload(); } catch (e) { setError(e.message); }
  };
  const markPaid = async (id) => { try { await api.markArtistPaymentPaid(eventId, artistId, id, {}); reload(); } catch (e) { setError(e.message); } };
  const removePayment = async (id) => { try { await api.deleteArtistPayment(eventId, artistId, id); reload(); } catch (e) { setError(e.message); } };

  const { summary } = payments;

  return (
    <div className="flex flex-col gap-4 py-1">
      {error && <div style={{ color: T.red, fontSize: 11.5 }}>{error}</div>}

      {/* ---- Riders & contracts ---- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Riders & contracts</div>
          {editable && (
            <div className="flex items-center gap-1.5">
              <Select value={pendingLabel} onChange={e => setPendingLabel(e.target.value)} style={{ fontSize: 11 }}>
                {DOC_LABELS.map(l => <option key={l}>{l}</option>)}
              </Select>
              <label style={{ color: T.gold, fontSize: 11, cursor: 'pointer' }} className="flex items-center gap-1">
                <Upload size={12} /> Upload
                <input type="file" hidden onChange={e => e.target.files[0] && uploadDoc(e.target.files[0])} />
              </label>
            </div>
          )}
        </div>
        {documents.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>No riders or contracts uploaded yet.</div>}
        <div className="flex flex-col gap-1">
          {documents.map(d => (
            <div key={d.id} className="flex items-center gap-2">
              <Pill text={d.label || 'Document'} />
              <button onClick={() => api.downloadDocument(eventId, d.id, d.fileName)} style={{ color: T.blue, fontSize: 11.5 }} className="flex items-center gap-1">
                <Download size={12} /> {d.fileName}
              </button>
              {editable && <IconBtn onClick={() => removeDoc(d.id)} title="Delete"><Trash2 size={12} /></IconBtn>}
            </div>
          ))}
        </div>
      </div>

      {/* ---- Travel & accommodation ---- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Travel & accommodation</div>
          {editable && !newLeg && (
            <button onClick={() => setNewLeg({ type: 'Flight' })} style={{ color: T.gold, fontSize: 11 }}>+ Add leg</button>
          )}
        </div>
        {newLeg && (
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <Select value={newLeg.type} onChange={e => setNewLeg({ ...newLeg, type: e.target.value })}>
              {['Flight', 'Ground', 'Hotel'].map(t => <option key={t}>{t}</option>)}
            </Select>
            <Input placeholder="Description (e.g. AI 502 BLR→MAA)" value={newLeg.description || ''} onChange={e => setNewLeg({ ...newLeg, description: e.target.value })} style={{ flex: 1 }} />
            <Input type="datetime-local" value={newLeg.departureAt || ''} onChange={e => setNewLeg({ ...newLeg, departureAt: e.target.value })} />
            <Input placeholder="Confirmation ref" value={newLeg.confirmationRef || ''} onChange={e => setNewLeg({ ...newLeg, confirmationRef: e.target.value })} />
            <button onClick={saveLeg} style={{ color: T.teal, fontSize: 11 }} className="font-semibold">Save</button>
            <button onClick={() => setNewLeg(null)} style={{ color: T.muted, fontSize: 11 }}>Cancel</button>
          </div>
        )}
        {legs.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>No travel or accommodation booked yet.</div>}
        <div className="flex flex-col gap-1.5">
          {legs.map(l => {
            const Icon = LEG_ICON[l.type] || Plane;
            return (
              <div key={l.id} style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-2 flex flex-wrap items-center gap-2">
                <Icon size={13} color={T.muted} />
                <span style={{ fontSize: 12.5 }}>{l.description || l.type}</span>
                {l.departureAt && <span style={{ fontSize: 11, color: T.muted }}>{new Date(l.departureAt).toLocaleString()}</span>}
                {l.confirmationRef && <span style={{ fontSize: 11, color: T.muted }}>Ref: {l.confirmationRef}</span>}
                {editable && <IconBtn onClick={() => removeLeg(l.id)} title="Delete" ><Trash2 size={12} /></IconBtn>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Payments / settlement ---- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Payments</div>
          {editable && !newPayment && (
            <button onClick={() => setNewPayment({ kind: 'Deposit' })} style={{ color: T.gold, fontSize: 11 }}>+ Add installment</button>
          )}
        </div>
        {summary && summary.totalScheduled > 0 && (
          <div style={{ fontSize: 11.5, color: T.muted }} className="mb-1.5">{inr(summary.totalPaid)} paid of {inr(summary.totalScheduled)}</div>
        )}
        {newPayment && (
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <Select value={newPayment.kind} onChange={e => setNewPayment({ ...newPayment, kind: e.target.value })}>
              {['Deposit', 'Balance', 'Full'].map(k => <option key={k}>{k}</option>)}
            </Select>
            <Input type="number" placeholder="Amount (₹)" value={newPayment.amount || ''} onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })} />
            <Input type="date" value={newPayment.dueDate || ''} onChange={e => setNewPayment({ ...newPayment, dueDate: e.target.value })} />
            <button onClick={savePayment} style={{ color: T.teal, fontSize: 11 }} className="font-semibold">Save</button>
            <button onClick={() => setNewPayment(null)} style={{ color: T.muted, fontSize: 11 }}>Cancel</button>
          </div>
        )}
        {(!payments.items || payments.items.length === 0) && <div style={{ fontSize: 11.5, color: T.muted }}>No installments scheduled.</div>}
        <div className="flex flex-col gap-1.5">
          {(payments.items || []).map(p => (
            <div key={p.id} style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-2 flex flex-wrap items-center gap-2">
              <Pill text={p.kind} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{inr(p.amount)}</span>
              <span style={{ fontSize: 11.5, color: T.muted }}>Due {p.dueDate || '—'}</span>
              <Pill text={p.status === 'Paid' ? `Paid ${p.paidDate || ''}` : (p.overdue ? 'Overdue' : 'Pending')}
                tone={p.status === 'Paid' ? 'good' : (p.overdue ? 'bad' : 'default')} />
              <div className="flex items-center gap-1 ml-auto">
                {editable && p.status !== 'Paid' && <button onClick={() => markPaid(p.id)} style={{ color: T.teal, fontSize: 11 }}>Mark paid</button>}
                {editable && p.status !== 'Paid' && <IconBtn onClick={() => removePayment(p.id)} title="Delete"><Trash2 size={13} /></IconBtn>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
