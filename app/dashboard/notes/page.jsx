'use client';
// app/dashboard/notes/page.jsx — read-only Notes view (Premium only).

import { useState, useEffect } from 'react';
import { DashNav, PremiumUpsell, formatDate } from '../_components';

export default function NotesPage() {
  const [notes, setNotes] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch('/api/notes').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (res.status === 403) { setLocked(true); return; }
      const data = await res.json();
      setNotes(data.notes);
    });
  }, []);

  return (
    <main className="page page-wide">
      <DashNav current="notes" />
      <h1 className="page-title">📝 โน้ตของฉัน</h1>
      {locked && <PremiumUpsell />}
      {!locked && notes === null && <p className="text-white-muted">กำลังโหลด...</p>}
      {!locked && notes?.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีโน้ตครับ</p></div>}
      {!locked && notes?.length > 0 && (
        <div className="grid-cards">
          {notes.map(n => (
            <div key={n.id} className="glass-card">
              <div className="muted" style={{ marginBottom: '0.3rem' }}>{n.category || 'general'}</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.4rem' }}>{n.title || 'ไม่มีหัวข้อ'}</div>
              <div style={{ fontSize: '0.8rem', color: '#3a3d4d', whiteSpace: 'pre-wrap' }}>{n.content}</div>
              <div className="muted" style={{ marginTop: '0.5rem' }}>แก้ไขล่าสุด {formatDate(n.updated_at || n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
