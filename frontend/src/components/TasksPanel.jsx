import React, { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { T } from '../theme.js';
import { DEPARTMENTS } from '../constants.js';
import { Th, Td, Pill, IconBtn, Input, Select, PanelHeader, EditForm } from './ui.jsx';
import { api } from '../api.js';

export default function TasksPanel({ eventId, perms }) {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [form, setForm] = useState(null);
  const statuses = ['To Do', 'In Progress', 'Done'];

  const reload = () => api.listTasks(eventId).then(setTasks).catch(e => setError(e.message));
  useEffect(() => {
    reload();
    api.listMembers(eventId).then(setMembers).catch(() => {});
  }, [eventId]);

  const depts = Array.from(new Set([...DEPARTMENTS, ...tasks.map(t => t.department).filter(Boolean)]));
  const visible = tasks
    .filter(t => filter === 'All' || t.status === filter)
    .filter(t => deptFilter === 'All' || t.department === deptFilter);

  const openForm = (t) => setForm(t || { department: perms.isSuperAdmin ? '' : perms.department, priority: 'Medium', status: 'To Do' });

  const save = async () => {
    if (!form.title) return;
    try {
      if (form.id) await api.updateTask(eventId, form.id, form);
      else await api.createTask(eventId, form);
      setForm(null);
      reload();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    try { await api.deleteTask(eventId, id); reload(); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <PanelHeader title="Tasks" perms={perms} onAdd={() => openForm()} addLabel="New task">
        <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="All">All departments</option>
          {depts.map(d => <option key={d}>{d}</option>)}
        </Select>
        <Select value={filter} onChange={e => setFilter(e.target.value)}>
          {['All', ...statuses].map(s => <option key={s}>{s}</option>)}
        </Select>
      </PanelHeader>

      {error && <div style={{ color: T.red, fontSize: 12 }} className="mb-3">{error}</div>}

      {form && (
        <EditForm onCancel={() => setForm(null)} onSave={save}>
          <Input placeholder="Task title" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Select value={form.assignee || ''} onChange={e => setForm({ ...form, assignee: e.target.value })}>
            <option value="">Assignee…</option>
            {members.map(m => <option key={m.id}>{m.name}</option>)}
          </Select>
          {perms.isSuperAdmin ? (
            <>
              <Input list="dept-options-task" placeholder="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} />
              <datalist id="dept-options-task">{depts.map(d => <option key={d} value={d} />)}</datalist>
            </>
          ) : (
            <Pill text={form.department || perms.department} />
          )}
          <Select value={form.priority || 'Medium'} onChange={e => setForm({ ...form, priority: e.target.value })}>
            {['Low', 'Medium', 'High'].map(p => <option key={p}>{p}</option>)}
          </Select>
          <Select value={form.status || 'To Do'} onChange={e => setForm({ ...form, status: e.target.value })}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </Select>
          <Input type="date" value={form.due || ''} onChange={e => setForm({ ...form, due: e.target.value })} />
        </EditForm>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Task</Th><Th>Assignee</Th><Th>Department</Th><Th>Priority</Th><Th>Status</Th><Th>Due</Th><Th>—</Th></tr></thead>
          <tbody>
            {visible.map(t => {
              const editable = perms.canEditItem(t.department);
              return (
                <tr key={t.id}>
                  <Td>{t.title}</Td>
                  <Td>{t.assignee || '—'}</Td>
                  <Td style={{ color: T.muted }}>{t.department ? <Pill text={t.department} /> : '—'}</Td>
                  <Td><Pill text={t.priority} tone={t.priority === 'High' ? 'bad' : t.priority === 'Medium' ? 'warn' : 'default'} /></Td>
                  <Td><Pill text={t.status} tone={t.status === 'Done' ? 'good' : t.status === 'In Progress' ? 'warn' : 'default'} /></Td>
                  <Td>{t.due ? String(t.due).slice(0, 10) : '—'}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {editable && <IconBtn onClick={() => openForm(t)} title="Edit"><Pencil size={14} /></IconBtn>}
                      {perms.isSuperAdmin && <IconBtn onClick={() => remove(t.id)} title="Delete"><Trash2 size={14} /></IconBtn>}
                    </div>
                  </Td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><Td style={{ color: T.muted }}>No tasks in this view.</Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
