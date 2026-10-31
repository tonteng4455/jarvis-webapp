'use client';
// app/dashboard/chat/page.jsx — chat with Jarvis, like in LINE.
// What is typed (or tapped: cards and quick-reply buttons) goes to /api/chat → the bot Worker's own brain, so every command that works
// in LINE works here (notes, appointments incl. repeating ones, expenses, moving an appointment, finding files…). The web app adds no AI.
// Answers come back as LINE messages and are drawn by _flex.jsx. The conversation is kept on this device only.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashNav } from '../_components';
import { useToast } from '../_ui';
import { BotMessage, QuickReplies } from './_flex';

const KEY = 'jarvis-chat-v1';
const MAX_ITEMS = 60, MAX_BYTES = 350000;
const START = [
  { label: '🏠 เมนู', text: 'เมนู' }, { label: '📅 ดูนัดหมาย', text: 'ดูนัดหมาย' }, { label: '☀️ สรุปวันนี้', text: 'สรุปวันนี้' }, { label: '📝 โน้ต', text: 'โน้ต' }, { label: '💰 เงิน', text: 'เงิน' }, { label: '📁 ไฟล์', text: 'ไฟล์' },
];
const EXAMPLES = ['จดโน้ต ซื้อไข่ 2 โหล', 'นัดหมอฟัน พรุ่งนี้ 10 โมง', 'ค่าข้าว 60 บาท', 'ทุกวันจันทร์ 9:00 ประชุมทีม', 'เลื่อนประชุมทีม เป็น 14:00'];

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${++seq}`;

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => x && x.id && (x.role === 'user' || x.role === 'bot')) : []; } catch { return []; }
}
function save(items) {
  try {
    let list = items.slice(-MAX_ITEMS);
    let s = JSON.stringify(list);
    while (s.length > MAX_BYTES && list.length > 2) { list = list.slice(1); s = JSON.stringify(list); }
    localStorage.setItem(KEY, s);
  } catch { /* storage full / blocked: the chat still works, it just is not remembered */ }
}

export default function ChatPage() {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { setItems(load()); setReady(true); }, []);
  useEffect(() => { if (ready) save(items); }, [items, ready]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [items, busy]);

  const send = useCallback(async ({ shown, text: t, postback }) => {
    if (busy) return;
    setBusy(true);
    if (shown) setItems(prev => [...prev, { id: newId(), role: 'user', text: shown }]);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postback ? { postback } : { text: t }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = res.status === 401 ? '🔐 เซสชันหมดอายุ เข้าสู่ระบบใหม่แล้วลองอีกครั้ง' : res.status === 400 ? '🙏 ข้อความว่างหรือยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)' : '⚠️ คุยกับ Jarvis ไม่สำเร็จ ลองอีกครั้งครับ (ตรวจว่าตั้งค่าบอทในเว็บครบ)';
        setItems(prev => [...prev, { id: newId(), role: 'bot', error: true, message: { type: 'text', text: msg } }]);
      } else {
        const msgs = (data.messages || []).map(m => ({ id: newId(), role: 'bot', message: m }));
        setItems(prev => [...prev, ...(msgs.length ? msgs : [{ id: newId(), role: 'bot', message: { type: 'text', text: '👌' } }])]);
      }
    } catch {
      setItems(prev => [...prev, { id: newId(), role: 'bot', error: true, message: { type: 'text', text: '📶 ส่งไม่สำเร็จ (อินเทอร์เน็ตหลุด) ลองอีกครั้งครับ' } }]);
    }
    setBusy(false);
  }, [busy]);

  function submit(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    send({ shown: t, text: t });
    inputRef.current?.focus();
  }

  // what a tap on a card button / quick reply does
  const onAction = useCallback(a => {
    if (a.kind === 'postback') send({ shown: a.silent ? null : a.label, postback: { data: a.data, ...(a.params ? { params: a.params } : {}) } });
    else if (a.kind === 'message') send({ shown: a.text, text: a.text });
    else if (a.kind === 'uri') {
      if (a.path) router.push(a.path);
      else if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer');
    }
  }, [send, router]);

  function clearChat() { setItems([]); try { localStorage.removeItem(KEY); } catch {} toast.show('🧹 ล้างแชทบนเครื่องนี้แล้ว (ข้อมูลของคุณไม่หาย)'); }

  const last = items[items.length - 1];
  const quick = last?.role === 'bot' ? last.message?.quickReply?.items : null;

  return (
    <main className="page chat-page">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>💬 แชทกับ Jarvis</h1>
        {items.length > 0 && <button type="button" className="glass-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} data-act="clear-chat" onClick={clearChat}>🧹 ล้างแชท</button>}
      </div>

      <div className="chat-log" data-testid="chat-log" aria-live="polite">
        {ready && items.length === 0 && (
          <div className="chat-hello glass-card" data-testid="chat-hello">
            <p style={{ margin: '0 0 0.4rem', fontWeight: 700 }}>พิมพ์เหมือนคุยใน LINE ได้เลยครับ</p>
            <p className="muted" style={{ margin: '0 0 0.6rem' }}>คำสั่งทุกอย่างที่ใช้ใน LINE ใช้ที่นี่ได้ — ข้อมูลเป็นชุดเดียวกัน เช่น</p>
            <ul style={{ margin: '0 0 0.7rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
              {EXAMPLES.map(x => <li key={x}><button type="button" className="chat-example" onClick={() => setText(x)}>{x}</button></li>)}
            </ul>
            <div className="chat-quick">{START.map(s => <button key={s.text} type="button" className="chat-chip" disabled={busy} onClick={() => send({ shown: s.text, text: s.text })}>{s.label}</button>)}</div>
          </div>
        )}
        {items.map(it => it.role === 'user'
          ? <div key={it.id} className="chat-row user"><div className="chat-bubble user" data-chat="user">{it.text}</div></div>
          : <div key={it.id} className="chat-row bot"><img className="chat-avatar" src="/logo-head.png" alt="" width="32" height="32" /><div className="chat-bot-col"><BotMessage message={it.message} onAction={onAction} /></div></div>)}
        {busy && <div className="chat-row bot"><img className="chat-avatar" src="/logo-head.png" alt="" width="32" height="32" /><div className="chat-bubble bot chat-typing" data-testid="chat-typing" aria-label="กำลังตอบ"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </div>

      <div className="chat-dock">
        {quick && !busy && <QuickReplies items={quick} onAction={onAction} />}
        <form className="chat-form" onSubmit={submit}>
          <textarea ref={inputRef} className="glass-input chat-input" data-testid="chat-input" rows={1} maxLength={2000} placeholder="พิมพ์ข้อความ เช่น จดโน้ต ซื้อนม" value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e); }} />
          <button type="submit" className="glass-btn chat-send" data-testid="chat-send" disabled={busy || !text.trim()} aria-label="ส่ง">➤</button>
        </form>
      </div>
    </main>
  );
}
