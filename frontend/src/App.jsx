import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, CheckSquare, Handshake, Mic2, Wallet, Users, Store,
  Settings as SettingsIcon, LogOut, ChevronDown, Building2,
} from 'lucide-react';
import { T } from './theme.js';
import { formatEventDate } from './constants.js';
import { api, setToken } from './api.js';

import LoginScreen from './components/LoginScreen.jsx';
import EventSelectScreen from './components/EventSelectScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import TasksPanel from './components/TasksPanel.jsx';
import SponsorsPanel from './components/SponsorsPanel.jsx';
import ArtistsPanel from './components/ArtistsPanel.jsx';
import StallsPanel from './components/StallsPanel.jsx';
import BudgetPanel from './components/BudgetPanel.jsx';
import TeamPanel from './components/TeamPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [event, setEvent] = useState(null); // { id, name, date, venue, role, department }
  const [tab, setTab] = useState('dashboard');

  // Restore session from a stored token, if any
  useEffect(() => {
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const handleLogin = (u) => setUser(u);
  const handleLogout = () => { setToken(null); setUser(null); setEvent(null); };
  const handleSelectEvent = (ev) => { setEvent(ev); setTab('dashboard'); };

  if (booting) return null;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  if (!event) return <EventSelectScreen user={user} onSelect={handleSelectEvent} onLogout={handleLogout} />;

  const isSuperAdmin = event.role === 'Super Admin';
  const perms = {
    role: event.role,
    department: event.department,
    isSuperAdmin,
    canManageTeam: isSuperAdmin,
    canEditItem: (itemDept) => isSuperAdmin || !itemDept || itemDept === event.department,
    canApproveHead: (dept) => isSuperAdmin || (event.role === 'Department Head' && dept === event.department),
    canApproveFinance: isSuperAdmin || (event.role === 'Department Head' && event.department === 'Finance'),
  };

  const NAV = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'sponsors', label: 'Sponsors', icon: Handshake },
    { id: 'artists', label: 'Artists', icon: Mic2 },
    { id: 'stalls', label: 'Stalls', icon: Store },
    { id: 'budget', label: 'Budget', icon: Wallet },
    { id: 'team', label: 'Team & Access', icon: Users },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }} className="w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        .em-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}` }} className="flex items-center justify-between px-5 py-4 flex-wrap gap-3">
        <div>
          <div className="em-display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Runway</div>
          <button onClick={() => setEvent(null)} title="Switch event" className="flex items-center gap-1.5 mt-0.5" style={{ color: T.muted, fontSize: 12 }}>
            <span style={{ color: T.gold, fontWeight: 600 }}>{event.name}</span>
            <span>· {formatEventDate(event.date)}</span>
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}`, fontSize: 12 }} className="flex items-center gap-2 px-3 py-1.5 rounded-md">
            <span style={{ fontWeight: 600 }}>{user.name}</span>
            <span style={{ color: T.muted }}>· {event.role}{event.department ? ` · ${event.department}` : ''}</span>
          </div>
          <button onClick={handleLogout} title="Log out" style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.muted }} className="p-2 rounded-md">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <div className="flex gap-1 px-3 pt-3 overflow-x-auto">
        {NAV.map(n => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-t-md whitespace-nowrap"
              style={{
                background: active ? T.panel : 'transparent',
                color: active ? T.gold : T.muted,
                borderBottom: active ? `2px solid ${T.gold}` : '2px solid transparent',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Icon size={15} /> {n.label}
            </button>
          );
        })}
      </div>

      <div style={{ background: T.panel, borderTop: `1px solid ${T.border}` }} className="p-4 md:p-6">
        {!perms.isSuperAdmin && tab !== 'settings' && (
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.muted }} className="flex items-center gap-2 text-xs px-3 py-2 rounded mb-4">
            <Building2 size={13} /> You're a {perms.role}{perms.department ? ` in ${perms.department}` : ''} — you can add and edit records for {perms.department || 'your department'} only. This is enforced by the server, not just hidden here.
          </div>
        )}

        {tab === 'dashboard' && <Dashboard eventId={event.id} />}
        {tab === 'tasks' && <TasksPanel eventId={event.id} perms={perms} />}
        {tab === 'sponsors' && <SponsorsPanel eventId={event.id} perms={perms} />}
        {tab === 'artists' && <ArtistsPanel eventId={event.id} perms={perms} />}
        {tab === 'stalls' && <StallsPanel eventId={event.id} perms={perms} />}
        {tab === 'budget' && <BudgetPanel eventId={event.id} perms={perms} />}
        {tab === 'team' && <TeamPanel eventId={event.id} perms={perms} />}
        {tab === 'settings' && <SettingsPanel user={user} perms={perms} onUpdated={setUser} />}
      </div>
    </div>
  );
}
