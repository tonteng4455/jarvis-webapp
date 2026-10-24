'use client';
// app/dashboard/memory/page.jsx — "สิ่งที่ Jarvis จำได้": everything you've taught the
// bot (in LINE with "จำไว้ว่า …" or here) plus what it learned from your corrections.
// Rules are used BEFORE the AI, so they apply instantly and cost nothing. No AI on this page.

import { useState, useEffect, useCallback } from 'react';
import { DashNav, NOTE_CATEGORIES, EXPENSE_CATEGORIES } from '../_components';
import { apiGet, ErrorState, ListSkeleton, useRefreshOnReturn, useToast } from '../_ui';

const KINDS = [
  { key: 'expense', label: '💸 หมวดรายจ่าย', kind: 'category', scope: 'expense', hint: 'ข้อความรายจ่ายที่มีคำนี้ จะลงหมวดที่เลือก', ph: 'เช่น ทางด่วน' },
  { key: 'note', label: '📝 หมวดโน้ต', kind: 'category', scope: 'note', hint: 'โน้ตที่มีคำนี้ จะลงหมวดที่เลือก', ph: 'เช่น ลูกค้า' },
  { key: 'reminder', label: '⏰ เตือนล่วงหน้า', kind: 'reminder', scope: 'event', hint: 'นัดหมายที่มีคำนี้ จะตั้งเตือนล่วงหน้าตามที่เลือก (ถ้าไม่ได้ระบุเอง)', ph: 'เช่น ประชุมใหญ่' },
  { key: 'create', label: '🔀 งาน / นัดหมาย', kind: 'create', scope: '', hint: 'ข้อความที่มีคำนี้ (แม้มีวัน-เวลา) จะสร้างเป็นงานหรือนัดหมายตามที่เลือก — ถ้าไม่ได้พิมพ์นำหน้าว่า “เพิ่มงาน” หรือ “นัด”', ph: 'เช่น ส่งรายงาน' },
  { key: 'location', label: '📍 สถานที่', kind: 'location', scope: 'event', hint: 'นัดหมายที่มีคำนี้ จะใส่สถานที่นี้ให้ (ถ้าไม่ได้ระบุเอง)', ph: 'เช่น ประชุมใหญ่' },
];
const REMINDERS = [[10, '10 นาที'], [30, '30 นาที'], [60, '1 ชั่วโมง'], [180, '3 ชั่วโมง'], [1440, '1 วัน'], [2880, '2 วัน'], [10080, '1 สัปดาห์']];
const catLabel = (scope, v) => { const list = scope === 'note' ? NOTE_CATEGORIES : EXPENSE_CATEGORIES; return list.find(c => c.key === v)?.label || `🏷️ ${v}`; };
const minutesLabel = n => REMINDERS.find(r => r[0] === +n)?.[1] || (+n % 1440 === 0 ? `${+n / 1440} วัน` : +n % 60 === 0 ? `${+n / 60} ชม.` : `${n} นาที`);

function describe(e) {
  if (e.kind === 'category') return <>หมวด {catLabel(e.scope, e.value)} <span className="muted">· {e.scope === 'note' ? 'โน้ต' : 'รายจ่าย'}</span></>;
  if (e.kind === 'reminder') return <>เตือนก่อน {minutesLabel(e.value)} <span className="muted">· นัดหมาย</span></>;
  if (e.kind === 'create') return <>สร้างเป็น{e.value === 'task' ? 'งาน' : 'นัดหมาย'}</>;
  return <>สถานที่ {e.value} <span className="muted">· นัดหมาย</span></>;
}

export default function MemoryPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [setup, setSetup] = useState(false);
  const [error, setError] = useState(false);
  const [kindKey, setKindKey] = useState('expense');
  const [trigger, setTrigger] = useState('');
  const [value, setValue] = useState('food');
  const [saving, setSaving] = useState(false);
  const def = KINDS.find(k => k.key === kindKey);

  const load = useCallback(async () => {
    setError(false);
    try { const d = await apiGet('/api/lexicon'); setItems(d.items); setSetup(!!d.setup_needed); }
    catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnReturn(load);

  function pickKind(k) {
    setKindKey(k);
    setValue(k === 'expense' ? 'food' : k === 'note' ? 'work' : k === 'reminder' ? '60' : k === 'create' ? 'task' : '');
  }

  async function add(ev) {
    ev.preventDefault();
    if (!trigger.trim() || !String(value).trim()) return;
    setSaving(true);
    const res = await fetch('/api/lexicon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: def.kind, scope: def.scope, trigger, value }) });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.show(data.error === 'full' ? `ความจำเต็มแล้ว (${data.max} รายการ) ลบบางอย่างก่อนครับ` : data.error === 'setup_needed' ? 'ยังไม่ได้สร้างตารางความจำใน Supabase (ดูคำแนะนำด้านบน)' : 'จำไม่ได้ — ตรวจคำและค่าที่เลือกอีกครั้ง', { tone: 'error' });
      return;
    }
    toast.show('🧠 จำแล้วครับ'); setTrigger(''); load();
  }

  function forget(item) {
    toast.undoableDelete({
      id: item.id, label: `ลืม “${item.trigger}” แล้ว`,
      remove: () => setItems(prev => prev?.filter(x => x.id !== item.id)),
      commit: async () => {
        try { const r = await fetch(`/api/lexicon/${item.id}`, { method: 'DELETE', keepalive: true }); if (!r.ok) throw new Error(); }
        catch { toast.show('❌ ลบไม่สำเร็จ', { tone: 'error' }); load(); }
      },
      restore: () => setItems(prev => prev ? [item, ...prev] : prev),
    });
  }

  return (
    <main className="page">
      <DashNav />
      <h1 className="page-title">🧠 สิ่งที่ Jarvis จำได้</h1>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        สอนได้ในแชท LINE ด้วย <b>จำไว้ว่า ทางด่วน = เดินทาง</b> หรือเพิ่มที่นี่ — Jarvis ใช้สิ่งเหล่านี้ก่อนถาม AI ทุกครั้ง
        และจะจำเองเมื่อคุณแก้หมวดหมู่ (ป้าย “เรียนรู้เอง”) ข้อมูลเป็นของคุณคนเดียว ลบได้ทุกเมื่อ
      </p>

      {setup && (
        <div className="glass-card" style={{ marginBottom: '1rem' }}>
          <b>ยังไม่ได้สร้างตารางความจำ</b>
          <p className="muted" style={{ margin: '0.3rem 0 0' }}>รันไฟล์ <code>user_lexicon.sql</code> ใน Supabase (SQL editor) หนึ่งครั้ง แล้วรีเฟรชหน้านี้</p>
        </div>
      )}

      <form className="glass-panel" onSubmit={add} style={{ marginBottom: '1rem' }}>
        <div className="chip-row" style={{ marginBottom: '0.6rem' }}>
          {KINDS.map(k => <button key={k.key} type="button" className={`chip${kindKey === k.key ? ' active' : ''}`} onClick={() => pickKind(k.key)}>{k.label}</button>)}
        </div>
        <p className="muted" style={{ margin: '0 0 0.6rem' }}>{def.hint}</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <input className="glass-input" style={{ flex: '1 1 160px' }} value={trigger} onChange={e => setTrigger(e.target.value)} placeholder={def.ph} maxLength={40} />
          {def.kind === 'category' && (
            <select className="glass-input" style={{ flex: '1 1 160px' }} value={value} onChange={e => setValue(e.target.value)}>
              {(def.scope === 'note' ? NOTE_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          )}
          {def.kind === 'reminder' && (
            <select className="glass-input" style={{ flex: '1 1 160px' }} value={value} onChange={e => setValue(e.target.value)}>
              {REMINDERS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            </select>
          )}
          {def.kind === 'create' && (
            <select className="glass-input" style={{ flex: '1 1 160px' }} value={value} onChange={e => setValue(e.target.value)}>
              <option value="task">✅ สร้างเป็นงาน</option><option value="event">📅 สร้างเป็นนัดหมาย</option>
            </select>
          )}
          {def.kind === 'location' && <input className="glass-input" style={{ flex: '1 1 160px' }} value={value} onChange={e => setValue(e.target.value)} placeholder="เช่น ห้องประชุม 5" maxLength={80} />}
        </div>
        <button type="submit" className="glass-btn" disabled={saving || !trigger.trim() || !String(value).trim()}>{saving ? 'กำลังจำ...' : '🧠 ให้ Jarvis จำ'}</button>
      </form>

      {error && <ErrorState onRetry={() => { setItems(null); load(); }} />}
      {!error && items === null && <ListSkeleton rows={3} height={56} />}
      {items?.length === 0 && !setup && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>ยังไม่มีอะไรที่จำไว้ครับ ลองสอนสักข้อด้านบนได้เลย</p></div>}
      <div className="list-stack">
        {items?.map(e => (
          <div key={e.id} className="glass-card exp-row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="exp-memo">“{e.trigger}”</div>
              <div style={{ fontSize: '0.85rem' }}>→ {describe(e)}</div>
            </div>
            {e.source === 'learned' && <span className="chip" style={{ cursor: 'default', minHeight: 28, padding: '0.1rem 0.6rem', fontSize: '0.7rem' }}>เรียนรู้เอง</span>}
            <button type="button" className="note-icon-btn" onClick={() => forget(e)} title="ให้ลืมข้อนี้">🗑️</button>
          </div>
        ))}
      </div>
    </main>
  );
}
