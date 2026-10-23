'use client';
// app/dashboard/share/page.jsx — what to do with text shared in from another app (e.g. a LINE message):
// save it as a note right away, or turn it into a task / appointment (the usual sheets, with the text pre-filled).
// No AI here: you choose. Nothing is saved until you press a button.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashNav } from '../_components';
import { apiGet, useToast } from '../_ui';
import { ConvertToTaskSheet, ConvertToEventSheet } from '../_taskEditor';
import { readShare, clearShare, shareToText } from '../../../lib/sharePending';

const firstLineOf = t => (String(t || '').split('\n').map(l => l.trim()).find(Boolean) || '');

async function post(url, body) {
  let res; try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { return { ok: false }; }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function SharePage() {
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(null);        // null | 'task' | 'event'
  const [done, setDone] = useState(null);          // { href, label } once saved
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { await apiGet('/api/me'); } catch { return; }     // not logged in → /login (the text stays parked on this device)
      const s = readShare();
      if (s) setText(shareToText(s));
      setReady(true);
    })();
  }, []);

  const body = text.trim();
  const first = firstLineOf(body);
  // the first line is the name; the rest (and the full text for a note) stays in the details
  const detailsAfterFirst = body.slice(body.indexOf(first) + first.length).replace(/^\s+/, '');

  async function saveNote() {
    if (!body || busy) return;
    setBusy(true);
    const r = await post('/api/notes', { title: first.slice(0, 80), content: body, category: 'general' });
    setBusy(false);
    if (!r.ok) { toast.show(r.data?.error === 'quota_reached' ? '❌ โน้ตครบจำนวนที่สร้างได้แล้ว' : '❌ บันทึกโน้ตไม่สำเร็จ', { tone: 'error' }); return; }
    clearShare(); setDone({ href: '/dashboard', label: '📝 บันทึกเป็นโน้ตแล้ว' });
  }
  async function saveTask(payload) {
    const r = await post('/api/tasks', payload);
    if (!r.ok || r.data?.dropped?.length) { toast.show(r.ok ? '⚠️ บันทึกงานแล้ว แต่ยังเก็บกำหนดส่ง/รายละเอียดไม่ได้ (ต้องรัน tasks_due.sql และ tasks_details.sql)' : '❌ เพิ่มงานไม่สำเร็จ', { tone: r.ok ? 'warn' : 'error' }); return r.ok; }
    clearShare(); setSheet(null); setDone({ href: '/dashboard/tasks', label: '✅ เพิ่มเป็นงานแล้ว' }); return true;
  }
  async function saveEvent(payload) {
    const r = await post('/api/calendar', payload);
    if (!r.ok) { toast.show('❌ สร้างนัดหมายไม่สำเร็จ', { tone: 'error' }); return false; }
    if (r.data?.syncResult?.synced === false) toast.show('⚠️ สร้างนัดแล้ว แต่ซิงก์ไป Google Calendar ไม่สำเร็จ', { tone: 'warn', duration: 7000 });
    clearShare(); setSheet(null); setDone({ href: '/dashboard/calendar', label: '📅 สร้างเป็นนัดหมายแล้ว' }); return true;
  }

  return (
    <main className="page">
      <DashNav />
      <h1 className="page-title">📥 ข้อความที่แชร์เข้ามา</h1>

      {!ready && <p className="muted">กำลังโหลด…</p>}

      {ready && done && (
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.8rem' }}>{done.label}</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={done.href} className="glass-btn" style={{ textDecoration: 'none' }}>เปิดดู</Link>
            <Link href="/dashboard/today" className="glass-btn-outline" style={{ textDecoration: 'none' }}>กลับหน้าวันนี้</Link>
          </div>
        </div>
      )}

      {ready && !done && !body && (
        <div className="glass-card">
          <p style={{ margin: '0 0 0.4rem' }}>ยังไม่มีข้อความที่แชร์เข้ามา</p>
          <p className="muted" style={{ margin: 0 }}>ใน LINE กดค้างที่ข้อความ → แชร์ → “แชร์ไปยังแอปอื่น” → เลือก Jarvis (ต้องเพิ่มเว็บนี้ไปที่หน้าจอหลักเป็นแอปก่อน — ดูวิธีในคู่มือ)</p>
        </div>
      )}

      {ready && !done && body && (
        <>
          <label className="muted" style={{ display: 'block', marginBottom: '0.3rem' }}>ข้อความ (แก้ไขได้ก่อนบันทึก)</label>
          <textarea className="glass-input" rows={8} value={text} onChange={e => setText(e.target.value)} style={{ resize: 'vertical', marginBottom: '0.8rem' }} />
          <p className="muted" style={{ margin: '0 0 0.5rem' }}>จะเก็บเป็นอะไร?</p>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <button type="button" className="convert-choice" onClick={saveNote} disabled={busy}><b>📝 โน้ต</b><span className="muted">บันทึกทั้งข้อความเลย — แตะครั้งเดียวจบ</span></button>
            <button type="button" className="convert-choice" onClick={() => setSheet('task')}><b>✅ งาน</b><span className="muted">บรรทัดแรกเป็นชื่องาน ที่เหลือเป็นรายละเอียด แล้วเลือกวันที่ต้องเสร็จ</span></button>
            <button type="button" className="convert-choice" onClick={() => setSheet('event')}><b>📅 นัดหมาย</b><span className="muted">เลือกวัน-เวลานัด แล้วส่งเข้า Google Calendar</span></button>
          </div>
          <button type="button" className="glass-btn-outline" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => { clearShare(); setText(''); }}>🗑️ ทิ้งข้อความนี้</button>
        </>
      )}

      {sheet === 'task' && (
        <ConvertToTaskSheet source={{ name: first.slice(0, 200), details: detailsAfterFirst }} heading="✅ เพิ่มเป็นงาน" detailsLabel="รายละเอียด" footnote="ข้อความที่แชร์จะถูกเก็บเป็นงานนี้"
          onCancel={() => setSheet(null)} onConfirm={saveTask} />
      )}
      {sheet === 'event' && (
        <ConvertToEventSheet source={{ title: first.slice(0, 200), details: detailsAfterFirst, due: { date: '', time: '' } }} heading="📅 สร้างเป็นนัดหมาย" detailsLabel="รายละเอียด" footnote="ข้อความที่แชร์จะถูกเก็บเป็นนัดนี้ และนัดจะถูกส่งไป Google Calendar"
          onCancel={() => setSheet(null)} onConfirm={saveEvent} />
      )}
    </main>
  );
}
