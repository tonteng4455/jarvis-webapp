'use client';
// app/dashboard/_setup.jsx — "ตั้งค่าให้ครบ" card on the Today page: the three optional first-time steps
// (Google Calendar, phone notifications, card colour), each with a one-tap action and — for notifications —
// the exact thing this device needs (iPhone → add to Home Screen first; inside LINE → open in the browser).
// Disappears by itself once Google + notifications are sorted, or when dismissed. No AI.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { pushSupport, currentSubscription } from '../../lib/pushClient';

const HIDE_KEY = 'jarvis-setup-hidden';

function Step({ done, title, hint, action }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.5rem 0', borderTop: '1px solid var(--border)' }}>
      <span aria-hidden style={{ fontSize: '1.15rem', lineHeight: '1.4rem' }}>{done ? '✅' : '⬜'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{title}</div>
        {!done && hint && <div className="muted" style={{ margin: '0.1rem 0 0.35rem' }}>{hint}</div>}
        {!done && action}
      </div>
    </div>
  );
}

const btn = { display: 'inline-block', textDecoration: 'none', padding: '0.4rem 0.9rem', fontSize: '0.82rem', cursor: 'pointer' };

export default function SetupChecklist() {
  const [hidden, setHidden] = useState(true);   // start hidden → no flash before we know
  const [server, setServer] = useState(undefined); // undefined = loading
  const [push, setPush] = useState(undefined);  // undefined = checking | { state, on }

  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { setHidden(false); }
    fetch('/api/setup-status').then(r => (r.ok ? r.json() : null)).then(setServer).catch(() => setServer(null));
    (async () => {
      const sup = pushSupport();
      let on = false;
      if (sup.state === 'ok' && typeof Notification !== 'undefined' && Notification.permission === 'granted') on = !!(await currentSubscription().catch(() => null));
      setPush({ state: sup.state, on });
    })();
  }, []);

  if (hidden || server === undefined || push === undefined) return null;

  const google = server?.google;                       // null → unknown, leave the step out
  const pushStep = push.state !== 'unsupported';
  const pending = (google && !google.connected ? 1 : 0) + (pushStep && !push.on ? 1 : 0);
  if (pending === 0) return null;                      // the card colour alone never keeps this card around
  const themeDone = !!server?.cardTheme;

  const pushHint = push.state === 'in_line' ? 'ตอนนี้เปิดอยู่ในแอป LINE ซึ่งส่งแจ้งเตือนไม่ได้ — แตะ ⋯ (มุมขวาบน) แล้วเลือก “เปิดในเบราว์เซอร์” ก่อน'
    : push.state === 'ios_install' ? 'iPhone ต้องเพิ่มเว็บไปที่หน้าจอโฮมก่อน: เปิดใน Safari → แตะปุ่มแชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนนั้น'
    : 'เตือนงานที่ใกล้ถึงกำหนดและสรุปตอนเช้า แม้ปิดเว็บอยู่';

  return (
    <section className="glass-card today-card" style={{ marginBottom: '0.8rem' }} aria-label="ตั้งค่าให้ครบ">
      <div className="today-card-head">
        <h2>🚀 ตั้งค่าให้ครบ (ไม่บังคับ)</h2>
        <button type="button" className="today-link" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
          onClick={() => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } setHidden(true); }}>ซ่อน</button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.2rem' }}>ใช้งานได้เลยโดยไม่ต้องตั้งอะไร — แต่ถ้าตั้งตามนี้ จะสะดวกขึ้นมาก (เหลืออีก {pending} อย่าง)</p>

      {google && (
        <Step done={google.connected} title="เชื่อม Google Calendar"
          hint="นัดที่จดไว้จะไปอยู่ในปฏิทิน Google ของคุณ และเตือนบนมือถือ (ทำครั้งเดียว ไม่ถึงนาที)"
          action={google.connectUrl && <a href={google.connectUrl} className="glass-btn" style={btn}>🔗 เชื่อมต่อ</a>} />
      )}
      {pushStep && (
        <Step done={push.on} title="เปิดแจ้งเตือนบนมือถือเครื่องนี้" hint={pushHint}
          action={<Link href="/dashboard/notifications" className="glass-btn" style={btn}>{push.state === 'ok' ? '🔔 เปิดเลย' : '📖 ดูวิธี'}</Link>} />
      )}
      <Step done={themeDone} title="เลือกสีการ์ดที่ Jarvis ตอบใน LINE (ไม่บังคับ)" hint="เปลี่ยนสีหัวการ์ดให้ถูกใจ"
        action={<button type="button" className="glass-btn-outline" style={btn} onClick={() => window.dispatchEvent(new Event('jarvis:open-account'))}>🎨 เลือกสี</button>} />
    </section>
  );
}
