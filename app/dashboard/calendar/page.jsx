'use client';
// app/dashboard/calendar/page.jsx — appointments.
// Two views of the same data: a month grid (like Google Calendar —
// dots on days that have something, tap a day to see/add its events,
// swipe to change month) and the original upcoming/past list. Events
// can be created, edited and cancelled here; saving syncs to Google
// Calendar through the bot Worker (see /api/calendar).

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, formatDate } from '../_components';
import { apiGet, ErrorState, Fab, ListSkeleton, useToast, withoutPending } from '../_ui';

const REMINDER_OPTIONS = [
  { value: '', label: '⚙️ ค่าเริ่มต้นของปฏิทิน' },
  { value: '-1', label: '🔕 ไม่เตือน' },
  { value: '10', label: '⏰ 10 นาทีก่อน' },
  { value: '30', label: '⏰ 30 นาทีก่อน' },
  { value: '60', label: '⏰ 1 ชม.ก่อน' },
  { value: '1440', label: '⏰ 1 วันก่อน' },
];

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeLabel = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function reminderLabel(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === -1) return '🔕 ไม่เตือน';
  if (minutes >= 1440 && minutes % 1440 === 0) return `⏰ เตือน ${minutes / 1440} วันก่อน`;
  if (minutes >= 60 && minutes % 60 === 0) return `⏰ เตือน ${minutes / 60} ชม.ก่อน`;
  return `⏰ เตือน ${minutes} นาทีก่อน`;
}

function splitDateTime(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// The 5–6 week grid for a month, starting on the Sunday on/before the 1st.
function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const end = new Date(start); end.setDate(start.getDate() + weeks * 7);
  return { days, start, end };
}

function EventEditor({ event, onSave, onCancel }) {
  const initial = splitDateTime(event.start_time);
  const [title, setTitle] = useState(event.title || '');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [reminder, setReminder] = useState(event.reminder_minutes === null || event.reminder_minutes === undefined ? '' : String(event.reminder_minutes));
  const [location, setLocation] = useState(event.location || '');
  const [description, setDescription] = useState(event.description || '');
  const [saving, setSaving] = useState(false);
  const isNew = !event.id;

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const start_time = date && time ? new Date(`${date}T${time}:00`).toISOString() : event.start_time;
    await onSave(event.id, {
      title: title.trim(), start_time, location: location || null, description: description || null,
      reminder_minutes: reminder === '' ? null : parseInt(reminder, 10),
    });
    setSaving(false);
  }

  return (
    <div className="glass-panel">
      <div style={{ marginBottom: '0.6rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>หัวเรื่อง</label>
        <input className="glass-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus={isNew} placeholder="เช่น ประชุมทีม" />
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>วันที่</label>
          <input type="date" className="glass-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>เวลา</label>
          <input type="time" className="glass-input" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: '0.6rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>การแจ้งเตือน</label>
        <select className="glass-input" value={reminder} onChange={e => setReminder(e.target.value)}>
          {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: '0.6rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>สถานที่</label>
        <input className="glass-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="ไม่บังคับ" />
      </div>
      <div style={{ marginBottom: '0.8rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>รายละเอียด</label>
        <textarea className="glass-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="ไม่บังคับ" style={{ resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="glass-btn-outline" onClick={onCancel}>ยกเลิก</button>
        <button className="glass-btn" onClick={save} disabled={saving || !title.trim()}>{saving ? 'กำลังบันทึก...' : isNew ? '➕ เพิ่มนัดหมาย' : '✅ บันทึก'}</button>
      </div>
    </div>
  );
}

function EventCard({ e, onEdit, onCancel, showDate }) {
  return (
    <div className="glass-card" style={{ opacity: e.status === 'pending' ? 0.7 : 1, cursor: 'pointer' }} onClick={() => onEdit(e.id)}>
      <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{e.title}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
        {showDate ? formatDate(e.start_time) : `🕐 ${timeLabel(e.start_time)}`}
      </div>
      {e.location && <div className="muted">📍 {e.location}</div>}
      {e.description && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{e.description}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {e.status === 'pending' && <span className="muted">⏳ รอยืนยัน</span>}
        {reminderLabel(e.reminder_minutes) && <span className="muted">{reminderLabel(e.reminder_minutes)}</span>}
        {e.google_event_id && <span className="muted">🔗 ซิงก์ Google Calendar แล้ว</span>}
        <button className="note-icon-btn" style={{ marginLeft: 'auto' }}
          onClick={(ev) => { ev.stopPropagation(); onCancel(e); }}>🗑️ ยกเลิก</button>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<main className="page"><ListSkeleton /></main>}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('id');
  const wantsNew = searchParams.get('new') === '1';

  const today = new Date();
  const [view, setView] = useState(deepLinkId ? 'list' : 'month'); // 'month' | 'list'
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(ymd(today));
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState(deepLinkId || null);
  const [creating, setCreating] = useState(wantsNew);
  const [showPast, setShowPast] = useState(false);
  const touch = useRef(null);

  // Remember the user's preferred view across visits.
  useEffect(() => {
    if (deepLinkId) return;
    try { const v = localStorage.getItem('jarvis-cal-view'); if (v === 'list' || v === 'month') setView(v); } catch (e) { /* ignore */ }
  }, [deepLinkId]);
  function chooseView(v) { setView(v); setEditingId(null); setCreating(false); try { localStorage.setItem('jarvis-cal-view', v); } catch (e) { /* ignore */ } }

  const load = useCallback(async () => {
    setError(false);
    try {
      let url;
      if (view === 'month') {
        const { start, end } = monthGrid(cursor);
        url = `/api/calendar?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
      } else {
        url = `/api/calendar?past=${showPast}`;
      }
      const data = await apiGet(url);
      setEvents(withoutPending(data.events));
    } catch (e) {
      if (e.message !== 'unauthorized') setError(true);
    }
  }, [view, cursor, showPast]);

  useEffect(() => { setEvents(null); load(); }, [load]);

  async function saveEvent(id, patch) {
    const isNew = !id;
    const res = await fetch(isNew ? '/api/calendar' : `/api/calendar/${id}`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('saveEvent failed:', data);
      toast.show(isNew ? '❌ เพิ่มนัดหมายไม่สำเร็จ' : '❌ บันทึกไม่สำเร็จ', { tone: 'error' });
      return;
    }
    if (data.syncResult?.synced === false || data.syncResult?.ok === false) {
      // Show the ACTUAL reason: "not_configured" = webapp is missing
      // WORKER_URL/INTERNAL_API_SECRET, a number = the Worker rejected
      // the request, anything else is Google's own error.
      toast.show(`⚠️ บันทึกแล้ว แต่ sync ไป Google ไม่สำเร็จ: ${data.syncResult?.error || 'unknown'}`, { tone: 'warn', duration: 6000 });
    } else {
      toast.show(isNew ? '✅ เพิ่มนัดหมายและ sync ไป Google แล้ว' : '✅ บันทึกและ sync ไป Google แล้ว');
    }
    if (isNew && data.event?.start_time) {
      const d = new Date(data.event.start_time);
      setSelected(ymd(d));
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setEditingId(null);
    setCreating(false);
    load();
  }

  function cancelEvent(ev) {
    toast.undoableDelete({
      id: ev.id,
      label: `ยกเลิกนัด “${ev.title}” แล้ว`,
      remove: () => { setEvents(prev => prev?.filter(x => x.id !== ev.id)); setEditingId(null); },
      commit: async () => {
        try {
          const res = await fetch(`/api/calendar/${ev.id}`, { method: 'DELETE', keepalive: true });
          if (!res.ok) throw new Error(String(res.status));
        } catch (e) {
          console.error('cancelEvent failed:', e);
          toast.show('❌ ยกเลิกนัดหมายไม่สำเร็จ', { tone: 'error' });
          load();
        }
      },
      restore: () => setEvents(prev => prev ? [...prev, ev].sort((a, b) => a.start_time.localeCompare(b.start_time)) : prev),
    });
  }

  function shiftMonth(delta) {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
    setEditingId(null); setCreating(false);
  }
  function goToday() {
    const t = new Date();
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelected(ymd(t));
  }

  // ---- month view ----
  const { days } = monthGrid(cursor);
  const byDay = {};
  for (const e of events || []) (byDay[ymd(new Date(e.start_time))] ||= []).push(e);
  const todayKey = ymd(today);
  const dayEvents = byDay[selected] || [];
  const selectedDate = new Date(`${selected}T00:00:00`);
  const monthTitle = cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const selectedTitle = selectedDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  function onTouchStart(e) { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }
  function onTouchEnd(e) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) shiftMonth(dx < 0 ? 1 : -1);
  }

  function startCreate() {
    setEditingId(null);
    const base = view === 'month' ? new Date(`${selected}T09:00:00`) : (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; })();
    setCreating({ start_time: base.toISOString() });
  }
  const createDraft = creating === true ? { start_time: new Date(`${selected}T09:00:00`).toISOString() } : creating;

  return (
    <main className="page">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>📅 นัดหมาย</h1>
        <div className="seg">
          <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => chooseView('month')}>🗓️ เดือน</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => chooseView('list')}>📋 รายการ</button>
        </div>
      </div>

      {error && <ErrorState onRetry={() => { setEvents(null); load(); }} />}

      {!error && view === 'month' && (
        <>
          <div className="cal-head">
            <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
            <div className="cal-title">{monthTitle}</div>
            <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">›</button>
            <button type="button" className="glass-btn-outline cal-today-btn" onClick={goToday}>วันนี้</button>
          </div>
          <div className="glass-card cal-card" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="cal-grid cal-weekdays">{WEEKDAYS.map((w, i) => <div key={w} className={i === 0 ? 'sun' : ''}>{w}</div>)}</div>
            <div className="cal-grid" style={{ opacity: events === null ? 0.5 : 1, transition: 'opacity .15s' }}>
              {days.map(d => {
                const key = ymd(d);
                const list = byDay[key] || [];
                const cls = ['cal-day', d.getMonth() !== cursor.getMonth() && 'other', key === todayKey && 'today', key === selected && 'selected'].filter(Boolean).join(' ');
                return (
                  <button type="button" key={key} className={cls} onClick={() => { setSelected(key); setEditingId(null); setCreating(false); }}
                    aria-label={`${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}${list.length ? ` มี ${list.length} นัด` : ''}`}>
                    <span className="cal-num">{d.getDate()}</span>
                    <span className="cal-dots">{list.slice(0, 3).map(e => <i key={e.id} className={e.status === 'pending' ? 'pending' : ''} />)}</span>
                    {list.slice(0, 2).map(e => <span key={e.id} className="cal-chip">{e.title}</span>)}
                    {list.length > 2 && <span className="cal-more">+{list.length - 2}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="page-head" style={{ marginTop: '1rem' }}>
            <h2 className="cal-day-title">{selectedTitle}{selected === todayKey ? ' · วันนี้' : ''}</h2>
            <button type="button" className="glass-btn" onClick={startCreate}>➕ เพิ่มนัด</button>
          </div>
          {creating && <div style={{ marginBottom: '0.6rem' }}><EventEditor key="new" event={createDraft} onSave={saveEvent} onCancel={() => setCreating(false)} /></div>}
          {events === null && !creating && <ListSkeleton rows={2} height={72} />}
          {events && dayEvents.length === 0 && !creating && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>ไม่มีนัดหมายในวันนี้ครับ</p></div>}
          <div className="list-stack">
            {dayEvents.map(e => editingId === e.id
              ? <EventEditor key={e.id} event={e} onSave={saveEvent} onCancel={() => setEditingId(null)} />
              : <EventCard key={e.id} e={e} onEdit={setEditingId} onCancel={cancelEvent} />)}
          </div>
        </>
      )}

      {!error && view === 'list' && (
        <>
          <div className="page-head">
            <h2 className="cal-day-title">{showPast ? 'ที่ผ่านมาแล้ว' : 'ที่กำลังจะถึง'}</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="glass-btn-outline" onClick={() => { setShowPast(v => !v); setEditingId(null); }}>
                {showPast ? '⬅️ ดูที่จะถึง' : '🕘 ดูที่ผ่านมาแล้ว'}
              </button>
              <button type="button" className="glass-btn" onClick={startCreate}>➕ เพิ่ม</button>
            </div>
          </div>
          {creating && <div style={{ marginBottom: '0.6rem' }}><EventEditor key="new" event={createDraft} onSave={saveEvent} onCancel={() => setCreating(false)} /></div>}
          {events === null && <ListSkeleton />}
          {events?.length === 0 && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>{showPast ? 'ยังไม่มีนัดหมายที่ผ่านมาแล้วครับ' : 'ไม่มีนัดหมายที่กำลังจะถึงครับ'}</p></div>}
          <div className="list-stack">
            {events?.map(e => editingId === e.id
              ? <EventEditor key={e.id} event={e} onSave={saveEvent} onCancel={() => setEditingId(null)} />
              : <EventCard key={e.id} e={e} showDate onEdit={setEditingId} onCancel={cancelEvent} />)}
          </div>
        </>
      )}

      {!creating && !editingId && <Fab onClick={startCreate} label="เพิ่มนัดหมาย" />}
    </main>
  );
}
