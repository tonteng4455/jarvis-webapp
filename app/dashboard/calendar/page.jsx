'use client';
// app/dashboard/calendar/page.jsx — Calendar editor (Premium only).
// Deliberately a plain form (title/date/time/reminder/location/
// description), not a Keep-style masonry grid like Notes — most edits
// here are just "fix the wrong time" or "add a location", so a
// straightforward form is the better fit than a card-heavy layout.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, formatDate } from '../_components';

const REMINDER_OPTIONS = [
  { value: '', label: '⚙️ ค่าเริ่มต้นของปฏิทิน' },
  { value: '-1', label: '🔕 ไม่เตือน' },
  { value: '10', label: '⏰ 10 นาทีก่อน' },
  { value: '30', label: '⏰ 30 นาทีก่อน' },
  { value: '60', label: '⏰ 1 ชม.ก่อน' },
  { value: '1440', label: '⏰ 1 วันก่อน' },
];

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
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
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

  async function save() {
    setSaving(true);
    const start_time = date && time ? new Date(`${date}T${time}:00`).toISOString() : event.start_time;
    await onSave(event.id, {
      title, start_time, location: location || null, description: description || null,
      reminder_minutes: reminder === '' ? null : parseInt(reminder, 10),
    });
    setSaving(false);
  }

  return (
    <div className="glass-panel">
      <div style={{ marginBottom: '0.6rem' }}>
        <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>หัวเรื่อง</label>
        <input className="glass-input" value={title} onChange={e => setTitle(e.target.value)} />
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
        <button className="glass-btn-outline" onClick={onCancel} style={{ color: 'var(--text-primary)', background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}>ยกเลิก</button>
        <button className="glass-btn" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : '✅ บันทึก'}</button>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const [events, setEvents] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState(null);
  const searchParams = useSearchParams();

  // Coming from a LIFF link (bot card's "✏️ แก้ไข" button) with
  // ?id=... — jump straight into that event's editor instead of
  // showing the list first.
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setEditingId(id);
  }, [searchParams]);

  async function load() {
    const res = await fetch('/api/calendar');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    setEvents(data.events);
  }

  useEffect(() => { load(); }, []);

  async function saveEvent(id, patch) {
    const res = await fetch(`/api/calendar/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) { setStatus('❌ บันทึกไม่สำเร็จ'); return; }
    if (data.syncResult?.synced === false) {
      // Show the ACTUAL reason instead of a generic message — same
      // diagnostic approach that found the SUPABASE_URL/CHANNEL_ID
      // issues earlier: "not_configured" means WORKER_URL/
      // INTERNAL_API_SECRET are missing on the webapp side, an HTTP
      // status number means the Worker rejected the request (secret
      // mismatch → 401), anything else is Google's own error message.
      setStatus(`⚠️ บันทึกแล้ว แต่ sync ไป Google ไม่สำเร็จ: ${data.syncResult?.error || 'unknown'}`);
    } else {
      setStatus('✅ บันทึกและ sync ไป Google แล้ว');
    }
    setEditingId(null);
    load();
  }

  async function cancelEvent(id) {
    if (!confirm('ยกเลิกนัดหมายนี้ใช่ไหม?')) return;
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Was silently doing nothing on failure before — no status
      // message, no console log — so a failed delete just looked like
      // "the button doesn't work" with zero clue why.
      console.error('cancelEvent failed:', data);
      setStatus(`❌ ยกเลิกไม่สำเร็จ: ${data.error || res.status}`);
      return;
    }
    setStatus('✅ ยกเลิกนัดหมายแล้วครับ');
    load();
  }

  return (
    <main className="page">
      <DashNav current="calendar" />
      <h1 className="page-title">📅 นัดหมายของฉัน</h1>
      {events === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {events?.length === 0 && <div className="glass-card"><p className="muted">ไม่มีนัดหมายครับ</p></div>}
      {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}
      {events?.length > 0 && (
        <div className="list-stack">
          {events.map(e => editingId === e.id ? (
            <EventEditor key={e.id} event={e} onSave={saveEvent} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={e.id} className="glass-card" style={{ opacity: e.status === 'pending' ? 0.7 : 1, cursor: 'pointer' }}
              onClick={() => setEditingId(e.id)}>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{e.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>{formatDate(e.start_time)}</div>
              {e.location && <div className="muted">📍 {e.location}</div>}
              {e.description && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{e.description}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {e.status === 'pending' && <span className="muted">⏳ รอยืนยัน</span>}
                {reminderLabel(e.reminder_minutes) && <span className="muted">{reminderLabel(e.reminder_minutes)}</span>}
                {e.google_event_id && <span className="muted">🔗 ซิงก์ Google Calendar แล้ว</span>}
                <button className="note-icon-btn" style={{ marginLeft: 'auto' }}
                  onClick={(ev) => { ev.stopPropagation(); cancelEvent(e.id); }}>🗑️ ยกเลิก</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
