'use client';
// app/dashboard/_taskEditor.jsx — the task editor (name + details + due + priority) and the
// "turn this note into a task" sheet. The details box is the same editor as a note body, so
// "- " / "[] " / "1. " lists, indent, drag, undo all work the same way.

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BlockEditor, ToolBtn, EditorOverlay } from './_noteEditor';
import { DueFields } from './_due';
import { buildDue, dueInputs } from '../../lib/taskDue';
import { previewText } from '../../lib/noteBlocks';

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
  archived, onArchive, onDelete, onDone, doneDisabled,
}) {
  const [info, setInfo] = useState({ list: false, type: 'text', canIndent: false, canOutdent: false });
  const bodyRef = useRef(null);
  return (
    <>
      <div className="ne-toolbar" role="toolbar" aria-label="เครื่องมืองาน">
        {onArchive && <ToolBtn title={archived ? 'ย้ายกลับไปงานปกติ' : 'เก็บเข้าคลัง'} onClick={onArchive}>{archived ? '↩️' : '🗄️'}</ToolBtn>}
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
export function TaskEditorModal({ task, onCreate, onUpdate, onClose, onDelete, onArchive }) {
  const isNew = !task;
  const [name, setName] = useState(task?.task_name || '');
  const [details, setDetails] = useState(task?.details || '');
  const [due, setDue] = useState(() => dueInputs(task));
  const [priority, setPriority] = useState(task?.priority || 'medium');
  const ref = useRef(null);
  const finished = useRef(false);

  const cur = useRef({}); cur.current = { name, details, due, priority };
  const sent = useRef({ name: task?.task_name || '', details: task?.details || '', due: JSON.stringify(dueInputs(task)), priority: task?.priority || 'medium' });

  const persist = useCallback(() => {
    const c = cur.current;
    if (isNew) {
      if (finished.current || !c.name.trim()) return false;
      finished.current = true;
      const d = buildDue(c.due.date, c.due.time);
      onCreate({ task_name: c.name.trim(), details: c.details, priority: c.priority, ...(d || {}) });
      return true;
    }
    const patch = {};
    if (c.name.trim() && c.name !== sent.current.name) patch.task_name = c.name.trim();
    if (c.details !== sent.current.details) patch.details = c.details;
    if (c.priority !== sent.current.priority) patch.priority = c.priority;
    if (JSON.stringify(c.due) !== sent.current.due) Object.assign(patch, buildDue(c.due.date, c.due.time) || { due_at: null, due_all_day: false });
    if (!Object.keys(patch).length) return true;
    sent.current = { name: patch.task_name ?? sent.current.name, details: c.details, due: JSON.stringify(c.due), priority: c.priority };
    onUpdate(task.id, patch);
    return true;
  }, [isNew, onCreate, onUpdate, task]);
  const persistRef = useRef(persist); persistRef.current = persist;

  const done = () => { persistRef.current(); finished.current = true; onClose(); };
  const discard = () => { finished.current = true; onClose(); };

  useEffect(() => {
    if (isNew) return undefined;
    const t = setTimeout(() => persistRef.current(), 1500);
    return () => clearTimeout(t);
  }, [isNew, name, details, due, priority]);
  useEffect(() => {
    const flush = () => persistRef.current();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); flush(); };
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
  if (title) return { name: title, details: content };
  const lines = content.split('\n');
  const i = lines.findIndex(l => l.trim());
  if (i < 0) return { name: '', details: '' };
  const first = previewText(lines[i]).replace(/^[•☐☑]\s*/, '').replace(/^\d+\.\s*/, '');
  return { name: first.slice(0, 120), details: lines.slice(i + 1).join('\n').replace(/^\n+/, '') };
}

export function ConvertToTaskSheet({ note, onCancel, onConfirm }) {
  const init = splitNoteForTask(note);
  const [name, setName] = useState(init.name);
  const [due, setDue] = useState({ date: '', time: '' });
  const [priority, setPriority] = useState('medium');
  const [busy, setBusy] = useState(false);
  const d = buildDue(due.date, due.time);
  const ready = !!name.trim() && !!d && !busy;
  async function go() {
    if (!ready) return;
    setBusy(true);
    await onConfirm({ task_name: name.trim(), details: init.details, priority, ...d });
    setBusy(false);
  }
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => e.stopPropagation()}>
      <div className="convert-sheet" role="dialog" aria-label="เปลี่ยนโน้ตเป็นงาน">
        <h2 className="convert-title">✅ เปลี่ยนโน้ตเป็นงาน</h2>
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
            <div className="te-label">รายละเอียด (จากเนื้อหาโน้ต)</div>
            <div className="convert-preview">{previewText(init.details) || init.details}</div>
          </div>
        )}
        <p className="muted" style={{ margin: '0.6rem 0 0' }}>โน้ตเดิมจะถูกลบหลังสร้างงาน (กด “เลิกทำ” ได้ 6 วินาที)</p>
        <div className="convert-actions">
          <button type="button" className="glass-btn-outline" onClick={onCancel} style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)', background: 'var(--surface-muted)' }}>ยกเลิก</button>
          <button type="button" className="glass-btn" onClick={go} disabled={!ready}>{busy ? 'กำลังสร้าง...' : 'สร้างงาน'}</button>
        </div>
        {!d && <p className="muted" style={{ margin: '0.4rem 0 0', textAlign: 'right' }}>เลือกวันที่ก่อนจึงสร้างงานได้</p>}
      </div>
    </div>,
    document.body
  );
}
