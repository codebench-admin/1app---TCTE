import React, { useEffect, useState } from 'react';
import { Upload, Download, Trash2, RefreshCw, PenLine } from 'lucide-react';
import { T } from '../theme.js';
import { inr } from '../constants.js';
import { Pill, IconBtn, Input, Select } from './ui.jsx';
import { api } from '../api.js';

const CONTRACT_TONE = { Draft: 'default', Sent: 'warn', Signed: 'good', Expired: 'default', Terminated: 'bad' };

export default function SponsorContractsPanel({ eventId, sponsorId, editable }) {
  const [contracts, setContracts] = useState([]);
  const [payments, setPayments] = useState({ items: [], summary: {} });
  const [error, setError] = useState('');
  const [newContract, setNewContract] = useState(null);
  const [newPayment, setNewPayment] = useState(null);

  const reload = () => {
    api.listSponsorContracts(eventId, sponsorId).then(setContracts).catch(e => setError(e.message));
    api.listSponsorPayments(eventId, sponsorId).then(setPayments).catch(e => setError(e.message));
  };
  useEffect(reload, [eventId, sponsorId]);

  const saveContract = async () => {
    try {
      await api.createSponsorContract(eventId, sponsorId, newContract || {});
      setNewContract(null);
      reload();
    } catch (e) { setError(e.message); }
  };

  const uploadFor = async (contractId, file) => {
    try {
      const doc = await api.uploadDocument(eventId, { entityType: 'sponsor', entityId: sponsorId, label: 'Contract', file });
      await api.updateSponsorContract(eventId, sponsorId, contractId, { documentId: doc.id });
      reload();
    } catch (e) { setError(e.message); }
  };

  const send = async (contractId) => {
    try { await api.updateSponsorContract(eventId, sponsorId, contractId, { status: 'Sent' }); reload(); } catch (e) { setError(e.message); }
  };
  const sign = async (contractId) => {
    const signedByName = window.prompt('Type the signatory\'s full name to record their signature:');
    if (!signedByName) return;
    try { await api.signSponsorContract(eventId, sponsorId, contractId, { signedByName }); reload(); } catch (e) { setError(e.message); }
  };
  const renew = async (contractId) => {
    try { await api.renewSponsorContract(eventId, sponsorId, contractId, {}); reload(); } catch (e) { setError(e.message); }
  };
  const terminate = async (contractId) => {
    try { await api.updateSponsorContract(eventId, sponsorId, contractId, { status: 'Terminated' }); reload(); } catch (e) { setError(e.message); }
  };
  const removeContract = async (contractId) => {
    try { await api.deleteSponsorContract(eventId, sponsorId, contractId); reload(); } catch (e) { setError(e.message); }
  };

  const savePayment = async () => {
    if (!newPayment?.amount) return;
    try { await api.createSponsorPayment(eventId, sponsorId, newPayment); setNewPayment(null); reload(); } catch (e) { setError(e.message); }
  };
  const markPaid = async (paymentId) => {
    try { await api.markSponsorPaymentPaid(eventId, sponsorId, paymentId, {}); reload(); } catch (e) { setError(e.message); }
  };
  const removePayment = async (paymentId) => {
    try { await api.deleteSponsorPayment(eventId, sponsorId, paymentId); reload(); } catch (e) { setError(e.message); }
  };

  const { summary } = payments;

  return (
    <div className="flex flex-col gap-4 py-1">
      {error && <div style={{ color: T.red, fontSize: 11.5 }}>{error}</div>}

      {/* ---- Contracts ---- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Contracts</div>
          {editable && !newContract && (
            <button onClick={() => setNewContract({})} style={{ color: T.gold, fontSize: 11 }}>+ New contract</button>
          )}
        </div>

        {newContract && (
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <Input type="date" value={newContract.startDate || ''} onChange={e => setNewContract({ ...newContract, startDate: e.target.value })} />
            <Input type="date" value={newContract.endDate || ''} onChange={e => setNewContract({ ...newContract, endDate: e.target.value })} />
            <Input placeholder="Notes" value={newContract.notes || ''} onChange={e => setNewContract({ ...newContract, notes: e.target.value })} style={{ flex: 1 }} />
            <button onClick={saveContract} style={{ color: T.teal, fontSize: 11 }} className="font-semibold">Save</button>
            <button onClick={() => setNewContract(null)} style={{ color: T.muted, fontSize: 11 }}>Cancel</button>
          </div>
        )}

        {contracts.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>No contracts yet.</div>}
        <div className="flex flex-col gap-1.5">
          {contracts.map(c => (
            <div key={c.id} style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-2 flex flex-wrap items-center gap-2">
              <Pill text={c.status} tone={CONTRACT_TONE[c.status] || 'default'} />
              <span style={{ fontSize: 11.5, color: T.muted }}>
                {c.startDate || '—'} → {c.endDate || '—'}
                {c.signedByName && ` · signed by ${c.signedByName}`}
              </span>
              {c.document && (
                <button onClick={() => api.downloadDocument(eventId, c.document.id, c.document.fileName)}
                  style={{ color: T.blue, fontSize: 11 }} className="flex items-center gap-1">
                  <Download size={12} /> {c.document.fileName}
                </button>
              )}
              <div className="flex items-center gap-1 ml-auto">
                {editable && (
                  <label style={{ color: T.muted, cursor: 'pointer' }} title="Attach contract file">
                    <Upload size={13} />
                    <input type="file" hidden onChange={e => e.target.files[0] && uploadFor(c.id, e.target.files[0])} />
                  </label>
                )}
                {editable && c.status === 'Draft' && (
                  <button onClick={() => send(c.id)} style={{ color: T.gold, fontSize: 11 }}>Send</button>
                )}
                {editable && (c.status === 'Draft' || c.status === 'Sent') && (
                  <button onClick={() => sign(c.id)} style={{ color: T.teal, fontSize: 11 }} className="flex items-center gap-1"><PenLine size={12} /> Sign</button>
                )}
                {editable && c.status === 'Signed' && (
                  <button onClick={() => renew(c.id)} style={{ color: T.gold, fontSize: 11 }} className="flex items-center gap-1"><RefreshCw size={12} /> Renew</button>
                )}
                {editable && !['Terminated', 'Expired'].includes(c.status) && (
                  <button onClick={() => terminate(c.id)} style={{ color: T.red, fontSize: 11 }}>Terminate</button>
                )}
                {editable && c.status === 'Draft' && (
                  <IconBtn onClick={() => removeContract(c.id)} title="Delete draft"><Trash2 size={13} /></IconBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Payments ---- */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Payments</div>
          {editable && !newPayment && (
            <button onClick={() => setNewPayment({})} style={{ color: T.gold, fontSize: 11 }}>+ Add installment</button>
          )}
        </div>

        {summary && summary.totalDue > 0 && (
          <div style={{ fontSize: 11.5, color: T.muted }} className="mb-1.5">
            {inr(summary.totalPaid)} paid of {inr(summary.totalDue)}
            {summary.totalOverdue > 0 && <span style={{ color: T.red }}> · {inr(summary.totalOverdue)} overdue</span>}
          </div>
        )}

        {newPayment && (
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <Input type="number" placeholder="Amount (₹)" value={newPayment.amount || ''} onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })} />
            <Input type="date" value={newPayment.dueDate || ''} onChange={e => setNewPayment({ ...newPayment, dueDate: e.target.value })} />
            <Input placeholder="Note" value={newPayment.referenceNote || ''} onChange={e => setNewPayment({ ...newPayment, referenceNote: e.target.value })} style={{ flex: 1 }} />
            <button onClick={savePayment} style={{ color: T.teal, fontSize: 11 }} className="font-semibold">Save</button>
            <button onClick={() => setNewPayment(null)} style={{ color: T.muted, fontSize: 11 }}>Cancel</button>
          </div>
        )}

        {(!payments.items || payments.items.length === 0) && <div style={{ fontSize: 11.5, color: T.muted }}>No installments scheduled.</div>}
        <div className="flex flex-col gap-1.5">
          {(payments.items || []).map(p => (
            <div key={p.id} style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-2 flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{inr(p.amount)}</span>
              <span style={{ fontSize: 11.5, color: T.muted }}>Due {p.dueDate || '—'}</span>
              <Pill text={p.status === 'Paid' ? `Paid ${p.paidDate || ''}` : (p.overdue ? 'Overdue' : 'Pending')}
                tone={p.status === 'Paid' ? 'good' : (p.overdue ? 'bad' : 'default')} />
              <div className="flex items-center gap-1 ml-auto">
                {editable && p.status !== 'Paid' && (
                  <button onClick={() => markPaid(p.id)} style={{ color: T.teal, fontSize: 11 }}>Mark paid</button>
                )}
                {editable && p.status !== 'Paid' && (
                  <IconBtn onClick={() => removePayment(p.id)} title="Delete"><Trash2 size={13} /></IconBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
