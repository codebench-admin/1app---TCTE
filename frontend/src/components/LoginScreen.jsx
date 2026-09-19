import React, { useState } from 'react';
import { Mail, Lock, UserPlus, ArrowLeft } from 'lucide-react';
import { T } from '../theme.js';
import { Input } from './ui.jsx';
import { api, setToken } from '../api.js';

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogin = async () => {
    setError(''); setBusy(true);
    try {
      const { token, user } = await api.login({ email, password });
      setToken(token);
      onLogin(user);
    } catch (e) {
      setError(e.message || 'Incorrect email or password.');
    } finally { setBusy(false); }
  };

  const handleReset = () => { setEmail(''); setPassword(''); setError(''); };

  const handleSignUp = async () => {
    setError('');
    if (!newName.trim() || !newEmail.trim() || !newPassword) {
      setError('Fill in your name, email, and password to create an account.');
      return;
    }
    setBusy(true);
    try {
      const { token, user } = await api.signup({ name: newName.trim(), email: newEmail.trim(), password: newPassword });
      setToken(token);
      onLogin(user);
    } catch (e) {
      setError(e.message || 'Could not create your account.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }} className="w-full flex items-center justify-center p-5">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        .em-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      <div style={{ maxWidth: 380, width: '100%' }}>
        <div className="text-center mb-6">
          <div className="em-display" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>Runway</div>
          <div style={{ fontSize: 12.5, color: T.muted }}>Sign in to the event production console</div>
        </div>

        {mode === 'existing' && (
          <>
            <button
              onClick={() => { setMode('new'); setError(''); }}
              style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold mb-4"
            >
              <UserPlus size={15} color={T.gold} /> New user? Sign up
            </button>

            <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4">
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>Existing user sign in</div>

              <label style={{ fontSize: 11, color: T.muted }}>Email ID (user name)</label>
              <div className="flex items-center gap-2 mt-1 mb-3" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 10px' }}>
                <Mail size={14} color={T.muted} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontSize: 13, width: '100%' }} />
              </div>

              <label style={{ fontSize: 11, color: T.muted }}>Password</label>
              <div className="flex items-center gap-2 mt-1 mb-1" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 10px' }}>
                <Lock size={14} color={T.muted} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontSize: 13, width: '100%' }} />
              </div>

              {error && <div style={{ color: T.red, fontSize: 11.5 }} className="mb-2">{error}</div>}

              <div className="flex gap-2 mt-3">
                <button onClick={handleLogin} disabled={busy} style={{ background: T.gold, color: '#1B1D28' }} className="flex-1 py-2 rounded-md text-sm font-semibold">
                  {busy ? 'Signing in…' : 'Log In'}
                </button>
                <button onClick={handleReset} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted }} className="flex-1 py-2 rounded-md text-sm font-semibold">
                  Reset
                </button>
              </div>
            </div>
          </>
        )}

        {mode === 'new' && (
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-4">
            <button onClick={() => { setMode('existing'); setError(''); }} style={{ color: T.muted, fontSize: 11.5 }} className="flex items-center gap-1 mb-3">
              <ArrowLeft size={13} /> Back to sign in
            </button>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>Create your account</div>

            <div className="flex flex-col gap-2">
              <Input placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} />
              <Input type="email" placeholder="Email ID" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <Input type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>

            {error && <div style={{ color: T.red, fontSize: 11.5 }} className="mt-2">{error}</div>}

            <div style={{ fontSize: 10.5, color: T.muted }} className="mt-2">
              After signing up you can create your own event (you'll be its Super Admin), or ask an existing
              Super Admin to add your email under Team & Access on their event.
            </div>

            <button onClick={handleSignUp} disabled={busy} style={{ background: T.gold, color: '#1B1D28' }} className="w-full py-2 rounded-md text-sm font-semibold mt-3">
              {busy ? 'Creating account…' : 'Create account & sign in'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
