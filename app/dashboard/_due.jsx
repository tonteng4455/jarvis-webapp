'use client';
// app/dashboard/_due.jsx — due date/time of tasks: the chip, the picker, and the
// "งานครบกำหนด" banner shown when the web app is opened.

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildDue, dueInputs, dueLabel, dueState, dueSoon, thaiDateKey } from '../../lib/taskDue';
import { useToast } from './_ui';

const DAY = 86400000;

export function DueChip({ task }) {
  const st = dueState(task);
  if (!task?.due_at) return null;
  return <span className={`due-chip due-${st || 'done'}`}>⏰ {dueLabel(task)}</span>;
}

// Date + time inputs with quick chips. `value` = { date: 'YYYY-MM-DD' | '', time: 'HH:MM' | '' }
export function DueFields({ value, onChange }) {
  const today = thaiDateKey(Date.now());
  const quick = [['วันนี้', today], ['พรุ่งนี้', thaiDateKey(Date.now() + DAY)], ['สัปดาห์หน้า', thaiDateKey(Date.now() + 7 * DAY)]];
  return (
    <div className="due-fields" onMouseDown={e => e.stopPropagation()}>
      <div className="due-quick">
        {quick.map(([label, d]) => (
          <button key={label} type="button" className={`chip${value.date === d ? ' active' : ''}`} onClick={() => onChange({ ...value, date: d })}>{label}</button>
        ))}
        {value.date && <button type="button" className="chip" onClick={() => onChange({ date: '', time: '' })}>ไม่กำหนด</button>}
      </div>
      <div className="due-inputs">
        <label><span className="muted">วันที่สิ้นสุด</span>
          <input type="date" className="glass-input" value={value.date} min={today} onChange={e => onChange({ ...value, date: e.target.value })} /></label>
        <label><span className="muted">เวลา (ไม่ใส่ = ทั้งวัน)</span>
          <input type="time" className="glass-input" value={value.time} disabled={!value.date} onChange={e => onChange({ ...value, time: e.target.value })} /></label>
      </div>
    </div>
  );
}

// Picker for an existing task (opened from the task row).
export function DuePicker({ task, onSave, onClose }) {
  const [v, setV] = useState(() => dueInputs(task));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const due = buildDue(v.date, v.time);
    await onSave(due ? due : { due_at: null, due_all_day: false });
    setSaving(false); onClose();
  }
  return (
    <div className="glass-card" style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>⏰ วัน-เวลาที่ต้องเสร็จ</div>
      <DueFields value={v} onChange={setV} />
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.7rem' }}>
        <button className="glass-btn-outline" onClick={onClose} style={{ color: 'var(--text-primary)', background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}>ยกเลิก</button>
        <button className="glass-btn" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
      </div>
    </div>
  );
}

// ---------- the banner ----------
// Checked when the app is opened, whenever it comes back to the foreground (at most every few
// minutes) and once a minute against the loaded list so a task turns "due" while the page is open.
// "ปิด" hides what is showing now for this visit; a task that becomes due later shows up again.
const REFRESH_MS = 3 * 60 * 1000;
const DISMISS_KEY = 'jarvis_due_dismissed';
const readDismissed = () => { try { return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')); } catch { return new Set(); } };

export function DueBanner() {
  const pathname = usePathname();
  const toast = useToast();
  const [tasks, setTasks] = useState(null);
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const last = useRef(0);

  const load = useCallback(async () => {
    last.current = Date.now();
    try {
      const res = await fetch('/api/tasks?archived=false');
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { /* offline — keep what we have */ }
  }, []);

  useEffect(() => { setDismissed(readDismissed()); load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last.current > REFRESH_MS) load(); setTick(n => n + 1); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => setTick(n => n + 1), 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [load]);
  // opening a task page / ticking something elsewhere changes the list — reload when navigating
  useEffect(() => { if (Date.now() - last.current > 15000) load(); }, [pathname, load]);

  const { overdue, today } = tasks ? dueSoon(tasks) : { overdue: [], today: [] };
  const all = [...overdue, ...today];
  const keyOf = t => `${t.id}@${t.due_at}`;
  const visible = all.filter(t => !dismissed.has(keyOf(t)));
  void tick;

  async function complete(t) {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_done: true } : x));
    const res = await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_done: true }) });
    if (!res.ok) { toast.show('❌ บันทึกไม่สำเร็จ', { tone: 'error' }); load(); }
  }
  function dismissAll() {
    const next = new Set([...dismissed, ...visible.map(keyOf)]);
    setDismissed(next); setOpen(false);
    try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }

  if (pathname?.startsWith('/dashboard/tasks') || visible.length === 0) return null;
  const nOver = visible.filter(t => dueState(t) === 'overdue').length;
  const nToday = visible.length - nOver;
  return (
    <div className={`due-banner${nOver ? ' has-overdue' : ''}`} role="status">
      <button type="button" className="due-banner-head" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="due-banner-icon">⏰</span>
        <span className="due-banner-text">
          {nOver > 0 && <b>เลยกำหนด {nOver} งาน</b>}{nOver > 0 && nToday > 0 && ' · '}{nToday > 0 && <b>ครบกำหนดวันนี้ {nToday} งาน</b>}
        </span>
        <span className="due-banner-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="due-banner-list">
          {visible.slice(0, 8).map(t => (
            <label key={t.id} className="due-banner-row">
              <input type="checkbox" className="big-check" checked={!!t.is_done} onChange={() => complete(t)} />
              <Link href={`/dashboard/tasks?id=${t.id}`} className="due-banner-name">{t.task_name}</Link>
              <span className={`due-chip due-${dueState(t)}`}>{dueLabel(t)}</span>
            </label>
          ))}
          <div className="due-banner-actions">
            <Link href="/dashboard/tasks" className="glass-btn-outline" style={{ textDecoration: 'none', color: 'var(--text-primary)' }}>ดูงานทั้งหมด</Link>
            <button type="button" className="glass-btn-outline" style={{ color: 'var(--text-primary)' }} onClick={dismissAll}>ปิดการแจ้งเตือน</button>
          </div>
        </div>
      )}
    </div>
  );
}
