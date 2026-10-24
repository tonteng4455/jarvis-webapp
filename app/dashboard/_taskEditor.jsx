'use client';
// app/dashboard/_taskEditor.jsx — the task editor (name + details + due + priority) and the
// "turn this note into a task" sheet. The details box is the same editor as a note body, so
// "- " / "[] " / "1. " lists, indent, drag, undo all work the same way.

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BlockEditor, ToolBtn, EditorOverlay } from './_noteEditor';
import { DueFields } from './_due';
import { useEscape } from './_convert';
import { buildDue, dueInputs } from '../../lib/taskDue';
import { previewText, plainText } from '../../lib/noteBlocks';

export const PRIORITY_COLOR = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };
export const PRIORITY_LABEL = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };
const LIST_GLYPH = { text: '☰', num: '1.', bullet: '•', check: '☑' };
const LIST_LABEL = { text: 'ข้อความ', num: 'เลขข้อ', bullet: 'จุด', check: 'ช่องติ๊ก' };

export function PriorityChips({ value, onChange }) {
  return (
    <div className="chip-row" style={{ marginBottom: 0 }} onMouseDown={e => e.stopPropagation()}>
      {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
        <button key={key} type="button" className={`chip${value === key ? ' active' : ''}`} onClick={() => onChange(key)}
          style={value === key ? { borderColor: PRIORITY_COLOR[key], color: PRIORITY_COLOR[key], background: 'var(--surface-muted)' } : undefined}>
          {key === 'high' ? '🔴' : key === 'medium' ? '🟠' : '🟢'} {label}
        </button>
      ))}
    </div>
  );
}

// ---- the editor panel (inside <EditorOverlay><div className="note-editor-modal note-composer">) ----
export function TaskEditorPanel({
  isNew, name, onName, details, onDetails, due, onDue, priority, onPriority,
  archived, onArchive, onDelete, onConvert, onDone, doneDisabled,
}) {
  const [info, setInfo] = useState({ list: false, type: 'text', canIndent: false, canOutdent: false });
  const bodyRef = useRef(null);
  return (
    <>
      <div className="ne-toolbar" role="toolbar" aria-label="เครื่องมืองาน">
        {onArchive && <ToolBtn title={archived ? 'ย้ายกลับไปงานปกติ' : 'เก็บเข้าคลัง'} onClick={onArchive}>{archived ? '↩️' : '🗄️'}</ToolBtn>}
        {onConvert && <ToolBtn title="เปลี่ยนงานนี้เป็นนัดหมายหรือโน้ต" onClick={onConvert}>🔄</ToolBtn>}
        {onDelete && <ToolBtn title={isNew ? 'ทิ้งร่างนี้' : 'ลบ (เลิกทำได้)'} onClick={onDelete}>🗑️</ToolBtn>}
        <span className="ne-spacer" />
        <ToolBtn title={`รายการ: กดเพื่อสลับ เลขข้อ → จุด → ช่องติ๊ก → ข้อความ (ตอนนี้: ${LIST_LABEL[info.type] || 'ข้อความ'})`} active={info.list} className="ne-list" onClick={() => bodyRef.current?.cycle()}>{LIST_GLYPH[info.type] || '☰'}</ToolBtn>
        <ToolBtn title="ลดย่อหน้า" disabled={!info.canOutdent} onClick={() => bodyRef.current?.indent(-1)}>⇤</ToolBtn>
        <ToolBtn title="เพิ่มย่อหน้า" disabled={!info.canIndent} onClick={() => bodyRef.current?.indent(1)}>⇥</ToolBtn>
        <ToolBtn title="เสร็จสิ้น" className="ne-done" disabled={doneDisabled} onClick={onDone}>✓</ToolBtn>
      </div>
      <input className="note-title-input" placeholder="ชื่องาน" value={name} onChange={e => onName(e.target.value)} autoFocus={isNew}
        enterKeyHint="next" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); bodyRef.current?.focusStart(); } }} />

      <div className="te-section" onMouseDown={e => e.stopPropagation()}>
        <div className="te-label">⏰ วัน-เวลาที่ต้องเสร็จ</div>
        <DueFields value={due} onChange={onDue} />
      </div>
      <div className="te-section">
        <div className="te-label">ความสำคัญ</div>
        <PriorityChips value={priority} onChange={onPriority} />
      </div>

      <div className="te-label" style={{ marginTop: '0.9rem' }}>📝 รายละเอียด</div>
      <BlockEditor ref={bodyRef} initial={details} onChange={onDetails} onActive={setInfo} placeholder="พิมพ์รายละเอียด หรือใช้ - [] 1. ทำรายการย่อย..." />

      <div className="ne-bottom" onMouseDown={e => e.stopPropagation()}>
        <span className="ne-spacer" />
        <ToolBtn title="เลิกทำ (Ctrl+Z)" disabled={!info.canUndo} onClick={() => bodyRef.current?.undo()}>↶</ToolBtn>
        <ToolBtn title="ทำซ้ำ (Ctrl+Shift+Z)" disabled={!info.canRedo} onClick={() => bodyRef.current?.redo()}>↷</ToolBtn>
      </div>
    </>
  );
}

// ---- the editor as a full-screen modal: opens for an existing task or a new one ----
// Existing task: saved shortly after you stop typing, on ✓, on click-away and when the page is hidden.
// New task: created on ✓ / click-away / page hidden once it has a name; 🗑️ throws the draft away.
export function TaskEditorModal({ task, onCreate, onUpdate, onDiscard, onClose, onDelete, onArchive, onConvert }) {
  const isNew = !task;
  const [name, setName] = useState(task?.task_name || '');
  const [details, setDetails] = useState(task?.details || '');
  const [due, setDue] = useState(() => dueInputs(task));
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const ref = useRef(null);
  const finished = useRef(false);

  const cur = useRef({}); cur.current = { name, details, due, priority };
  const sent = useRef({ name: task?.task_name || '', details: task?.details || '', due: JSON.stringify(dueInputs(task)), priority: task?.priority || 'medium' });

  // A NEW task is created ONCE (the first time it has a name) and every later save updates that same task — so the autosave
  // timer, "page went to the background", ✓ and click-away can fire in any order without making copies. Saves run in order.
  const created = useRef(null);                  // { id, sent } once the task exists
  const chain = useRef(Promise.resolve());
  const discarded = useRef(false);
  const leaving = useRef(false), leaveTried = useRef(false);
  const snap = c => ({ name: c.name.trim(), details: c.details, priority: c.priority, due: JSON.stringify(c.due) });
  const persistNew = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (discarded.current) return;
      const c = cur.current;
      if (!created.current) {
        if (!c.name.trim()) return;
        if (leaving.current) { if (leaveTried.current) return; leaveTried.current = true; }   // closing the page: one attempt only (a reported failure may still have arrived)
        const d = buildDue(c.due.date, c.due.time);
        const made = await onCreate({ task_name: c.name.trim(), details: c.details, priority: c.priority, ...(d || {}) }, { quiet: true });
        if (made?.id) created.current = { id: made.id, sent: snap(c) };
        return;
      }
      const now = snap(c), sent = created.current.sent, patch = {};
      if (c.name.trim() && now.name !== sent.name) patch.task_name = now.name;
      if (now.details !== sent.details) patch.details = c.details;
      if (now.priority !== sent.priority) patch.priority = c.priority;
      if (now.due !== sent.due) Object.assign(patch, buildDue(c.due.date, c.due.time) || { due_at: null, due_all_day: false });
      if (!Object.keys(patch).length) return;
      created.current.sent = { ...now, name: patch.task_name ?? sent.name };
      await onUpdate(created.current.id, patch);
    }).catch(() => {});
    return chain.current;
  }, [onCreate, onUpdate]);

  const persist = useCallback(() => {
    const c = cur.current;
    if (isNew) { if (discarded.current) return false; persistNew(); return true; }
    const patch = {};
    if (c.name.trim() && c.name !== sent.current.name) patch.task_name = c.name.trim();
    if (c.details !== sent.current.details) patch.details = c.details;
    if (c.priority !== sent.current.priority) patch.priority = c.priority;
    if (JSON.stringify(c.due) !== sent.current.due) Object.assign(patch, buildDue(c.due.date, c.due.time) || { due_at: null, due_all_day: false });
    if (!Object.keys(patch).length) return true;
    const before = sent.current;
    const mine = { name: patch.task_name ?? sent.current.name, details: c.details, due: JSON.stringify(c.due), priority: c.priority };
    sent.current = mine;
    Promise.resolve(onUpdate(task.id, patch))
      .then(okSent => { if (okSent === false && sent.current === mine) sent.current = before; })      // could not be sent: retry on the next save
      .catch(() => { if (sent.current === mine) sent.current = before; });
    return true;
  }, [isNew, onUpdate, task, persistNew]);
  const persistRef = useRef(persist); persistRef.current = persist;

  const done = () => { persistRef.current(); finished.current = true; onClose(); };
  const discard = () => {                         // 🗑️ "ทิ้งร่างนี้" — also removes a copy that was already auto-saved
    finished.current = true; discarded.current = true; onClose();
    chain.current = chain.current.then(async () => { const c = created.current; created.current = null; if (c && onDiscard) await onDiscard(c.id); }).catch(() => {});
  };

  useEffect(() => {                               // saved shortly after you stop typing (a new task: once it has a name)
    const t = setTimeout(() => persistRef.current(), 1500);
    return () => clearTimeout(t);
  }, [isNew, name, details, due, priority]);
  useEffect(() => {
    const flush = () => persistRef.current();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    const onHide = () => { leaving.current = true; flush(); };
    const onShow = () => { leaving.current = false; leaveTried.current = false; };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('online', flush);            // the connection came back: send what could not go out
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow); window.removeEventListener('online', flush); leaving.current = true; flush(); };
  }, []);
  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) done(); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorOverlay>
      <div className="note-editor-modal note-composer" ref={ref}>
        <TaskEditorPanel isNew={isNew}
          name={name} onName={setName} details={details} onDetails={setDetails} due={due} onDue={setDue}
          priority={priority} onPriority={setPriority}
          archived={!!task?.archived}
          onArchive={!isNew ? () => { finished.current = true; persistRef.current(); onArchive(task); } : undefined}
          onDelete={isNew ? discard : () => { finished.current = true; onDelete(task); }}
          onConvert={!isNew && onConvert ? () => { persistRef.current(); finished.current = true; onClose(); onConvert({ ...task, task_name: name.trim() || task.task_name, details, ...(buildDue(due.date, due.time) || { due_at: null, due_all_day: false }) }); } : undefined}
          onDone={done} />
      </div>
    </EditorOverlay>
  );
}

// ---- note → task ----
// The task's name is the note's title (or its first line) and the note's text becomes the details.
export function splitNoteForTask(note) {
  const title = (note.title || '').trim();
  const content = String(note.content || '');
  if (title) {
    // bot-made notes use the first 50 characters of the text as the title — do not repeat it in the details
    const body = content.trim().startsWith(title) ? content.trim().slice(title.length).replace(/^\n+/, '') : content;
    return { name: title, details: body };
  }
  const lines = content.split('\n');
  const i = lines.findIndex(l => l.trim());
  if (i < 0) return { name: '', details: '' };
  const first = previewText(lines[i]).replace(/^[•☐☑]\s*/, '').replace(/^\d+\.\s*/, '');
  // nothing is dropped: what does not fit in the name goes to the start of the details
  const over = first.slice(200);
  return { name: first.slice(0, 200), details: [over, lines.slice(i + 1).join('\n').replace(/^\n+/, '')].filter(Boolean).join('\n') };
}

// Also used for appointment → task: pass `source` ({ name, details }), `initialDue` and the wording instead of a note.
// Notes keep photos only as Drive references; when a note becomes a task/appointment they travel along as links.
export function noteImageLines(note) {
  return (Array.isArray(note?.images) ? note.images : []).filter(i => i?.drive_file_id)
    .map(i => `📷 ${i.name || 'รูปภาพ'} — https://drive.google.com/file/d/${i.drive_file_id}/view`);
}
export function noteSource(note) {
  const src = splitNoteForTask(note);
  const pics = noteImageLines(note).join('\n');
  return { name: src.name, details: [src.details, pics].filter(s => s && s.trim()).join('\n\n') };
}
export const TASK_DETAILS_MAX = 20000, EVENT_DESCRIPTION_MAX = 2000;   // keep in sync with /api/tasks and /api/calendar

export function ConvertToTaskSheet({ note, source, initialDue, heading = '✅ เปลี่ยนโน้ตเป็นงาน', detailsLabel = 'รายละเอียด (จากเนื้อหาโน้ต)', footnote = 'โน้ตเดิมจะถูกลบหลังสร้างงาน (กด “เลิกทำ” ได้ 6 วินาที)', onCancel, onConfirm }) {
  const init = source || splitNoteForTask(note);
  const [name, setName] = useState(init.name);
  const [due, setDue] = useState(initialDue || { date: '', time: '' });
  const [priority, setPriority] = useState('medium');
  const [busy, setBusy] = useState(false);
  useEscape(onCancel);
  const d = buildDue(due.date, due.time);
  const tooLong = (init.details || '').length > TASK_DETAILS_MAX;
  const ready = !!name.trim() && !!d && !busy && !tooLong;
  async function go() {
    if (!ready) return;
    setBusy(true);
    await onConfirm({ task_name: name.trim(), details: init.details, priority, ...d });
    setBusy(false);
  }
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => e.stopPropagation()}>
      <div className="convert-sheet" role="dialog" aria-modal="true" aria-label={heading}>
        <h2 className="convert-title">{heading}</h2>
        <label className="te-label">ชื่องาน</label>
        <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="ชื่องาน" autoFocus />
        <div className="te-section">
          <div className="te-label">⏰ วัน-เวลาที่ต้องเสร็จ <span style={{ color: 'var(--danger)' }}>*</span></div>
          <DueFields value={due} onChange={setDue} />
        </div>
        <div className="te-section">
          <div className="te-label">ความสำคัญ</div>
          <PriorityChips value={priority} onChange={setPriority} />
        </div>
        {init.details.trim() && (
          <div className="te-section">
            <div className="te-label">{detailsLabel}</div>
            <div className="convert-preview">{previewText(init.details) || init.details}</div>
          </div>
        )}
        <p className="muted" style={{ margin: '0.6rem 0 0' }}>{footnote}</p>
        <div className="convert-actions">
          <button type="button" className="glass-btn-outline" onClick={onCancel} style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)', background: 'var(--surface-muted)' }}>ยกเลิก</button>
          <button type="button" className="glass-btn" onClick={go} disabled={!ready}>{busy ? 'กำลังสร้าง...' : 'สร้างงาน'}</button>
        </div>
        {tooLong && <p style={{ margin: '0.4rem 0 0', color: 'var(--danger)', textAlign: 'right' }}>ข้อความยาวเกิน {TASK_DETAILS_MAX.toLocaleString()} ตัวอักษร — ย่อก่อนจึงจะเปลี่ยนเป็นงานได้ (ไม่ตัดข้อความทิ้งให้)</p>}
        {!d && <p className="muted" style={{ margin: '0.4rem 0 0', textAlign: 'right' }}>เลือกวันที่ก่อนจึงสร้างงานได้</p>}
      </div>
    </div>,
    document.body
  );
}

// ---- task → appointment ----
// An appointment needs a start TIME, so the date AND the time are both required here
// (prefilled from the task's due date when it has one).
const EVENT_REMINDERS = [
  { value: '', label: '⚙️ ค่าเริ่มต้นของปฏิทิน' }, { value: '-1', label: '🔕 ไม่เตือน' }, { value: '10', label: '⏰ 10 นาทีก่อน' },
  { value: '30', label: '⏰ 30 นาทีก่อน' }, { value: '60', label: '⏰ 1 ชม.ก่อน' }, { value: '1440', label: '⏰ 1 วันก่อน' },
];

// `source` = { title, details, due: { date, time } } — from a task (prefilled from its due date) or from a note.
const RECUR = { daily: 'ทุกวัน', weekly: 'ทุกสัปดาห์', monthly: 'ทุกเดือน' };
export const recurrenceLine = task => task?.recurrence ? `🔁 เดิมเป็นงานทำซ้ำ ${RECUR[task.recurrence] || ''}${task.recurrence_time ? ` เวลา ${task.recurrence_time}` : ''} (การทำซ้ำถูกยกเลิก)` : '';
export function eventSourceFromTask(task) { return { title: task.task_name || '', details: [task.details || '', recurrenceLine(task)].filter(Boolean).join('\n\n'), due: dueInputs(task) }; }
export function ConvertToEventSheet({ task, source, heading = '📅 เปลี่ยนงานเป็นนัดหมาย', detailsLabel = 'รายละเอียด (จากงาน)', footnote = 'งานเดิมจะถูกลบหลังสร้างนัด (กด “เลิกทำ” ได้ 6 วินาที) และนัดจะถูกส่งไป Google Calendar', onCancel, onConfirm }) {
  const src = source || eventSourceFromTask(task);
  const pre = src.due;
  const [title, setTitle] = useState(src.title || '');
  const [date, setDate] = useState(pre.date);
  const [time, setTime] = useState(pre.time);
  const [reminder, setReminder] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  useEscape(onCancel);
  const d = buildDue(date, time);
  const description = plainText(src.details || '').trim();
  const tooLong = description.length > EVENT_DESCRIPTION_MAX;
  const ready = !!title.trim() && !!date && !!time && !!d && !busy && !tooLong;
  async function go() {
    if (!ready) return;
    setBusy(true);
    const start = new Date(d.due_at);
    await onConfirm({
      title: title.trim(), start_time: start.toISOString(), end_time: new Date(start.getTime() + 3600000).toISOString(),
      location: location.trim() || null, description: description || null,
      reminder_minutes: reminder === '' ? null : parseInt(reminder, 10),
    });
    setBusy(false);
  }
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => e.stopPropagation()}>
      <div className="convert-sheet" role="dialog" aria-modal="true" aria-label={heading}>
        <h2 className="convert-title">{heading}</h2>
        <label className="te-label">หัวเรื่อง</label>
        <input className="glass-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="หัวเรื่องนัด" autoFocus />
        <div className="te-section">
          <div className="te-label">🕐 วันและเวลานัด <span style={{ color: 'var(--danger)' }}>*</span></div>
          <DueFields value={{ date, time }} onChange={v => { setDate(v.date); setTime(v.time); }} dateLabel="วันที่นัด" timeLabel="เวลานัด" clearable={false} />
          {!!date && !time && <p className="muted" style={{ margin: '0.3rem 0 0', color: 'var(--danger)' }}>นัดหมายต้องมีเวลา — เลือกเวลาด้วยครับ</p>}
        </div>
        <div className="te-section">
          <div className="te-label">การแจ้งเตือน</div>
          <select className="glass-input" value={reminder} onChange={e => setReminder(e.target.value)}>
            {EVENT_REMINDERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="te-section">
          <div className="te-label">สถานที่</div>
          <input className="glass-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="ไม่บังคับ" />
        </div>
        {description && (
          <div className="te-section">
            <div className="te-label">{detailsLabel}</div>
            <div className="convert-preview">{description}</div>
          </div>
        )}
        {tooLong && <p style={{ margin: '0.5rem 0 0', color: 'var(--danger)' }}>รายละเอียดยาว {description.length.toLocaleString()} ตัวอักษร เกินที่นัดหมายเก็บได้ ({EVENT_DESCRIPTION_MAX.toLocaleString()}) — เปลี่ยนเป็นงานหรือโน้ตแทน หรือย่อก่อน (จะไม่ตัดข้อความทิ้งให้)</p>}
        <p className="muted" style={{ margin: '0.6rem 0 0' }}>{footnote}</p>
        <div className="convert-actions">
          <button type="button" className="glass-btn-outline" onClick={onCancel} style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)', background: 'var(--surface-muted)' }}>ยกเลิก</button>
          <button type="button" className="glass-btn" onClick={go} disabled={!ready}>{busy ? 'กำลังสร้าง...' : 'สร้างนัดหมาย'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
