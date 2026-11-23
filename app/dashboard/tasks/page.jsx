'use client';
// app/dashboard/tasks/page.jsx — Task editor (Premium only): checkbox
// to mark done, archive, delete, and a recurring routine (daily/
// weekly/monthly) that syncs a reminder to Google Calendar.

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { consumeDeepLinkId } from '../../../lib/deepLink';
import { useSearchParams } from 'next/navigation';
import { DashNav } from '../_components';
import { apiGet, ErrorState, Fab, ListSkeleton, useRefreshOnReturn, useToast, withoutPending } from '../_ui';
import { DueChip, DuePicker } from '../_due';
import { ActionSheet } from '../_actionSheet';
import { TaskEditorModal, ConvertToEventSheet, PRIORITY_COLOR, PRIORITY_LABEL } from '../_taskEditor';
import { ConvertChooser, convertItem, taskToNotePayload } from '../_convert';
import { previewText } from '../../../lib/noteBlocks';
import { completeAllChecks, formatMoment } from '../../../lib/taskChecks';
import { TaskProgress, PROGRESS_STYLES, useProgressStyle } from '../_taskProgress';
import { dueState, sortTasks } from '../../../lib/taskDue';
import { AddedBy } from '../_space';
import { BY_EDITED, BY_OLDEST, BY_TITLE, SortSolo, useSortPref, stampOf, thCompare } from '../_sort';

const TASK_SORTS = [BY_EDITED, { key: 'due', icon: '⏰', label: 'ใกล้ครบกำหนดก่อน' }, BY_OLDEST, BY_TITLE];
// open tasks first in every order (finished ones sink to the bottom)
function orderTasks(list, key) {
  if (!list) return list;
  if (key === 'due') return sortTasks(list);
  const by = key === 'oldest' ? (a, b) => stampOf(a) - stampOf(b) : key === 'title' ? (a, b) => thCompare(a.task_name, b.task_name) : (a, b) => stampOf(b) - stampOf(a);
  return [...list].sort((a, b) => (Number(!!a.is_done) - Number(!!b.is_done)) || by(a, b));
}

const RECURRENCE_LABEL = { daily: '🔁 ทุกวัน', weekly: '🔁 ทุกสัปดาห์', monthly: '🔁 ทุกเดือน' };

// "＋ เพิ่มงานใหม่" opens the full task editor (name, details, due date, priority).
function AddBar({ onOpen }) {
  return (
    <div className="add-bar" onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <span className="add-bar-plus">＋</span><span>เพิ่มงานใหม่...</span>
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

function TaskRow({ task, onUpdate, onDelete, onOpen, onConvert, autoEditId, pstyle }) {
  const [routineOpen, setRoutineOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  // Coming from a LIFF link with ?id=... — jump straight to this task's
  // routine picker and scroll it into view.
  useEffect(() => {
    if (autoEditId && String(task.id) === String(autoEditId)) {
      setRoutineOpen(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      consumeDeepLinkId();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId]);

  const detailsPreview = previewText(task.details);

  return (
    <div className="glass-card" ref={ref} style={{ opacity: task.is_done ? 0.55 : 1, ...(dueState(task) === 'overdue' ? { borderLeft: '3px solid var(--danger)' } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <input type="checkbox" checked={!!task.is_done} onChange={() => onUpdate(task.id, { is_done: !task.is_done })}
          className="big-check" />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] || 'var(--text-secondary)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpen(task)} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') onOpen(task); }} title="แตะเพื่อแก้ไข / ดูรายละเอียด">
          <div style={{ fontSize: '0.9rem', textDecoration: task.is_done ? 'line-through' : 'none' }}>{task.task_name} <AddedBy item={task} /></div>
          {task.details && <div style={{ marginTop: '0.2rem' }}><TaskProgress details={task.details} variant={pstyle} /></div>}
          {task.is_done && task.done_at && <div className="muted" style={{ fontSize: '0.72rem' }}>✓ เสร็จเมื่อ {formatMoment(task.done_at)}</div>}
          {detailsPreview && <div className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detailsPreview}</div>}
          <div className="muted">
            {task.category && task.category !== 'general' && <>{task.category} · </>}{PRIORITY_LABEL[task.priority] || task.priority}
            {task.recurrence && <> · {RECURRENCE_LABEL[task.recurrence]} {task.recurrence_time}</>}
          </div>
          {task.due_at && <div style={{ marginTop: '0.25rem' }}><span role="button" tabIndex={0} title="แตะเพื่อแก้วัน-เวลา" style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); setDueOpen(v => !v); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setDueOpen(v => !v); } }}><DueChip task={task} /></span></div>}
        </div>
        {/* phone: one "⋯" instead of the row of six buttons below */}
        <button type="button" className="task-more" aria-label="เมนูงาน" title="เมนู" onClick={() => setMenuOpen(true)}>⋯</button>
      </div>
      {menuOpen && (
        <ActionSheet title={task.task_name} onClose={() => setMenuOpen(false)} items={[
          { key: 'edit', icon: '✏️', label: 'แก้ไข', onClick: () => onOpen(task) },
          { key: 'due', icon: '⏰', label: 'กำหนดเวลา', onClick: () => setDueOpen(true) },
          { key: 'routine', icon: '🔁', label: 'ทำซ้ำ', onClick: () => setRoutineOpen(true) },
          !task.archived && { key: 'convert', icon: '🔄', label: 'เปลี่ยนเป็น…', onClick: () => onConvert(task) },
          task.archived ? { key: 'restore', icon: '↩️', label: 'เอากลับ', onClick: () => onUpdate(task.id, { archived: false }) }
            : { key: 'archive', icon: '🗄️', label: 'เก็บเข้าคลัง', onClick: () => onUpdate(task.id, { archived: true }) },
          { key: 'delete', icon: '🗑️', label: 'ลบ', danger: true, onClick: () => onDelete(task) },
        ]} />
      )}
      <div className="task-actions" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button className="note-icon-btn" onClick={() => onOpen(task)}>✏️ แก้ไข</button>
        <button className="note-icon-btn" onClick={() => setDueOpen(v => !v)}>⏰ กำหนด</button>
        <button className="note-icon-btn" onClick={() => setRoutineOpen(v => !v)}>🔁 ทำซ้ำ</button>
        {task.archived ? (
          <button className="note-icon-btn" onClick={() => onUpdate(task.id, { archived: false })}>↩️ กลับ</button>
        ) : (
          <button className="note-icon-btn" onClick={() => onUpdate(task.id, { archived: true })}>🗄️ เก็บ</button>
        )}
        {!task.archived && <button className="note-icon-btn" onClick={() => onConvert(task)}>🔄 เปลี่ยนเป็น…</button>}
        <button className="note-icon-btn" onClick={() => onDelete(task)}>🗑️ ลบ</button>
      </div>
      {dueOpen && <DuePicker task={task} onSave={patch => onUpdate(task.id, patch)} onClose={() => setDueOpen(false)} />}
      {routineOpen && <RoutinePicker task={task} onUpdate={onUpdate} onClose={() => setRoutineOpen(false)} />}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<main className="page"><ListSkeleton /></main>}>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const toast = useToast();
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState(null);
  const [convert, setConvert] = useState(null);     // { task, to: null | 'event' } — the "เปลี่ยนเป็น…" flow
  const [editor, setEditor] = useState(null);          // null | 'new' | the task being edited
  const [sortKey, pickSort] = useSortPref('jarvis_tasks_sort', TASK_SORTS);
  const [pstyle, pickPstyle] = useProgressStyle();            // how a checklist's progress is drawn: bar · donut · 2/5 · 40%
  const searchParams = useSearchParams();
  const autoEditId = searchParams.get('id');

  const load = useCallback(async (archived = showArchived) => {
    setError(false);
    try {
      const data = await apiGet(`/api/tasks?archived=${archived}`);
      setTasks(sortTasks(withoutPending(data.tasks)));
    } catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);
  useRefreshOnReturn(load);
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setEditor('new');
    window.history.replaceState(null, '', '/dashboard/tasks');
  }, [searchParams]);

  // → the created task (so the editor can keep updating THAT task instead of making another), or null.
  // quiet: an automatic save in the background does not pop up errors on every pause in typing.
  async function createTask(payload, { quiet = false } = {}) {
    let res;
    try {
      const body = JSON.stringify(payload);
      res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 });
    } catch { if (!quiet) toast.show('📶 ส่งไม่สำเร็จ (อินเทอร์เน็ตหลุด) ลองอีกครั้ง', { tone: 'warn' }); return null; }
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.dropped?.length) toast.show('⚠️ บันทึกงานแล้ว แต่ยังเก็บกำหนดส่ง/รายละเอียดไม่ได้ (ต้องรัน tasks_due.sql และ tasks_details.sql ใน Supabase)', { tone: 'warn', duration: 8000 });
      load(); return d.task || null;
    }
    const data = await res.json().catch(() => ({}));
    if (quiet) return null;
    if (data.error === 'quota_reached') {
      setStatus(`✅ คุณมีงานครบ ${data.limit} รายการแล้วครับ (สูงสุดสำหรับ Free) ลองลบงานเก่าที่ไม่ใช้แล้ว หรืออัปเกรด Premium เพื่อเพิ่มได้ไม่จำกัด`);
    } else {
      toast.show('❌ เพิ่มงานไม่สำเร็จ', { tone: 'error' });
    }
    return null;
  }

  // a draft that was already auto-saved and then thrown away: remove that copy too
  async function discardTask(id) {
    setTasks(prev => prev?.filter(t => t.id !== id));
    try { await fetch(`/api/tasks/${id}`, { method: 'DELETE', keepalive: true }); } catch { load(); }
  }

  // → true when the server has it, false when it could not be sent (the editor then keeps the change marked "unsent" and retries)
  const offlineToastAt = useRef(0);
  async function updateTask(id, patch) {
    const touched = { ...patch, updated_at: new Date().toISOString() };          // so "edited most recently first" is right at once
    // finishing a task ticks its open sub-checkboxes (the server does the same): show it at once
    const apply = t => (t.id !== id ? t : { ...t, ...touched, ...(patch.is_done === true ? { details: completeAllChecks(t.details) ?? t.details, done_at: touched.updated_at } : patch.is_done === false ? { done_at: null } : null) });
    setTasks(prev => prev && ('due_at' in patch ? sortTasks(prev.map(apply)) : prev.map(apply)));
    let res;
    try { res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), keepalive: true }); }
    catch {
      if (Date.now() - offlineToastAt.current > 20000) { offlineToastAt.current = Date.now(); toast.show('📶 อินเทอร์เน็ตหลุด — ที่แก้ไว้ยังอยู่ในหน้านี้ จะบันทึกให้เมื่อกลับมาออนไลน์ (หรือกด ✓)', { tone: 'warn', duration: 6000 }); }
      return false;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.show(err.error === 'due_unsupported' ? '❌ ยังตั้งวัน-เวลาไม่ได้ (ต้องรัน tasks_due.sql ใน Supabase ก่อน)'
        : err.error === 'details_unsupported' ? '❌ ยังบันทึกรายละเอียดไม่ได้ (ต้องรัน tasks_details.sql ใน Supabase ก่อน)' : '❌ บันทึกไม่สำเร็จ', { tone: 'error' });
      load();
      return false;
    }
    if ('archived' in patch) load();
    if ('is_done' in patch) {                         // what the server ended up with (its sub-checkbox ticks, the time it was finished)
      const j = await res.clone().json().catch(() => null);
      if (j?.task) setTasks(prev => prev?.map(t => (t.id === id ? { ...t, details: j.task.details, done_at: j.task.done_at ?? t.done_at } : t)));
    }
    return true;
  }

  function deleteTask(task) {
    toast.undoableDelete({
      id: task.id,
      label: `ลบงาน “${task.task_name}” แล้ว`,
      remove: () => setTasks(prev => prev?.filter(t => t.id !== task.id)),
      commit: async () => {
        try {
          const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', keepalive: true });
          if (!res.ok) throw new Error(String(res.status));
        } catch (e) { toast.show('❌ ลบไม่สำเร็จ', { tone: 'error' }); load(); }
      },
      restore: () => setTasks(prev => prev ? [...prev, task].sort((a, b) => (a.is_done - b.is_done) || b.created_at.localeCompare(a.created_at)) : prev),
    });
  }

  // Task → appointment / note: create the new item, then remove the task with the usual 6-second undo —
  // undoing brings the task back AND removes what was just created.
  function convertTask(task, toKind, payload, title) {
    return convertItem({
      toast, fromKind: 'task', toKind, item: task, title, payload,
      removeLocal: () => setTasks(prev => prev?.filter(t => t.id !== task.id)),
      restoreLocal: () => setTasks(prev => prev ? sortTasks([...prev, task]) : prev),
      reload: load,
    });
  }

  return (
    <main className="page">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>✅ งานของฉัน</h1>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <SortSolo options={TASK_SORTS} value={sortKey} onChange={pickSort} />
          <SortSolo options={PROGRESS_STYLES} value={pstyle} onChange={pickPstyle} glyph="📊" label="ความก้าวหน้า" />
          <button className="glass-btn-outline" onClick={() => { const v = !showArchived; setShowArchived(v); setTasks(null); load(v); }}>
            {showArchived ? '⬅️ กลับไปงานปกติ' : '🗄️ ดูคลังเก็บ'}
          </button>
        </div>
      </div>
      {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}
      {!showArchived && <AddBar onOpen={() => setEditor('new')} />}
      {error && <ErrorState onRetry={() => { setTasks(null); load(); }} />}
      {!error && tasks === null && <ListSkeleton />}
      {tasks?.length === 0 && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>{showArchived ? 'ยังไม่มีงานในคลังเก็บ' : 'ไม่มีงานค้างครับ 🎉'}</p></div>}
      <div className="list-stack">
        {orderTasks(tasks, sortKey)?.map(t => <TaskRow key={t.id} pstyle={pstyle} task={t} onUpdate={updateTask} onDelete={deleteTask} onOpen={setEditor} onConvert={t => setConvert({ task: t, to: null })} autoEditId={autoEditId} />)}
      </div>
      {!showArchived && <Fab onClick={() => setEditor('new')} label="เพิ่มงาน" />}
      {editor && (
        <TaskEditorModal key={editor === 'new' ? 'new' : editor.id} task={editor === 'new' ? null : editor}
          onCreate={createTask} onUpdate={updateTask} onDiscard={discardTask} onClose={() => setEditor(null)}
          onArchive={t => { updateTask(t.id, { archived: !t.archived }); setEditor(null); }}
          onDelete={t => { setEditor(null); deleteTask(t); }}
          onConvert={t => setConvert({ task: t, to: null })} />
      )}
      {convert && !convert.to && (
        <ConvertChooser from="task" recurring={!!(convert.task.recurrence || convert.task.google_event_id)} onCancel={() => setConvert(null)}
          onPick={async to => {
            if (to === 'note') { const ok = await convertTask(convert.task, 'note', taskToNotePayload(convert.task), convert.task.task_name); setConvert(null); return ok; }
            setConvert({ ...convert, to });
          }} />
      )}
      {convert?.to === 'event' && (
        <ConvertToEventSheet task={convert.task} onCancel={() => setConvert(null)}
          onConfirm={async payload => { const ok = await convertTask(convert.task, 'event', payload, payload.title); if (ok) setConvert(null); return ok; }} />
      )}
    </main>
  );
}
