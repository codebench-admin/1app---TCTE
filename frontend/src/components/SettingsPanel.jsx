import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { T } from '../theme.js';
import { Pill, Input } from './ui.jsx';
import { api } from '../api.js';

export default function SettingsPanel({ user, perms, onUpdated }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState(null);

  const save = async () => {
    setMsg(null);
    if (!name.trim() || !email.trim()) { setMsg({ type: 'error', text: 'Name and email cannot be empty.' }); return; }
    if ((currentPassword || newPassword || confirmPassword) && newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    try {
      const updated = await api.updateMe({
        name: name.trim(), email: email.trim(),
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMsg({ type: 'success', text: 'Profile updated.' });
      onUpdated?.(updated);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }} className="em-display mb-1">Your profile</div>
      <div style={{ fontSize: 12, color: T.muted }} className="mb-4">Manage your own name, email, and password.</div>

      <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4 mb-4 flex flex-wrap items-center gap-2">
        <Pill text={perms.role} tone={perms.role === 'Super Admin' ? 'warn' : 'default'} />
        {perms.department && <Pill text={perms.department} />}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <label style={{ fontSize: 11, color: T.muted }}>Full name</label>
        <Input value={name} onChange={e => setName(e.target.value)} />
        <label style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Email ID</label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>

      <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4 mb-4">
        <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 12.5, fontWeight: 600 }}>
          <KeyRound size={13} color={T.gold} /> Change password
        </div>
        <div className="flex flex-col gap-2">
          <Input type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          <Input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>
        <div style={{ fontSize: 10.5, color: T.muted }} className="mt-2">Leave these blank if you only want to update your name or email.</div>
      </div>

      {msg && <div style={{ color: msg.type === 'error' ? T.red : T.teal, fontSize: 12 }} className="mb-3">{msg.text}</div>}

      <button onClick={save} style={{ background: T.gold, color: '#1B1D28' }} className="px-4 py-2 rounded-md text-sm font-semibold">
        Save changes
      </button>
    </div>
  );
}
