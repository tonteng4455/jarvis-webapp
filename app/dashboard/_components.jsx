'use client';
// app/dashboard/_components.jsx

import { useState, useEffect, useRef } from 'react';
import { useVoiceEngine } from './_voiceEngine';
import { useVoiceMode } from './_voiceModeContext';

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
  const { isMobile, switchToVoice } = useVoiceMode();
  const tabs = [
    { key: 'dashboard', label: '🏠 หน้าแรก', href: '/dashboard' },
    { key: 'notes', label: '📝 โน้ต', href: '/dashboard/notes' },
    { key: 'calendar', label: '📅 นัดหมาย', href: '/dashboard/calendar' },
    { key: 'expenses', label: '💰 เงิน', href: '/dashboard/expenses' },
    { key: 'files', label: '📁 ไฟล์', href: '/dashboard/files' },
    { key: 'settings', label: '⚙️ ตั้งค่าเสียง', href: '/dashboard/settings' },
  ];
  return (
    <>
      <nav className="dash-nav">
        {tabs.map(t => (
          <a key={t.key} href={t.href} className={`dash-nav-item${current === t.key ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
        {/* Only meaningful on mobile — layout.jsx never shows the Live
            screen on desktop in the first place, so this stays hidden
            there rather than offering a switch to something that isn't
            part of the desktop experience. */}
        {isMobile && (
          <button type="button" className="dash-nav-item dash-nav-live-btn" onClick={switchToVoice}
            title="กลับไปหน้าคุยด้วยเสียงแบบ Live" aria-label="กลับไปหน้าคุยด้วยเสียงแบบ Live">
            🎙️ Live
          </button>
        )}
        <ThemeToggle />
      </nav>
      {/* Deliberately a SIBLING of <nav>, not a child of it — .dash-nav
          has backdrop-filter + overflow-x:auto, and backdrop-filter
          (like transform/filter) on an ancestor creates a new
          containing block for position:fixed descendants. Nested
          inside, the button was fixed to the NAV BAR's own box
          instead of the viewport, and clipped by its overflow —
          exactly the "trapped inside the menu bar, disappears once
          dragged past its edge" bug. Rendering it here instead keeps
          the "one <DashNav/> per page already includes it" convenience
          without that containment problem. */}
      <VoiceAssistant />
    </>
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
  const { supported, state, transcript, reply, error, handleTap, handleReset } = useVoiceEngine();

  // §Draggable, edge-snapping FAB (like iOS AssistiveTouch). dragPos
  // is null until the button is dragged for the first time — before
  // that, plain CSS handles the default bottom-right position (see
  // .voice-assistant in globals.css). Once dragged, position switches
  // to explicit left/top pixels and snaps to whichever screen edge is
  // nearer on release, persisted in localStorage so it stays put
  // across reloads (this is purely a placement preference, not
  // account data, so localStorage — not the Supabase-backed
  // preferences — is the right place for it).
  const [dragPos, setDragPos] = useState(null); // { x, y } in px
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false });
  const BTN_SIZE = 58, EDGE_MARGIN = 10;
  // The sticky top nav (.dash-nav) is roughly this tall including its
  // own margin — the button must never be draggable into this band,
  // or it ends up sitting right behind/under the nav bar (visually
  // "disappears" even though z-index is fine — this was a POSITION
  // bug, not a stacking one). Clamped both live while dragging AND
  // retroactively when loading an old saved position below.
  const TOP_SAFE_ZONE = 84;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('jarvis-voice-btn-pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Retroactively fix anything saved before TOP_SAFE_ZONE existed
        // (e.g. from testing the drag feature itself) — without this,
        // someone who dragged the button up once before this fix would
        // have it reload hidden behind the nav bar forever, since the
        // bad position just gets read back out of localStorage as-is.
        const clampedY = Math.max(TOP_SAFE_ZONE, Math.min(window.innerHeight - BTN_SIZE - EDGE_MARGIN, parsed.y));
        setDragPos({ ...parsed, y: clampedY });
      }
    } catch (e) { /* corrupt/missing — just use the default position */ }
  }, []);

  function handlePointerDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId); // keeps move/up events firing on this element even once the pointer leaves it — standard drag pattern, no window-level listeners needed
  }

  function handlePointerMove(e) {
    if (e.buttons === 0) return; // pointer capture can occasionally deliver a stray move with no button held
    const { startX, startY, offsetX, offsetY } = dragStateRef.current;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragStateRef.current.moved && Math.hypot(dx, dy) < 6) return; // small threshold — anything under this is a tap, not a drag
    dragStateRef.current.moved = true;
    setIsDragging(true);
    const x = Math.max(EDGE_MARGIN, Math.min(window.innerWidth - BTN_SIZE - EDGE_MARGIN, e.clientX - offsetX));
    const y = Math.max(TOP_SAFE_ZONE, Math.min(window.innerHeight - BTN_SIZE - EDGE_MARGIN, e.clientY - offsetY));
    setDragPos({ x, y });
  }

  function handlePointerUp() {
    if (!dragStateRef.current.moved) {
      // Never actually dragged — this was a plain tap.
      handleTap();
      return;
    }
    setIsDragging(false);
    setDragPos(prev => {
      if (!prev) return prev;
      // Snap to whichever edge (left/right) the button's CENTER is
      // closer to — the AssistiveTouch-style "flies to the edge" feel.
      const snappedX = (prev.x + BTN_SIZE / 2) < window.innerWidth / 2 ? EDGE_MARGIN : window.innerWidth - BTN_SIZE - EDGE_MARGIN;
      const next = { x: snappedX, y: prev.y };
      try { localStorage.setItem('jarvis-voice-btn-pos', JSON.stringify(next)); } catch (e) { /* storage full/disabled — position just won't persist, not fatal */ }
      return next;
    });
  }

  if (!supported) return null;

  const icon = { idle: '🎤', listening: '🔴', thinking: '⏳', speaking: '🔊' }[state];
  const label = { idle: 'คุยกับ Jarvis', listening: 'กำลังฟัง... แตะเพื่อหยุด', thinking: 'กำลังคิด...', speaking: 'แตะเพื่อหยุดพูด' }[state];

  return (
    <div className="voice-assistant"
      style={dragPos ? { left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto', transition: isDragging ? 'none' : 'left 0.3s ease, top 0.3s ease' } : undefined}>
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
      {/* Drag-to-move, tap-to-talk — handlePointerUp calls handleTap
          itself when no drag was detected, so there's no onClick here
          (would double-fire alongside the pointer handlers). */}
      <button type="button" className={`voice-assistant-btn voice-assistant-btn--${state}`}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
        title={label} aria-label={label} style={{ touchAction: 'none' }}>
        <span className="voice-assistant-icon">{icon}</span>
      </button>
    </div>
  );
}


// §Full-screen "Live" voice UI — the Gemini-Live-style default screen
// on mobile (see app/dashboard/layout.jsx for the mode switch that
// decides when this shows instead of the normal dashboard pages).
// Shares 100% of its behavior with the floating FAB via useVoiceEngine
// — this component is purely presentational, a different shape around
// the exact same tap-to-talk/auto-greet/quota logic.
export function VoiceLiveScreen({ onSwitchToApp }) {
  const { supported, state, transcript, reply, error, handleTap, handleReset } = useVoiceEngine();

  if (!supported) {
    // No SpeechRecognition/SpeechSynthesis in this browser — a screen
    // built entirely around talking can't work here. layout.jsx should
    // already route straight to app mode in this case, but this stays
    // as a harmless fallback rather than an unreachable dead end.
    return (
      <div className="voice-live-screen">
        <p className="voice-live-unsupported">เบราว์เซอร์นี้ไม่รองรับผู้ช่วยเสียงครับ ใช้งานผ่านเว็บแอปปกติแทนได้เลย</p>
        <button type="button" className="glass-btn" onClick={onSwitchToApp}>🖥️ ใช้งานแบบเว็บแอป</button>
      </div>
    );
  }

  const icon = { idle: '🎤', listening: '🔴', thinking: '⏳', speaking: '🔊' }[state];
  const label = { idle: 'แตะเพื่อคุยกับ Jarvis', listening: 'กำลังฟัง... แตะเพื่อหยุด', thinking: 'กำลังคิด...', speaking: 'กำลังพูด... แตะเพื่อหยุด' }[state];

  return (
    <div className="voice-live-screen">
      <button type="button" className="voice-live-switch" onClick={onSwitchToApp}
        title="ใช้งานแบบเว็บแอปปกติ" aria-label="สลับไปหน้าเว็บแอปปกติ">
        🖥️ เว็บแอป
      </button>

      <div className="voice-live-center">
        <button type="button" className={`voice-live-orb voice-live-orb--${state}`}
          onClick={handleTap} title={label} aria-label={label}>
          <span className="voice-live-orb-icon">{icon}</span>
        </button>
        <p className="voice-live-label">{label}</p>
      </div>

      {(transcript || reply || error) && (
        <div className="voice-live-transcript">
          {transcript && <p className="voice-assistant-you">🗣️ {transcript}</p>}
          {reply && <p className="voice-assistant-reply">🤖 {reply}</p>}
          {error && <p className="voice-assistant-error">⚠️ {error}</p>}
        </div>
      )}

      {(transcript || reply) && (
        <button type="button" className="voice-live-reset" onClick={handleReset}>🔄 เริ่มคุยใหม่</button>
      )}
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
