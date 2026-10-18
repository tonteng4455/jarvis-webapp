'use client';
// app/dashboard/_convert.jsx — turning one kind of item into another (note ⇄ task ⇄ appointment).
//   · ConvertChooser: "เปลี่ยนเป็น…" sheet listing the two other kinds
//   · convertItem(): create the new item, then remove the old one after the usual 6-second undo window —
//     undoing brings the old one back AND deletes the new one. Used by the notes, tasks and calendar pages.
//   · payload builders for the conversions that need no extra questions (→ note)

import { createPortal } from 'react-dom';

export const KIND_LABEL = { note: '📝 โน้ต', task: '✅ งาน', event: '📅 นัดหมาย' };
const KIND_WORD = { note: 'โน้ต', task: 'งาน', event: 'นัดหมาย' };
export const CONVERT_TARGETS = { note: ['task', 'event'], task: ['event', 'note'], event: ['task', 'note'] };
const HINT = {
  task: 'ตั้งวัน-เวลาที่ต้องเสร็จ แล้วใช้ติ๊กเสร็จ/เตือนได้',
  event: 'ตั้งวัน-เวลานัด ส่งเข้า Google Calendar',
  note: 'เก็บเป็นโน้ตธรรมดา ไม่มีวัน-เวลา',
};

export function ConvertChooser({ from, onPick, onCancel }) {
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }}>
      <div className="convert-sheet" role="dialog" aria-label={`เปลี่ยน${KIND_WORD[from]}เป็น`}>
        <h2 className="convert-title">🔄 เปลี่ยน{KIND_WORD[from]}นี้เป็น…</h2>
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {CONVERT_TARGETS[from].map(to => (
            <button key={to} type="button" className="convert-choice" data-to={to} onClick={() => onPick(to)}>
              <b>{KIND_LABEL[to]}</b><span className="muted">{HINT[to]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="glass-btn-outline" style={{ width: '100%', marginTop: '0.8rem' }} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>,
    document.body
  );
}

const ENDPOINT = { note: '/api/notes', task: '/api/tasks', event: '/api/calendar' };
const CREATED_KEY = { note: 'note', task: 'task', event: 'event' };

async function createItem(kind, payload) {
  let res;
  try { res = await fetch(ENDPOINT[kind], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch { return { ok: false }; }
  const data = await res.json().catch(() => ({}));
  const id = data?.[CREATED_KEY[kind]]?.id;
  return res.ok && id ? { ok: true, id } : { ok: false, error: data?.error };
}
const removeItem = (kind, id, opts = {}) => fetch(`${ENDPOINT[kind]}/${id}`, { method: 'DELETE', ...opts });

// → true when the new item was created (the old one is then on its way out, undo-able for 6 s).
export async function convertItem({ toast, fromKind, toKind, item, title, payload, removeLocal, restoreLocal, reload }) {
  const made = await createItem(toKind, payload);
  if (!made.ok) {
    toast.show(made.error === 'quota_reached' ? `❌ ${KIND_WORD[toKind]}ครบจำนวนที่สร้างได้แล้ว` : `❌ สร้าง${KIND_WORD[toKind]}ไม่สำเร็จ`, { tone: 'error' });
    return false;
  }
  toast.undoableDelete({
    id: item.id,
    label: `เปลี่ยน${KIND_WORD[fromKind]}เป็น${KIND_WORD[toKind]} “${String(title || '').slice(0, 24)}” แล้ว`,
    remove: removeLocal,
    commit: async () => {
      try { const r = await removeItem(fromKind, item.id, { keepalive: true }); if (!r.ok) throw new Error(String(r.status)); }
      catch { toast.show(`❌ ลบ${KIND_WORD[fromKind]}เดิมไม่สำเร็จ`, { tone: 'error' }); reload?.(); }
    },
    restore: () => { removeItem(toKind, made.id).catch(() => {}); restoreLocal(); },
  });
  return true;
}

// ---- payloads for the "→ note" conversions (nothing to ask the person) ----
const bkk = (iso, withTime) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'long', ...(withTime ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Bangkok' });

export function taskToNotePayload(task) {
  const lines = [];
  if (task.details?.trim()) lines.push(task.details.trim());
  if (task.due_at) lines.push(`⏰ ครบกำหนด ${bkk(task.due_at, !task.due_all_day)}`);
  return { title: task.task_name || '', content: lines.join('\n\n'), category: 'general' };
}

export function eventToNotePayload(ev) {
  const head = [`📅 ${bkk(ev.start_time, true)}`, ev.location && `📍 ${ev.location}`].filter(Boolean).join('\n');
  return { title: ev.title || '', content: [head, ev.description?.trim()].filter(Boolean).join('\n\n'), category: 'general' };
}
