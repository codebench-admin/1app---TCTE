import React, { useEffect, useState } from 'react';
import { CalendarDays, LogOut, Plus } from 'lucide-react';
import { T } from '../theme.js';
import { formatEventDate } from '../constants.js';
import { Input } from './ui.jsx';
import { api, setToken } from '../api.js';

export default function EventSelectScreen({ user, onSelect, onLogout }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');

  const load = () => {
    setLoading(true);
    api.listEvents().then(setEvents).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addEvent = async () => {
    if (!name.trim() || !date) return;
    try {
      const ev = await api.createEvent({ name: name.trim(), date, venue: venue.trim() });
      setName(''); setDate(''); setVenue(''); setAdding(false);
      onSelect(ev);
    } catch (e) { setError(e.message); }
  };

  const logout = () => { setToken(null); onLogout(); };

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }} className="w-full flex items-center justify-center p-5">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        .em-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="em-display" style={{ fontSize: 22, fontWeight: 700 }}>Your events</div>
          <button onClick={logout} style={{ color: T.muted, fontSize: 11.5 }} className="flex items-center gap-1">
            <LogOut size={13} /> Log out
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: T.muted }} className="mb-5">
          Hi {user?.name} — pick an event to open its production console.
        </div>

        {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}
        {loading && <div style={{ color: T.muted, fontSize: 12.5 }} className="mb-3">Loading your events…</div>}

        <div className="flex flex-col gap-2.5 mb-4">
          {events.map(ev => (
            <button
              key={ev.id}
              onClick={() => onSelect(ev)}
              style={{ background: T.panelAlt, border: `1px solid ${T.border}` }}
              className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-md text-left hover:opacity-90"
            >
              <div className="flex items-center gap-3">
                <CalendarDays size={18} color={T.gold} />
                <div>
                  <div className="em-display" style={{ fontSize: 15, fontWeight: 700, color: T.gold }}>{ev.name}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>
                    {ev.venue ? `${ev.venue} · ` : ''}{ev.role}{ev.department ? ` · ${ev.department}` : ''}
                  </div>
                </div>
              </div>
              <span style={{ background: 'rgba(229,164,69,0.15)', color: T.gold, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                {formatEventDate(ev.date)}
              </span>
            </button>
          ))}
          {!loading && events.length === 0 && (
            <div style={{ color: T.muted, fontSize: 12.5 }}>
              You're not a member of any event yet. Create one below, or ask a Super Admin to add your email in Team & Access.
            </div>
          )}
        </div>

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{ background: T.panelAlt, border: `1px dashed ${T.borderLight}`, color: T.muted }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold"
          >
            <Plus size={14} /> New event
          </button>
        )}

        {adding && (
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-3 flex flex-col gap-2">
            <Input placeholder="Event name" value={name} onChange={e => setName(e.target.value)} />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <Input placeholder="Venue (optional)" value={venue} onChange={e => setVenue(e.target.value)} />
            <div className="flex gap-2 mt-1">
              <button onClick={addEvent} style={{ background: T.gold, color: '#1B1D28' }} className="flex-1 py-2 rounded-md text-sm font-semibold">Create & open</button>
              <button onClick={() => setAdding(false)} style={{ color: T.muted }} className="px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
