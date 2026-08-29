'use client';
// app/edit/page.jsx
//
// The scoped single-item editor Free users land on via a "🌐 แก้ไข
// ในเว็บ" button — deliberately NO DashNav, no menu, no way to browse
// anywhere else in the webapp. Reads a token (see lib/scopedToken.js),
// fetches exactly the one note/event it's scoped to, shows a plain
// edit form, saves back through /api/scoped-edit. Session/Premium
// checks don't apply here at all — the token itself IS the access
// grant, and it expires in 15 minutes.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

export default function EditPage() {
  return (
    <Suspense fallback={<main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <EditPageInner />
    </Suspense>
  );
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

function EditPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState({ loading: true, error: null, itemType: null, item: null });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form fields — populated once the item loads
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!token) { setState({ loading: false, error: 'ไม่พบลิงก์ที่ถูกต้องครับ', itemType: null, item: null }); return; }
    fetch(`/api/scoped-edit?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error === 'invalid_or_expired_token'
            ? 'ลิงก์นี้หมดอายุแล้วครับ (ใช้ได้ 15 นาที) กลับไปกดปุ่ม "แก้ไขในเว็บ" ใหม่จากแชทได้เลยครับ'
            : 'ไม่พบรายการนี้ครับ';
          setState({ loading: false, error: msg, itemType: null, item: null });
          return;
        }
        setState({ loading: false, error: null, itemType: data.itemType, item: data.item });
        if (data.itemType === 'note') {
          setTitle(data.item.title || '');
          setContent(data.item.content || '');
        } else {
          setTitle(data.item.title || '');
          const dt = splitDateTime(data.item.start_time);
          setDate(dt.date); setTime(dt.time);
          setLocation(data.item.location || '');
          setDescription(data.item.description || '');
        }
      })
      .catch(() => setState({ loading: false, error: 'เชื่อมต่อไม่สำเร็จครับ', itemType: null, item: null }));
  }, [token]);

  async function save() {
    setSaving(true);
    const payload = state.itemType === 'note'
      ? { title, content }
      : {
          title,
          start_time: date && time ? new Date(`${date}T${time}:00`).toISOString() : state.item.start_time,
          location: location || null,
          description: description || null,
        };
    const res = await fetch(`/api/scoped-edit?token=${encodeURIComponent(token)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setStatus('❌ บันทึกไม่สำเร็จ ลองใหม่อีกครั้งได้ไหมครับ'); return; }
    if (state.itemType === 'calendar' && data.syncResult?.synced === false) {
      setStatus('⚠️ บันทึกแล้ว แต่ sync ไป Google ไม่สำเร็จ');
    } else {
      setStatus('✅ บันทึกเรียบร้อยแล้วครับ ปิดหน้านี้ได้เลย');
    }
  }

  if (state.loading) {
    return <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <p className="text-white-muted">กำลังโหลด...</p>
    </main>;
  }

  if (state.error) {
    return <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '0 1.5rem' }}>
      <p className="text-white-muted">❌ {state.error}</p>
    </main>;
  }

  return (
    <main className="page" style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1 className="page-title" style={{ fontSize: '1.1rem' }}>
        {state.itemType === 'note' ? '📝 แก้ไขโน้ต' : '📅 แก้ไขนัดหมาย'}
      </h1>
      <div className="glass-panel">
        <div style={{ marginBottom: '0.6rem' }}>
          <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>
            {state.itemType === 'note' ? 'หัวข้อ' : 'หัวเรื่อง'}
          </label>
          <input className="glass-input" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {state.itemType === 'note' ? (
          <div style={{ marginBottom: '0.6rem' }}>
            <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>เนื้อหา</label>
            <textarea className="glass-input" rows={8} value={content} onChange={e => setContent(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        ) : (
          <>
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
              <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>สถานที่</label>
              <input className="glass-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="ไม่บังคับ" />
            </div>
            <div style={{ marginBottom: '0.6rem' }}>
              <label className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>รายละเอียด</label>
              <textarea className="glass-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="ไม่บังคับ" style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        <div style={{ textAlign: 'right' }}>
          <button className="glass-btn" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : '✅ บันทึก'}</button>
        </div>
        {status && <p className="text-white-muted" style={{ marginTop: '0.8rem', textAlign: 'center' }}>{status}</p>}
      </div>
      <p className="muted" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem' }}>
        ลิงก์นี้ใช้ได้ 15 นาที และแก้ไขได้แค่รายการนี้รายการเดียวครับ<br />
        อยากจัดการโน้ต/นัดหมายได้แบบเต็มรูปแบบทุกรายการ? ✨ อัปเกรด Premium
      </p>
    </main>
  );
}
