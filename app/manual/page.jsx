// app/manual/page.jsx — the user manual as a printable page, one "part" at a time (public, no sign-in).
//   /manual            → index of the parts (each opens /manual?part=N)
//   /manual?part=2     → part 2 only (notes) — print or "save as PDF" from the browser
//   /manual?part=all   → the whole manual
// The text is the same data the in-app guide shows (app/dashboard/guide/content.js).
import './manual.css';
import { GUIDE } from '../dashboard/guide/content';
import PrintBar from './PrintBar';

export const metadata = {
  title: 'คู่มือการใช้งาน Jarvis (พิมพ์ / PDF)',
  description: 'คู่มือการใช้งาน Jarvis แยกเป็นส่วนๆ พิมพ์หรือบันทึกเป็น PDF ได้',
};

// the guide marks the first section of each part with `part: 'ส่วนที่ N · …'`; every following section belongs to it
function groupParts() {
  const parts = [];
  for (const s of GUIDE) {
    if (s.part || !parts.length) parts.push({ label: s.part || 'คู่มือ', sections: [] });
    parts[parts.length - 1].sections.push(s);
  }
  return parts.map((p, i) => ({ ...p, n: i + 1, name: p.label.replace(/^ส่วนที่ \d+ · /, '') }));
}

function Item({ it }) {
  return (
    <div className="m-item">
      {it.h && <h4>{it.h}</h4>}
      {it.p && <p>{it.p}</p>}
      {it.steps && <ol>{it.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>}
      {it.say && <div className="m-say">{it.say.map(t => <span key={t}>{t}</span>)}</div>}
      {it.tip && <p className="m-tip">💡 {it.tip}</p>}
    </div>
  );
}

export default async function ManualPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const parts = groupParts();
  const want = String(sp.part || '');
  const shown = want === 'all' ? parts : parts.filter(p => String(p.n) === want);

  if (!shown.length) {
    return (
      <main className="m-page">
        <PrintBar />
        <header className="m-cover">
          <img src="/icon-192.png" alt="" width="64" height="64" />
          <h1>คู่มือการใช้งาน Jarvis</h1>
          <p>เลือกส่วนที่ต้องการ แล้วกด “พิมพ์ / บันทึกเป็น PDF”</p>
        </header>
        <ol className="m-index">
          {parts.map(p => (
            <li key={p.n}><a href={`/manual?part=${p.n}`}><b>{p.label}</b><span>{p.sections.map(s => `${s.icon} ${s.title}`).join(' · ')}</span></a></li>
          ))}
          <li><a href="/manual?part=all"><b>ทั้งเล่ม</b><span>ทุกส่วนต่อกัน</span></a></li>
        </ol>
      </main>
    );
  }

  const single = shown.length === 1;
  return (
    <main className="m-page">
      <PrintBar />
      <header className="m-cover">
        <img src="/icon-192.png" alt="" width="64" height="64" />
        <h1>คู่มือการใช้งาน Jarvis</h1>
        <p className="m-part">{single ? shown[0].label : 'ทั้งเล่ม'}</p>
        <ul className="m-toc">
          {shown.flatMap(p => p.sections).map(s => <li key={s.id}><a href={`#m-${s.id}`}>{s.icon} {s.title}</a></li>)}
        </ul>
      </header>

      {shown.map(p => (
        <div key={p.n} className="m-partblock">
          {!single && <h2 className="m-parthead">{p.label}</h2>}
          {p.sections.map(s => (
            <section key={s.id} id={`m-${s.id}`} className="m-sec">
              <h3><span aria-hidden="true">{s.icon}</span> {s.title}</h3>
              {s.intro && <p className="m-intro">{s.intro}</p>}
              {s.items.map((it, i) => <Item key={i} it={it} />)}
            </section>
          ))}
        </div>
      ))}

      <footer className="m-foot">
        {single ? `${shown[0].label} · ` : ''}คู่มือฉบับเต็มอยู่ในเว็บแอป เมนู “📖 คู่มือ” · ลืมคำสั่ง? พิมพ์ “เมนู” หรือ “คู่มือ” ในแชท Jarvis
      </footer>
    </main>
  );
}
