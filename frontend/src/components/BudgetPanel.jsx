import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Check, X, Paperclip, ThumbsUp, ThumbsDown, Clock3, Download, ShieldAlert } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS, inr } from '../constants.js';
import { Th, Td, Pill, IconBtn, Input, Select, PanelHeader, EditForm, MiniStat, AddButton } from './ui.jsx';
import { api } from '../api.js';

export default function BudgetPanel({ eventId, perms }) {
  const [budget, setBudget] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [expForm, setExpForm] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [policyForm, setPolicyForm] = useState(null);

  const canManagePolicies = perms.isSuperAdmin || perms.canApproveFinance;

  const reload = () => {
    api.listBudgetLines(eventId).then(setBudget).catch(e => setError(e.message));
    api.listExpenses(eventId).then(setExpenses).catch(e => setError(e.message));
    if (canManagePolicies) api.listExpensePolicies(eventId).then(setPolicies).catch(() => {});
  };
  useEffect(reload, [eventId]);

  const savePolicy = async () => {
    if (!policyForm?.maxAmount) return;
    try { await api.createExpensePolicy(eventId, policyForm); setPolicyForm(null); reload(); } catch (e) { setError(e.message); }
  };
  const removePolicy = async (id) => { try { await api.deleteExpensePolicy(eventId, id); reload(); } catch (e) { setError(e.message); } };

  const save = async () => {
    if (!form.category) return;
    try {
      if (form.id) await api.updateBudgetLine(eventId, form.id, form);
      else await api.createBudgetLine(eventId, form);
      setForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };
  const removeLine = async (id) => { try { await api.deleteBudgetLine(eventId, id); reload(); } catch (e) { setError(e.message); } };

  const income = budget.filter(b => b.type === 'Income').reduce((s, b) => s + Number(b.actual || 0), 0);
  const expenseTotal = budget.filter(b => b.type === 'Expense').reduce((s, b) => s + Number(b.actual || 0), 0);
  const expenseCategories = budget.filter(b => b.type === 'Expense').map(b => b.category);

  const submitExpense = async () => {
    if (!expForm.category || !expForm.amount) return;
    try {
      await api.createExpense(eventId, { ...expForm, department: expForm.department || perms.department });
      setExpForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };
  const approveHead = async (e) => { try { await api.approveHead(eventId, e.id); reload(); } catch (err) { setError(err.message); } };
  const approveFinance = async (e) => { try { await api.approveFinance(eventId, e.id); reload(); } catch (err) { setError(err.message); } };
  const confirmReject = async () => {
    try { await api.rejectExpense(eventId, rejecting.id, rejectReason); setRejecting(null); setRejectReason(''); reload(); }
    catch (err) { setError(err.message); }
  };

  const statusTone = (s) => s === 'Approved' ? 'good' : s === 'Rejected' ? 'bad' : 'warn';

  return (
    <div>
      <PanelHeader title="Budget" perms={perms} onAdd={() => setForm({})} addLabel="New line item" />
      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStat label="Actual income" value={inr(income)} tone="good" />
        <MiniStat label="Actual expense" value={inr(expenseTotal)} tone="bad" />
        <MiniStat label="Net" value={inr(income - expenseTotal)} tone={income - expenseTotal >= 0 ? 'good' : 'bad'} />
      </div>

      {form && (
        <EditForm onCancel={() => setForm(null)} onSave={save}>
          <Input placeholder="Category" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} />
          <Select value={form.type || 'Expense'} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option>Expense</option><option>Income</option>
          </Select>
          <Input type="number" placeholder="Budgeted (₹)" value={form.budgeted || ''} onChange={e => setForm({ ...form, budgeted: e.target.value })} />
          <Input type="number" placeholder="Actual (₹)" value={form.actual || ''} onChange={e => setForm({ ...form, actual: e.target.value })} />
        </EditForm>
      )}

      <div className="overflow-x-auto mb-8">
        <table className="w-full">
          <thead><tr><Th>Category</Th><Th>Type</Th><Th>Budgeted</Th><Th>Actual</Th><Th>Variance</Th><Th>—</Th></tr></thead>
          <tbody>
            {budget.map(b => {
              const variance = Number(b.actual || 0) - Number(b.budgeted || 0);
              const overBudget = b.type === 'Expense' ? variance > 0 : variance < 0;
              return (
                <tr key={b.id}>
                  <Td>{b.category}</Td>
                  <Td><Pill text={b.type} tone={b.type === 'Income' ? 'good' : 'default'} /></Td>
                  <Td>{inr(b.budgeted)}</Td>
                  <Td>{inr(b.actual)}</Td>
                  <Td style={{ color: overBudget ? T.red : T.teal, fontWeight: 600 }}>{variance >= 0 ? '+' : ''}{inr(variance)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <IconBtn onClick={() => setForm(b)} title="Edit"><Pencil size={14} /></IconBtn>
                      {perms.isSuperAdmin ? (
                        <IconBtn onClick={() => removeLine(b.id)} title="Delete"><Trash2 size={14} /></IconBtn>
                      ) : (
                        <span title="Only Admins can delete budget lines" style={{ color: T.borderLight }}><Trash2 size={14} /></span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }} className="em-display">Expense requests</div>
          <div style={{ fontSize: 11.5, color: T.muted }}>Submitted expense → department head approval → finance head approval</div>
        </div>
        <div className="flex items-center gap-2">
          {canManagePolicies && (
            <button onClick={() => api.exportExpensesCsv(eventId)} style={{ color: T.blue, fontSize: 12 }} className="flex items-center gap-1.5">
              <Download size={14} /> Export CSV
            </button>
          )}
          <AddButton onClick={() => setExpForm({})} label="Submit expense" />
        </div>
      </div>

      {canManagePolicies && (
        <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontSize: 12, fontWeight: 600 }} className="flex items-center gap-1.5"><ShieldAlert size={13} color={T.gold} /> Spend policy</div>
            {!policyForm && <button onClick={() => setPolicyForm({})} style={{ color: T.gold, fontSize: 11 }}>+ Add limit</button>}
          </div>
          <div style={{ fontSize: 11, color: T.muted }} className="mb-2">Expenses over these limits are flagged for Finance immediately — they still go through the normal approval flow, this just adds visibility.</div>
          {policyForm && (
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <Input list="dept-options-policy" placeholder="Department (blank = all)" value={policyForm.department || ''} onChange={e => setPolicyForm({ ...policyForm, department: e.target.value })} />
              <datalist id="dept-options-policy">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
              <Input placeholder="Category (blank = all)" value={policyForm.category || ''} onChange={e => setPolicyForm({ ...policyForm, category: e.target.value })} />
              <Input type="number" placeholder="Max amount (₹)" value={policyForm.maxAmount || ''} onChange={e => setPolicyForm({ ...policyForm, maxAmount: e.target.value })} />
              <button onClick={savePolicy} style={{ color: T.teal, fontSize: 11 }} className="font-semibold">Save</button>
              <button onClick={() => setPolicyForm(null)} style={{ color: T.muted, fontSize: 11 }}>Cancel</button>
            </div>
          )}
          {policies.length === 0 && !policyForm && <div style={{ fontSize: 11.5, color: T.muted }}>No spend limits set — nothing gets flagged.</div>}
          <div className="flex flex-col gap-1">
            {policies.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span style={{ fontSize: 12 }}>{p.department || 'All departments'} · {p.category || 'All categories'} · max {inr(p.maxAmount)}</span>
                <IconBtn onClick={() => removePolicy(p.id)} title="Remove"><Trash2 size={12} /></IconBtn>
              </div>
            ))}
          </div>
        </div>
      )}

      {expForm && (
        <div style={{ background: T.panel, border: `1px solid ${T.borderLight}` }} className="rounded-md p-3 mb-4 flex flex-wrap gap-2 items-center">
          <Select value={expForm.category || ''} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
            <option value="">Budget category…</option>
            {expenseCategories.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input placeholder="Description" value={expForm.description || ''} onChange={e => setExpForm({ ...expForm, description: e.target.value })} style={{ minWidth: 180 }} />
          <Input type="number" placeholder="Amount (₹)" value={expForm.amount || ''} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
          <Input list="dept-options-exp" placeholder="Department" value={expForm.department || perms.department || ''} onChange={e => setExpForm({ ...expForm, department: e.target.value })} />
          <datalist id="dept-options-exp">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
          <label style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.muted, fontSize: 12 }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer">
            <Paperclip size={13} />
            {expForm.attachmentName || 'Attach receipt'}
            <input type="file" className="hidden" onChange={e => setExpForm({ ...expForm, attachmentName: e.target.files?.[0]?.name || '' })} />
          </label>
          <div className="flex gap-1 ml-auto">
            <IconBtn onClick={submitExpense} title="Submit"><Check size={16} color={T.teal} /></IconBtn>
            <IconBtn onClick={() => setExpForm(null)} title="Cancel"><X size={16} /></IconBtn>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Description</Th><Th>Category</Th><Th>Dept</Th><Th>Amount</Th><Th>Attachment</Th><Th>Submitted by</Th><Th>Status</Th><Th>—</Th></tr></thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id}>
                <Td>{e.description || '—'}</Td>
                <Td style={{ color: T.muted }}>{e.category}</Td>
                <Td style={{ color: T.muted }}>{e.department || '—'}</Td>
                <Td>{inr(e.amount)}</Td>
                <Td style={{ color: T.muted }}>{e.attachmentName ? <span className="flex items-center gap-1"><Paperclip size={12} />{e.attachmentName}</span> : '—'}</Td>
                <Td style={{ color: T.muted }}>{e.submittedBy}</Td>
                <Td>
                  <Pill text={e.status} tone={statusTone(e.status)} />
                  {e.isFlagged && <div style={{ marginTop: 3 }}><Pill text="Over policy" tone="bad" /></div>}
                  {e.rejection && <div style={{ fontSize: 10.5, color: T.red, marginTop: 3 }}>{e.rejection.stage}: {e.rejection.reason}</div>}
                  {e.headApproval && e.status !== 'Rejected' && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 3 }}>Head ✓ {e.headApproval.by}</div>}
                  {e.financeApproval && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>Finance ✓ {e.financeApproval.by}</div>}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {e.status === 'Pending Head Approval' && perms.canApproveHead(e.department) && (
                      <>
                        <IconBtn onClick={() => approveHead(e)} title="Approve as department head"><ThumbsUp size={14} color={T.teal} /></IconBtn>
                        <IconBtn onClick={() => setRejecting({ id: e.id, stage: 'Department Head' })} title="Reject"><ThumbsDown size={14} color={T.red} /></IconBtn>
                      </>
                    )}
                    {e.status === 'Pending Finance Approval' && perms.canApproveFinance && (
                      <>
                        <IconBtn onClick={() => approveFinance(e)} title="Approve as finance head"><ThumbsUp size={14} color={T.teal} /></IconBtn>
                        <IconBtn onClick={() => setRejecting({ id: e.id, stage: 'Finance Head' })} title="Reject"><ThumbsDown size={14} color={T.red} /></IconBtn>
                      </>
                    )}
                    {(e.status === 'Approved' || e.status === 'Rejected') && <span style={{ color: T.borderLight }}>—</span>}
                    {e.status === 'Pending Head Approval' && !perms.canApproveHead(e.department) && <span style={{ color: T.muted, fontSize: 11 }} className="flex items-center gap-1"><Clock3 size={12} /> awaiting head</span>}
                    {e.status === 'Pending Finance Approval' && !perms.canApproveFinance && <span style={{ color: T.muted, fontSize: 11 }} className="flex items-center gap-1"><Clock3 size={12} /> awaiting finance</span>}
                  </div>
                </Td>
              </tr>
            ))}
            {expenses.length === 0 && <tr><Td style={{ color: T.muted }}>No expense requests yet.</Td></tr>}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <div style={{ background: 'rgba(0,0,0,0.5)' }} className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4 w-full max-w-sm">
            <div style={{ fontSize: 13, fontWeight: 700 }} className="em-display mb-2">Reject expense</div>
            <div style={{ fontSize: 11.5, color: T.muted }} className="mb-2">Rejecting at the {rejecting.stage} stage. Give a reason so the submitter knows what to fix.</div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection" rows={3}
              style={{ width: '100%', background: T.panel, border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, padding: '8px', borderRadius: 5 }} />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setRejecting(null); setRejectReason(''); }} style={{ color: T.muted, fontSize: 12.5 }} className="px-3 py-1.5">Cancel</button>
              <button onClick={confirmReject} style={{ background: T.red, color: '#fff', fontSize: 12.5, fontWeight: 600 }} className="px-3 py-1.5 rounded-md">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
