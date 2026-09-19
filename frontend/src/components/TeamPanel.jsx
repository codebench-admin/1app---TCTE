import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS } from '../constants.js';
import { ROLES } from '../roles.js';
import { Th, Td, Pill, IconBtn, Input, Select, AddButton } from './ui.jsx';
import { api } from '../api.js';

export default function TeamPanel({ eventId, perms }) {
  const [team, setTeam] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('General User');
  const [newDept, setNewDept] = useState('');
  const needsDept = (r) => r === 'General User' || r === 'Department Head';

  const reload = () => api.listMembers(eventId).then(setTeam).catch(e => setError(e.message));
  useEffect(reload, [eventId]);

  const add = async () => {
    if (!name.trim() || !email.trim()) return;
    try {
      const res = await api.addMember(eventId, { name: name.trim(), email: email.trim(), role: newRole, department: needsDept(newRole) ? newDept : undefined });
      setName(''); setEmail(''); setNewDept('');
      setNotice(res.tempPassword
        ? `New account created for ${res.email} — temporary password: ${res.tempPassword} (share this with them; they can change it later in Settings).`
        : `${res.email} added to this event.`);
      reload();
    } catch (e) { setError(e.message); }
  };

  const updateRole = async (member, role) => {
    try { await api.updateMember(eventId, member.id, { role, department: member.department }); reload(); }
    catch (e) { setError(e.message); }
  };
  const updateDept = async (member, department) => {
    try { await api.updateMember(eventId, member.id, { role: member.role, department }); reload(); }
    catch (e) { setError(e.message); }
  };
  const remove = async (id) => { try { await api.removeMember(eventId, id); reload(); } catch (e) { setError(e.message); } };

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700 }} className="em-display mb-1">Team & access</div>
      <div style={{ fontSize: 12, color: T.muted }} className="mb-4">
        Super Admins add teammates by email, set their role, and assign the department a Department Head or
        General User belongs to. If the email has no account yet, one is created with a temporary password
        shown once here (no email-sending is wired up, so share it with them directly).
      </div>

      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}
      {notice && <div style={{ color: T.teal, fontSize: 12 }} className="mb-3">{notice}</div>}

      {perms.canManageTeam && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Select value={newRole} onChange={e => setNewRole(e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </Select>
          {needsDept(newRole) && (
            <Input list="dept-options-team" placeholder="Department" value={newDept} onChange={e => setNewDept(e.target.value)} />
          )}
          <datalist id="dept-options-team">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
          <AddButton onClick={add} label="Add teammate" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Department</Th>{perms.canManageTeam && <Th>—</Th>}</tr></thead>
          <tbody>
            {team.map(m => (
              <tr key={m.id}>
                <Td>{m.name}</Td>
                <Td style={{ color: T.muted }}>{m.email}</Td>
                <Td>
                  {perms.canManageTeam ? (
                    <Select value={m.role} onChange={e => updateRole(m, e.target.value)}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </Select>
                  ) : (
                    <Pill text={m.role} tone={m.role === 'Super Admin' ? 'warn' : 'default'} />
                  )}
                </Td>
                <Td>
                  {perms.canManageTeam && needsDept(m.role) ? (
                    <Input list="dept-options-team" value={m.department || ''} onChange={e => updateDept(m, e.target.value)} />
                  ) : (
                    <span style={{ color: T.muted }}>{m.department || '—'}</span>
                  )}
                </Td>
                {perms.canManageTeam && (
                  <Td><IconBtn onClick={() => remove(m.id)} title="Remove"><Trash2 size={14} /></IconBtn></Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
