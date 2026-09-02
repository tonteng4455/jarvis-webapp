'use client';
// app/dashboard/tasks/page.jsx — Task editor (Premium only): checkbox
// to mark done, archive, delete, and a recurring routine (daily/
// weekly/monthly) that syncs a reminder to Google Calendar.

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav } from '../_components';

const PRIORITY_COLOR = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };
const PRIORITY_LABEL = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };
const RECURRENCE_LABEL = { daily: '🔁 ทุกวัน', weekly: '🔁 ทุกสัปดาห์', monthly: '🔁 ทุกเดือน' };

function Composer({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('medium');
  const ref = useRef(null);

  async function commit() {
    if (!name.trim()) { setOpen(false); return; }
    await onCreate({ task_name: name.trim(), priority });
    setName(''); setPriority('medium'); setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) commit(); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, priority]);

  if (!open) {
    return <div className="note-composer" onClick={() => setOpen(true)} style={{ cursor: 'text', marginBottom: '1rem' }}>
      <span className="muted">➕ เพิ่มงานใหม่...</span>
    </div>;
  }
  return (
    <div className="note-composer" ref={ref} style={{ marginBottom: '1rem' }}>
      <input className="note-title-input" placeholder="ชื่องาน" value={name} onChange={e => setName(e.target.value)} autoFocus />
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
        {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
          <button key={key} className="glass-btn-outline" onMouseDown={e => e.stopPropagation()}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', color: 'var(--text-primary)', background: priority === key ? PRIORITY_COLOR[key] + '33' : 'var(--surface-muted)', borderColor: priority === key ? PRIORITY_COLOR[key] : 'var(--border-strong)' }}
            onClick={() => setPriority(key)}>{label}</button>
        ))}
      </div>
      <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
        <button onClick={commit} className="glass-btn" style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem' }}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

function RoutinePicker({ task, onUpdate, onClose }) {
  const [recurrence, setRecurrence] = useState(task.recurrence || '');
  const [time, setTime] = useState(task.recurrence_time || '09:00');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onUpdate(task.id, { recurrence: recurrence || null, recurrence_time: recurrence ? time : null });
    setSaving(false);
    onClose();
  }

  return (
    <div className="glass-card" style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>🔁 งานทำซ้ำ</div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        {[['', 'ไม่ทำซ้ำ'], ['daily', 'ทุกวัน'], ['weekly', 'ทุกสัปดาห์'], ['monthly', 'ทุกเดือน']].map(([val, label]) => (
          <button key={val} className="glass-btn-outline" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', color: 'var(--text-primary)', background: recurrence === val ? 'var(--accent-soft)' : 'var(--surface-muted)', borderColor: recurrence === val ? 'var(--accent)' : 'var(--border-strong)' }}
            onClick={() => setRecurrence(val)}>{label}</button>
        ))}
      </div>
      {recurrence && (
        <div style={{ marginBottom: '0.6rem' }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.3rem' }}>เตือนเวลา (ส่งไป Google Calendar)</label>
          <input type="time" className="glass-input" value={time} onChange={e => setTime(e.target.value)} style={{ maxWidth: 140 }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="glass-btn-outline" onClick={onClose} style={{ color: 'var(--text-primary)', background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}>ยกเลิก</button>
        <button className="glass-btn" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
      </div>
    </div>
  );
}

function TaskRow({ task, onUpdate, onDelete, autoEditId }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.task_name);
  const [routineOpen, setRoutineOpen] = useState(false);
  const ref = useRef(null);

  // Coming from a LIFF link with ?id=... — jump straight to this task's
  // routine picker (the main thing worth opening a dedicated editor
  // for) and scroll it into view.
  useEffect(() => {
    if (autoEditId && String(task.id) === String(autoEditId)) {
      setRoutineOpen(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId]);

  function saveEdit() {
    setEditing(false);
    if (name !== task.task_name) onUpdate(task.id, { task_name: name });
  }

  useEffect(() => {
    if (!editing) return;
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) saveEdit(); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, name]);

  return (
    <div className="glass-card" ref={ref} style={{ opacity: task.is_done ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input type="checkbox" checked={!!task.is_done} onChange={() => onUpdate(task.id, { is_done: !task.is_done })}
          style={{ width: 20, height: 20, flexShrink: 0, cursor: 'pointer' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] || 'var(--text-secondary)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input className="note-title-input" value={name} onChange={e => setName(e.target.value)} autoFocus style={{ fontSize: '0.9rem' }} />
          ) : (
            <div onClick={() => setEditing(true)} style={{ fontSize: '0.9rem', textDecoration: task.is_done ? 'line-through' : 'none', cursor: 'text' }}>{task.task_name}</div>
          )}
          <div className="muted">
            {task.category || 'general'} · {PRIORITY_LABEL[task.priority] || task.priority}
            {task.recurrence && <> · {RECURRENCE_LABEL[task.recurrence]} {task.recurrence_time}</>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button className="note-icon-btn" onClick={() => setRoutineOpen(v => !v)}>🔁 ทำซ้ำ</button>
        {task.archived ? (
          <button className="note-icon-btn" onClick={() => onUpdate(task.id, { archived: false })}>↩️ กลับ</button>
        ) : (
          <button className="note-icon-btn" onClick={() => onUpdate(task.id, { archived: true })}>🗄️ เก็บ</button>
        )}
        <button className="note-icon-btn" onClick={() => { if (confirm('ลบงานนี้ใช่ไหม?')) onDelete(task.id); }}>🗑️ ลบ</button>
      </div>
      {routineOpen && <RoutinePicker task={task} onUpdate={onUpdate} onClose={() => setRoutineOpen(false)} />}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const [tasks, setTasks] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState(null);
  const searchParams = useSearchParams();
  const autoEditId = searchParams.get('id');

  async function load(archived = showArchived) {
    const res = await fetch(`/api/tasks?archived=${archived}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    setTasks(data.tasks);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createTask(payload) {
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { load(); return; }
    const data = await res.json().catch(() => ({}));
    if (data.error === 'quota_reached') {
      setStatus(`✅ คุณมีงานครบ ${data.limit} รายการแล้วครับ (สูงสุดสำหรับ Free) ลองลบงานเก่าที่ไม่ใช้แล้ว หรืออัปเกรด Premium เพื่อเพิ่มได้ไม่จำกัด`);
    } else {
      setStatus('❌ เพิ่มงานไม่สำเร็จ');
    }
  }

  async function updateTask(id, patch) {
    setTasks(prev => prev?.map(t => t.id === id ? { ...t, ...patch } : t));
    const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!res.ok) load();
    else if ('archived' in patch) load();
  }

  async function deleteTask(id) {
    setTasks(prev => prev?.filter(t => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  return (
    <main className="page">
      <DashNav current="tasks" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>✅ งานของฉัน</h1>
        <button className="glass-btn-outline" onClick={() => { const v = !showArchived; setShowArchived(v); load(v); }}>
          {showArchived ? '⬅️ กลับไปงานปกติ' : '🗄️ ดูคลังเก็บ'}
        </button>
      </div>
      {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}
      {!showArchived && <Composer onCreate={createTask} />}
      {tasks === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {tasks?.length === 0 && <div className="glass-card"><p className="muted">{showArchived ? 'ยังไม่มีงานในคลังเก็บ' : 'ไม่มีงานค้างครับ 🎉'}</p></div>}
      <div className="list-stack">
        {tasks?.map(t => <TaskRow key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} autoEditId={autoEditId} />)}
      </div>
    </main>
  );
}
