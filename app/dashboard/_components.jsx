'use client';
// app/dashboard/_components.jsx

import { useState, useEffect, useRef } from 'react';

// Reads the saved theme (or falls back to system preference) and
// applies it to <html data-theme="...">. Called both from the
// FOUC-prevention inline script in layout.jsx (before hydration, so
// there's never a flash of the wrong theme) and from ThemeToggle below
// when someone taps it.
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('jarvis-theme', theme); } catch (e) { /* ignore — private browsing etc */ }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(null); // null until mounted, to avoid a hydration mismatch

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  if (!theme) return <span className="theme-toggle-btn" style={{ visibility: 'hidden' }} />;
  return (
    <button type="button" className="theme-toggle-btn" onClick={toggle}
      title={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      aria-label="สลับโหมดมืด/สว่าง">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

export function DashNav({ current }) {
  const tabs = [
    { key: 'dashboard', label: '🏠 หน้าแรก', href: '/dashboard' },
    { key: 'notes', label: '📝 โน้ต', href: '/dashboard/notes' },
    { key: 'tasks', label: '✅ งาน', href: '/dashboard/tasks' },
    { key: 'calendar', label: '📅 นัดหมาย', href: '/dashboard/calendar' },
    { key: 'expenses', label: '💰 เงิน', href: '/dashboard/expenses' },
    { key: 'files', label: '📁 ไฟล์', href: '/dashboard/files' },
    { key: 'settings', label: '⚙️ ตั้งค่าเสียง', href: '/dashboard/settings' },
  ];
  return (
    <nav className="dash-nav">
      {tabs.map(t => (
        <a key={t.key} href={t.href} className={`dash-nav-item${current === t.key ? ' active' : ''}`}>
          {t.label}
        </a>
      ))}
      <ThemeToggle />
      <VoiceAssistant />
    </nav>
  );
}

// §Voice assistant — mic button, speech-to-text and text-to-speech both
// done by the BROWSER itself (Web Speech API: SpeechRecognition +
// SpeechSynthesis) — completely free, no audio ever leaves the device
// as audio. Only the transcribed TEXT goes to the server (POST
// /api/assistant), which bridges to the bot Worker's routeVoiceText()
// — the exact same task-execution chain LINE uses (จด/นัด/รายจ่าย/
// ปรึกษาหารือ all work identically to typing them in LINE).
//
// Browser support: SpeechRecognition works well in Chrome/Edge, is NOT
// supported in Firefox, and is inconsistent in Safari — this feature-
// detects at mount and simply doesn't render the button if the
// browser can't do it, rather than showing something broken.
function VoiceAssistant() {
  const [supported, setSupported] = useState(true);
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const turnStartRef = useRef(null); // Date.now() when listening began — used to measure this turn's duration for the time-based quota
  const audioRef = useRef(null); // currently-playing Chirp3 Audio() element, if any — so the "tap to stop speaking" path can stop either playback method
  const voicePrefRef = useRef(null); // { voiceName, voiceLang } loaded once from /api/assistant/preferences — conversation MEMORY itself lives server-side (keyed by userId), so the client doesn't track history at all, just this

  useEffect(() => {
    fetch('/api/assistant/preferences').then(r => r.json()).then(data => {
      voicePrefRef.current = { voiceName: data.voiceName, voiceLang: data.voiceLang };
    }).catch(() => { voicePrefRef.current = { voiceName: null, voiceLang: null }; });
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !window.speechSynthesis) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      sendToAssistant(text);
    };
    recognition.onerror = (event) => {
      finishTurn();
      setState('idle');
      setError(event.error === 'not-allowed' ? 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟนครับ' : 'ฟังไม่ชัดครับ ลองอีกครั้ง');
    };
    recognition.onend = () => {
      setState(prev => (prev === 'listening' ? 'idle' : prev));
    };
    recognitionRef.current = recognition;

    return () => { try { recognition.abort(); } catch (e) { /* already stopped */ } };
  }, []);

  // Reports this turn's elapsed time (from tapping the mic to the
  // reply finishing — listening + thinking + speaking, the whole
  // "using voice" duration) to the time-based daily quota. Called on
  // every path a turn can end: normal completion, recognition error,
  // or a fetch failure — so partial/failed turns still count toward
  // the cap rather than being a free way around it.
  function finishTurn() {
    if (turnStartRef.current === null) return;
    const elapsedSeconds = Math.round((Date.now() - turnStartRef.current) / 1000);
    turnStartRef.current = null;
    if (elapsedSeconds > 0) {
      fetch('/api/assistant/voice-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', seconds: elapsedSeconds }),
      }).catch(() => { /* best-effort — a failed report shouldn't break the UI */ });
    }
  }

  async function sendToAssistant(text) {
    setState('thinking');
    setError(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'assistant_error');
      setReply(data.reply);
      speak(data.reply);
    } catch (e) {
      finishTurn();
      setState('idle');
      setError('ขอโทษครับ ตอนนี้ผู้ช่วยเสียงมีปัญหา ลองอีกครั้งครับ');
    }
  }

  // Tries Chirp 3 HD first (natural/emotional voice, but capped by the
  // monthly $-cost quota — see tts_usage) — falls back to the
  // browser's own free SpeechSynthesis whenever the server says
  // allowed:false (quota used up this month, no API key configured,
  // or synthesis failed for any reason) or the fetch itself fails
  // (offline, etc.). The fallback is silent — no error shown, no
  // difference in the UI flow, just a lower-quality voice.
  async function speak(text) {
    setState('speaking');
    try {
      const res = await fetch('/api/assistant/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.allowed && data.audioContent) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        audioRef.current = audio;
        audio.onended = () => { audioRef.current = null; finishTurn(); setState('idle'); };
        audio.onerror = () => { audioRef.current = null; finishTurn(); speakBrowser(text); }; // audio itself failed to play (e.g. corrupt data) — still fall back rather than going silent
        await audio.play();
        return;
      }
    } catch (e) { /* fetch/network failure — fall through to browser TTS below */ }
    speakBrowser(text);
  }

  function speakBrowser(text) {
    window.speechSynthesis.cancel(); // don't stack multiple replies if tapped again quickly
    const utterance = new SpeechSynthesisUtterance(text);
    // Match the saved voice by exact name first (works when this is
    // the same device/browser it was picked on); if not found (e.g. a
    // different device — see settings page's own note on why this
    // happens), fall back to any voice matching the saved language,
    // then finally the browser's own default for 'th-TH'.
    const pref = voicePrefRef.current;
    const available = window.speechSynthesis.getVoices();
    const matched = pref?.voiceName && available.find(v => v.name === pref.voiceName);
    const langMatch = !matched && pref?.voiceLang && available.find(v => v.lang === pref.voiceLang);
    if (matched) utterance.voice = matched;
    else if (langMatch) utterance.voice = langMatch;
    utterance.lang = 'th-TH';
    utterance.onend = () => { finishTurn(); setState('idle'); };
    utterance.onerror = () => { finishTurn(); setState('idle'); };
    window.speechSynthesis.speak(utterance);
  }

  async function handleReset() {
    setTranscript('');
    setReply('');
    setError(null);
    try {
      await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
    } catch (e) { /* best-effort — the server just keeps whatever history it had if this fails, no local state to roll back */ }
  }

  async function handleTap() {
    if (state === 'listening') {
      recognitionRef.current?.stop();
      return;
    }
    if (state === 'speaking') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      window.speechSynthesis.cancel();
      finishTurn();
      setState('idle');
      return;
    }
    if (state === 'thinking') return; // ignore taps while waiting for a reply

    setTranscript('');
    setReply('');
    setError(null);

    // Time-based daily cap (15 min default) — checked BEFORE starting
    // to listen, not after, so a turn already in progress when the cap
    // is hit is never cut off mid-sentence (see finishTurn/the bot
    // Worker's handleVoiceUsageRequest for the "check before, add
    // after" split).
    try {
      const res = await fetch('/api/assistant/voice-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      });
      const data = await res.json();
      if (data.allowed === false) {
        const usedMin = Math.round((data.usedSeconds || 0) / 60);
        const limitMin = Math.round((data.limitSeconds || 900) / 60);
        setError(`ใช้เสียงครบ ${limitMin} นาทีของวันนี้แล้วครับ (${usedMin} นาที) พรุ่งนี้กลับมาใหม่นะครับ`);
        return;
      }
    } catch (e) { /* quota check failed — fail open, same as the server side */ }

    turnStartRef.current = Date.now();
    setState('listening');
    try { recognitionRef.current?.start(); } catch (e) { turnStartRef.current = null; setState('idle'); } // start() throws if already running — harmless, just ignore
  }

  if (!supported) return null;

  const icon = { idle: '🎤', listening: '🔴', thinking: '⏳', speaking: '🔊' }[state];
  const label = { idle: 'คุยกับ Jarvis', listening: 'กำลังฟัง... แตะเพื่อหยุด', thinking: 'กำลังคิด...', speaking: 'แตะเพื่อหยุดพูด' }[state];

  return (
    <div className="voice-assistant">
      {(transcript || reply || error) && (
        <div className="voice-assistant-transcript">
          {transcript && <p className="voice-assistant-you">🗣️ {transcript}</p>}
          {reply && <p className="voice-assistant-reply">🤖 {reply}</p>}
          {error && <p className="voice-assistant-error">⚠️ {error}</p>}
          <button type="button" className="voice-assistant-reset" onClick={handleReset} title="ล้างความจำบทสนทนา เริ่มคุยใหม่">
            🔄 เริ่มคุยใหม่
          </button>
        </div>
      )}
      <button type="button" className={`voice-assistant-btn voice-assistant-btn--${state}`}
        onClick={handleTap} title={label} aria-label={label}>
        <span className="voice-assistant-icon">{icon}</span>
      </button>
    </div>
  );
}


export function PremiumUpsell() {
  return (
    <div className="glass-panel" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>✨</div>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>หน้านี้เป็นสิทธิ์ Premium ครับ</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        อัปเกรดเป็น Premium เพื่อดูและจัดการข้อมูลนี้ผ่านหน้าเว็บได้เลย เพียงปีละ 199 บาท
      </p>
      <p style={{ fontSize: '0.85rem' }}>สนใจติดต่อผู้พัฒนา LINE ID: <strong>tonteng4455</strong></p>
    </div>
  );
}

export function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return '-'; }
}

// Same fixed vocabulary the bot's own categorization (Gemini schema for
// notes, categoryIcon() for expenses) already uses — keeping the
// dropdown options in sync with what the bot itself assigns, so
// "existing" categories a note/expense might already have always show
// up correctly rather than falling through to the custom-entry path.
export const NOTE_CATEGORIES = [
  { key: 'general', label: '📄 ทั่วไป' },
  { key: 'work', label: '💼 งาน' },
  { key: 'personal', label: '🙋 ส่วนตัว' },
  { key: 'idea', label: '💡 ไอเดีย' },
  { key: 'shopping', label: '🛒 ช้อปปิ้ง' },
];

export const EXPENSE_CATEGORIES = [
  { key: 'food', label: '🍔 อาหาร' },
  { key: 'transport', label: '🚗 เดินทาง' },
  { key: 'shopping', label: '🛍️ ช้อปปิ้ง' },
  { key: 'bills', label: '💡 บิล/ค่าใช้จ่ายประจำ' },
  { key: 'salary', label: '💵 เงินเดือน' },
  { key: 'finance', label: '💰 การเงิน' },
  { key: 'family', label: '👨‍👩‍👧 ครอบครัว' },
  { key: 'personal', label: '👤 ส่วนตัว' },
  { key: 'general', label: '📌 ทั่วไป' },
];

// Dropdown that falls back to a free-text input for a category not
// already in the list — covers "เลือกจากที่มี ถ้าไม่มีให้พิมพ์เพิ่มเอง"
// for both notes and expenses (whichever `options` list is passed in).
export function CategorySelect({ options, value, onChange }) {
  const isCustom = !!value && !options.some(o => o.key === value);
  const [customMode, setCustomMode] = useState(isCustom);

  if (customMode) {
    return (
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input className="glass-input" value={value} onChange={e => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อหมวดหมู่ใหม่" style={{ flex: 1 }} autoFocus />
        <button type="button" className="glass-btn-outline"
          onClick={() => { setCustomMode(false); onChange(options[0]?.key || ''); }}
          style={{ color: 'var(--text-primary)', background: 'var(--surface-muted)', borderColor: 'var(--border-strong)', whiteSpace: 'nowrap' }}>
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <select className="glass-input" value={isCustom ? '__custom__' : value}
      onChange={e => {
        if (e.target.value === '__custom__') { setCustomMode(true); onChange(''); }
        else onChange(e.target.value);
      }}>
      {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      <option value="__custom__">➕ เพิ่มหมวดหมู่ใหม่...</option>
    </select>
  );
}
