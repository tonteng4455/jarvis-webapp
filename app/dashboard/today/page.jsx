'use client';
// app/dashboard/today/page.jsx — the landing page: what matters today
// (next appointments, open tasks, today's spending, recent notes) plus
// quick-add buttons and one search box across everything.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashNav } from '../_components';
import { apiGet, ErrorState, ListSkeleton, useToast } from '../_ui';

const LINE_OA_URL = process.env.NEXT_PUBLIC_LINE_OA_URL || '';
const money = n => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'ดึกแล้วนะครับ' : h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ';
}

function whenLabel(iso) {
  const d = new Date(iso), t = new Date(), tm = new Date(t); tm.setDate(t.getDate() + 1);
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, t)) return `วันนี้ ${time}`;
  if (sameDay(d, tm)) return `พรุ่งนี้ ${time}`;
  return `${d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

function Card({ title, href, hrefLabel = 'ดูทั้งหมด', children }) {
  return (
    <section className="glass-card today-card">
      <div className="today-card-head">
        <h2>{title}</h2>
        {href && <Link href={href} className="today-link">{hrefLabel} ›</Link>}
      </div>
      {children}
    </section>
  );
}

export default function TodayPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(false);
    try {
      const [notes, tasks, cal, exp, files, meRes] = await Promise.all([
        apiGet('/api/notes?archived=false'), apiGet('/api/tasks?archived=false'), apiGet('/api/calendar?past=false'),
        apiGet('/api/expenses'), apiGet('/api/files'), apiGet('/api/me').catch(() => null),
      ]);
      setMe(meRes);
      setData({ notes: notes.notes, tasks: tasks.tasks, events: cal.events, expenses: exp.expenses, files: files.files });
    } catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleTask(t) {
    setData(d => ({ ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, is_done: !x.is_done } : x) }));
    const res = await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_done: !t.is_done }) });
    if (!res.ok) { toast.show('❌ บันทึกไม่สำเร็จ', { tone: 'error' }); load(); }
  }

  const name = me?.displayName ? `, ${me.displayName}` : '';
  const query = q.trim().toLowerCase();

  // ---- search across everything ----
  let results = null;
  if (data && query) {
    const has = (...f) => f.some(x => String(x || '').toLowerCase().includes(query));
    results = {
      notes: data.notes.filter(n => has(n.title, n.content)).slice(0, 6),
      tasks: data.tasks.filter(t => has(t.task_name)).slice(0, 6),
      events: data.events.filter(e => has(e.title, e.location, e.description)).slice(0, 6),
      expenses: data.expenses.filter(e => has(e.memo, e.category)).slice(0, 6),
      files: data.files.filter(f => has(f.file_name)).slice(0, 6),
    };
  }
  const resultCount = results ? Object.values(results).reduce((n, a) => n + a.length, 0) : 0;

  const now = new Date();
  const todaySpend = data ? data.expenses.filter(e => sameDay(new Date(e.created_at), now)) : [];
  const spent = todaySpend.filter(e => e.type !== 'income').reduce((s, e) => s + parseFloat(e.amount), 0);
  const earned = todaySpend.filter(e => e.type === 'income').reduce((s, e) => s + parseFloat(e.amount), 0);
  const openTasks = data ? data.tasks.filter(t => !t.is_done) : [];
  const recentNotes = data ? [...data.notes].sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 3) : [];

  return (
    <main className="page">
      <DashNav />
      <h1 className="page-title" style={{ marginBottom: '0.2rem' }}>{greeting()}{name} 👋</h1>
      <p className="muted" style={{ marginBottom: '0.9rem' }}>
        {now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <input className="glass-input" type="search" placeholder="🔍 ค้นหาทุกอย่าง — โน้ต งาน นัดหมาย เงิน ไฟล์" value={q}
        onChange={e => setQ(e.target.value)} style={{ marginBottom: '0.8rem' }} />

      {!query && (
        <div className="quick-row">
          <Link href="/dashboard?new=1" className="quick-btn"><span>📝</span>จดโน้ต</Link>
          <Link href="/dashboard/tasks?new=1" className="quick-btn"><span>✅</span>เพิ่มงาน</Link>
          <Link href="/dashboard/calendar?new=1" className="quick-btn"><span>📅</span>เพิ่มนัด</Link>
          <Link href="/dashboard/expenses?new=1" className="quick-btn"><span>💰</span>บันทึกเงิน</Link>
        </div>
      )}

      {error && <ErrorState onRetry={() => { setData(null); load(); }} />}
      {!error && !data && <ListSkeleton rows={4} height={110} />}

      {results && (
        resultCount === 0
          ? <div className="glass-card"><p className="muted" style={{ margin: 0 }}>ไม่พบ “{q.trim()}” ครับ</p></div>
          : (
            <div className="list-stack">
              {results.notes.length > 0 && <Card title="📝 โน้ต">{results.notes.map(n => <Link key={n.id} href={`/dashboard?id=${n.id}`} className="result-row"><b>{n.title || '(ไม่มีหัวข้อ)'}</b><span className="muted">{(n.content || '').slice(0, 60)}</span></Link>)}</Card>}
              {results.tasks.length > 0 && <Card title="✅ งาน">{results.tasks.map(t => <Link key={t.id} href={`/dashboard/tasks?id=${t.id}`} className="result-row"><b>{t.task_name}</b></Link>)}</Card>}
              {results.events.length > 0 && <Card title="📅 นัดหมาย">{results.events.map(e => <Link key={e.id} href={`/dashboard/calendar?id=${e.id}`} className="result-row"><b>{e.title}</b><span className="muted">{whenLabel(e.start_time)}</span></Link>)}</Card>}
              {results.expenses.length > 0 && <Card title="💰 รายรับ-รายจ่าย">{results.expenses.map(e => <Link key={e.id} href={`/dashboard/expenses?id=${e.id}`} className="result-row"><b>{e.memo || e.category}</b><span className="muted">{e.type === 'income' ? '+' : '-'}{money(e.amount)} บาท</span></Link>)}</Card>}
              {results.files.length > 0 && <Card title="📁 ไฟล์">{results.files.map(f => <Link key={f.id} href="/dashboard/files" className="result-row"><b>{f.file_name}</b></Link>)}</Card>}
            </div>
          )
      )}

      {data && !query && (
        <div className="list-stack">
          <Card title="📅 นัดหมายถัดไป" href="/dashboard/calendar">
            {data.events.length === 0 && <p className="muted" style={{ margin: 0 }}>ไม่มีนัดหมายที่กำลังจะถึง</p>}
            {data.events.slice(0, 3).map(e => (
              <Link key={e.id} href={`/dashboard/calendar?id=${e.id}`} className="result-row">
                <b>{e.title}</b><span className="muted">{whenLabel(e.start_time)}{e.location ? ` · 📍 ${e.location}` : ''}</span>
              </Link>
            ))}
          </Card>

          <Card title={`✅ งานที่ค้าง${openTasks.length ? ` (${openTasks.length})` : ''}`} href="/dashboard/tasks">
            {openTasks.length === 0 && <p className="muted" style={{ margin: 0 }}>ไม่มีงานค้าง 🎉</p>}
            {openTasks.slice(0, 5).map(t => (
              <label key={t.id} className="task-line">
                <input type="checkbox" className="big-check" checked={!!t.is_done} onChange={() => toggleTask(t)} />
                <span>{t.task_name}</span>
              </label>
            ))}
          </Card>

          <Card title="💰 วันนี้" href="/dashboard/expenses">
            <div className="summary-split" style={{ marginTop: 0 }}>
              <div><span className="muted">จ่าย</span><b style={{ color: 'var(--danger)' }}>-{money(spent)}</b></div>
              <div><span className="muted">รับ</span><b style={{ color: 'var(--success)' }}>+{money(earned)}</b></div>
            </div>
            {todaySpend.length === 0 && <p className="muted" style={{ margin: '0.5rem 0 0' }}>วันนี้ยังไม่มีรายการ</p>}
          </Card>

          <Card title="📝 โน้ตล่าสุด" href="/dashboard">
            {recentNotes.length === 0 && <p className="muted" style={{ margin: 0 }}>ยังไม่มีโน้ต</p>}
            {recentNotes.map(n => (
              <Link key={n.id} href={`/dashboard?id=${n.id}`} className="result-row">
                <b>{n.pinned ? '📌 ' : ''}{n.title || '(ไม่มีหัวข้อ)'}</b>
                <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(n.content || '').replace(/\s+/g, ' ').slice(0, 70)}</span>
              </Link>
            ))}
          </Card>

          {LINE_OA_URL && <a href={LINE_OA_URL} className="glass-btn" style={{ textAlign: 'center', textDecoration: 'none', padding: '0.8rem' }}>💬 เปิดแชท Jarvis ใน LINE</a>}
        </div>
      )}
    </main>
  );
}
