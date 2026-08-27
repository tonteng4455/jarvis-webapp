'use client';
// app/dashboard/calendar/page.jsx — read-only Calendar view (Premium only).

import { useState, useEffect } from 'react';
import { DashNav, PremiumUpsell, formatDate } from '../_components';

function reminderLabel(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === -1) return '🔕 ไม่เตือน';
  if (minutes >= 1440 && minutes % 1440 === 0) return `⏰ เตือน ${minutes / 1440} วันก่อน`;
  if (minutes >= 60 && minutes % 60 === 0) return `⏰ เตือน ${minutes / 60} ชม.ก่อน`;
  return `⏰ เตือน ${minutes} นาทีก่อน`;
}

export default function CalendarPage() {
  const [events, setEvents] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch('/api/calendar').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setLocked(true); return; }
      const data = await res.json();
      setEvents(data.events);
    });
  }, []);

  return (
    <main className="page">
      <DashNav current="calendar" />
      <h1 className="page-title">📅 นัดหมายของฉัน</h1>
      {locked && <PremiumUpsell />}
      {!locked && events === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {!locked && events?.length === 0 && <div className="glass-card"><p className="muted">ไม่มีนัดหมายครับ</p></div>}
      {!locked && events?.length > 0 && (
        <div className="list-stack">
          {events.map(e => (
            <div key={e.id} className="glass-card" style={{ opacity: e.status === 'pending' ? 0.7 : 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{e.title}</div>
              <div style={{ fontSize: '0.8rem', color: '#3a3d4d', marginTop: '0.2rem' }}>{formatDate(e.start_time)}</div>
              {e.location && <div className="muted">📍 {e.location}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                {e.status === 'pending' && <span className="muted">⏳ รอยืนยัน</span>}
                {reminderLabel(e.reminder_minutes) && <span className="muted">{reminderLabel(e.reminder_minutes)}</span>}
                {e.google_event_id && <span className="muted">🔗 ซิงก์ Google Calendar แล้ว</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
