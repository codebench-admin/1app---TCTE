import React from 'react';
import { Plus } from 'lucide-react';
import { T } from '../theme.js';

export function Th({ children }) {
  return <th style={{ fontSize: 11, color: T.muted, fontWeight: 600, textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>{children}</th>;
}
export function Td({ children, style, colSpan }) {
  return <td colSpan={colSpan} style={{ fontSize: 12.5, padding: '9px 10px', borderBottom: `1px solid ${T.border}`, ...style }}>{children}</td>;
}
export function Pill({ text, tone = 'default' }) {
  const map = {
    default: { bg: '#2C2F3D', c: T.text },
    good: { bg: 'rgba(74,156,143,0.18)', c: T.teal },
    warn: { bg: 'rgba(229,164,69,0.18)', c: T.gold },
    bad: { bg: 'rgba(217,105,79,0.18)', c: T.red },
  };
  const s = map[tone] || map.default;
  return <span style={{ background: s.bg, color: s.c, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}
export function IconBtn({ onClick, children, title, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{ color: T.muted, opacity: disabled ? 0.4 : 1 }} className="p-1 rounded hover:opacity-70">
      {children}
    </button>
  );
}
export function Input(props) {
  return <input {...props} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, padding: '6px 8px', borderRadius: 5, ...props.style }} />;
}
export function Select(props) {
  return (
    <select {...props} className={'em-select ' + (props.className || '')} style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, fontSize: 12.5, padding: '6px 8px', borderRadius: 5, ...props.style }}>
      {props.children}
    </select>
  );
}
export function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ background: T.gold, color: '#1B1D28' }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold">
      <Plus size={14} /> {label}
    </button>
  );
}
export function MiniStat({ label, value, tone }) {
  const color = tone === 'good' ? T.teal : tone === 'bad' ? T.red : T.text;
  return (
    <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="rounded-md p-3">
      <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
      <div className="em-display" style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
export function PanelHeader({ title, perms, onAdd, addLabel, children }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
      <div style={{ fontSize: 15, fontWeight: 700 }} className="em-display">{title}</div>
      <div className="flex items-center gap-2">
        {children}
        <AddButton onClick={onAdd} label={addLabel} />
      </div>
    </div>
  );
}
export function EditForm({ children, onCancel, onSave }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.borderLight}` }} className="rounded-md p-3 mb-4 flex flex-wrap gap-2 items-center">
      {children}
      <div className="flex gap-1 ml-auto">
        <button onClick={onSave} style={{ color: T.teal }} className="text-xs font-semibold px-2 py-1">Save</button>
        <button onClick={onCancel} style={{ color: T.muted }} className="text-xs font-semibold px-2 py-1">Cancel</button>
      </div>
    </div>
  );
}
