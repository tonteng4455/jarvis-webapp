'use client';
// app/dashboard/guide/page.jsx — คู่มือการใช้งาน (user manual). Content lives in content.js.
// Searchable, collapsible sections; every example is a chip you can tap to copy and paste into LINE.

import { useState, useMemo } from 'react';
import { DashNav } from '../_components';
import { useToast } from '../_ui';
import { GUIDE } from './content';

function Say({ text }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast.show('คัดลอกแล้ว — วางในแชท LINE ได้เลย'); }
    catch { toast.show('คัดลอกไม่ได้ ลองกดค้างที่ข้อความ', { tone: 'warn' }); }
  }
  return (
    <button type="button" className="say-chip" onClick={copy} title="แตะเพื่อคัดลอก">
      <span>{text}</span><span className="say-copy" aria-hidden>⧉</span>
    </button>
  );
}

export default function GuidePage() {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const sections = useMemo(() => GUIDE.map(sec => {
    if (!query) return sec;
    const hit = s => s.toLowerCase().includes(query);
    const secHit = hit(sec.title) || hit(sec.intro || '');
    const items = sec.items.filter(it => secHit || hit(it.h || '') || hit(it.p || '') || (it.say || []).some(hit));
    return items.length ? { ...sec, items } : null;
  }).filter(Boolean), [query]);

  return (
    <main className="page">
      <DashNav />
      <h1 className="page-title">📖 คู่มือการใช้งาน</h1>
      <input className="glass-input" type="search" placeholder="🔍 ค้นหาในคู่มือ เช่น นัด, เตือน, รูป, Google" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: '0.8rem' }} />

      {!query && (
        <div className="chip-row" aria-label="ไปยังหัวข้อ">
          {GUIDE.map(s => <a key={s.id} href={`#${s.id}`} className="chip" style={{ textDecoration: 'none' }} onClick={() => { const el = document.getElementById(s.id); if (el) el.open = true; }}>{s.icon} {s.title}</a>)}
        </div>
      )}

      {sections.length === 0 && <div className="glass-card"><p className="muted" style={{ margin: 0 }}>ไม่พบ “{q.trim()}” ในคู่มือ ลองคำอื่น หรือพิมพ์ “เมนู” ในแชท Jarvis</p></div>}

      <div className="list-stack">
        {sections.map((sec, i) => (
          <details key={sec.id} id={sec.id} className="glass-card guide-sec" open={!!query || i === 0}>
            <summary><span className="guide-ico">{sec.icon}</span>{sec.title}</summary>
            {sec.intro && <p className="guide-intro">{sec.intro}</p>}
            {sec.items.map((it, j) => (
              <div key={j} className="guide-item">
                {it.h && <h3>{it.h}</h3>}
                {it.say && <div className="say-row">{it.say.map(t => <Say key={t} text={t} />)}</div>}
                {it.p && <p>{it.p}</p>}
              </div>
            ))}
          </details>
        ))}
      </div>
      <p className="muted" style={{ textAlign: 'center', margin: '1.2rem 0' }}>แตะข้อความตัวอย่างเพื่อคัดลอก แล้ววางในแชท Jarvis ได้เลย</p>
    </main>
  );
}
