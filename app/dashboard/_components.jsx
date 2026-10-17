'use client';
// app/dashboard/_components.jsx

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CARD_THEMES, normalizeCardTheme, themeColors } from '../../lib/cardThemes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Theme: 'auto' removes [data-theme] so the CSS prefers-color-scheme
// rules apply and the app follows the phone's own light/dark schedule
// live; 'light'/'dark' pin it. Also called from the FOUC-prevention
// inline script in layout.jsx before hydration.
export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('jarvis-theme', theme); } catch (e) { /* ignore — private browsing etc */ }
}

export function applyFontSize(size) {
  document.documentElement.setAttribute('data-fs', size);
  try { localStorage.setItem('jarvis-fs', size); } catch (e) { /* ignore */ }
}

// Pages (top-level tabs). The same list drives the desktop top bar and
// the mobile bottom bar (see BottomNav in _shell.jsx).
export const NAV_TABS = [
  { key: 'today', icon: '🏠', label: 'วันนี้', href: '/dashboard/today' },
  { key: 'notes', icon: '📝', label: 'โน้ต', href: '/dashboard' },
  { key: 'tasks', icon: '✅', label: 'งาน', href: '/dashboard/tasks' },
  { key: 'calendar', icon: '📅', label: 'นัดหมาย', href: '/dashboard/calendar' },
  { key: 'expenses', icon: '💰', label: 'เงิน', href: '/dashboard/expenses' },
  { key: 'files', icon: '📁', label: 'ไฟล์', href: '/dashboard/files' },
];

export function tabKeyForPath(pathname) {
  if (pathname === '/dashboard') return 'notes';
  const hit = NAV_TABS.find(t => t.key !== 'notes' && pathname.startsWith(t.href));
  return hit ? hit.key : null;
}

// `current` is kept for the old call sites; the active tab now comes
// from the URL so it can never disagree with the page. Navigation uses
// next/link (client-side) — the old plain <a> reloaded the whole page
// on every tab switch.
export function DashNav() {
  const pathname = usePathname();
  const current = tabKeyForPath(pathname);
  return (
    <nav className="dash-nav">
      <span className="dash-brand"><img src="/logo-head.png" alt="" width="24" height="24" className="dash-logo" /> Jarvis</span>
      <div className="dash-tabs">
        {NAV_TABS.map(t => (
          <Link key={t.key} href={t.href} className={`dash-nav-item${current === t.key ? ' active' : ''}`}>
            {t.icon} {t.label}
          </Link>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
        <AccountMenu />
      </div>
    </nav>
  );
}

const FONT_SIZES = [['sm', 'เล็ก'], ['md', 'ปกติ'], ['lg', 'ใหญ่']];
const THEMES = [['auto', '🌓 ตามระบบ'], ['light', '☀️ สว่าง'], ['dark', '🌙 มืด']];

// Avatar + name; opens a small settings sheet: theme (auto follows the
// phone's own light/dark schedule), text size, logout.
function AccountMenu() {
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState('auto');
  const [fs, setFsState] = useState('md');
  const [cardTheme, setCardTheme] = useState(null);
  const [themeNote, setThemeNote] = useState('');
  const boxRef = useRef(null);
  const sheetRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, right: 8 });

  // The sheet is drawn in <body> (position: fixed). Inside the nav it was clipped, because the nav
  // scrolls sideways (overflow-x) and that also clips anything hanging below it; and the due-tasks
  // banner (sticky, above the nav) would cover it.
  function toggle() {
    if (!open && boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    }
    setOpen(o => !o);
  }

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => { setMe(d); if (d) setCardTheme(d.cardTheme ?? null); }).catch(() => {});
    try {
      setThemeState(localStorage.getItem('jarvis-theme') || 'auto');
      setFsState(localStorage.getItem('jarvis-fs') || 'md');
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (boxRef.current?.contains(e.target) || sheetRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('touchstart', onClickOutside);
      window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  async function pickCard(value) {
    const next = normalizeCardTheme(value);
    if (next === undefined) { setThemeNote('สีนี้อ่อนเกินไป ตัวหนังสือสีขาวบนการ์ดจะอ่านยาก ลองสีที่เข้มกว่านี้'); return; }
    const before = cardTheme;
    setCardTheme(next); setThemeNote('');
    try {
      const res = await fetch('/api/card-theme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }) });
      if (!res.ok) throw new Error('save');
      setThemeNote('บันทึกแล้ว — การ์ดที่ Jarvis ตอบต่อจากนี้จะใช้สีนี้');
    } catch { setCardTheme(before); setThemeNote('บันทึกไม่สำเร็จ (ผู้ดูแลระบบต้องรัน card_theme.sql ก่อน)'); }
  }
  function pickTheme(t) { applyTheme(t); setThemeState(t); }
  function pickFs(f) { applyFontSize(f); setFsState(f); }

  const chip = (active) => ({
    flex: 1, padding: '0.45rem 0.3rem', minHeight: 40, borderRadius: 10, cursor: 'pointer', font: 'inherit', fontSize: '0.78rem',
    border: active ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
    background: active ? 'var(--accent-soft)' : 'var(--surface-muted)', color: 'var(--text-primary)', fontWeight: active ? 700 : 500,
  });

  return (
    <div ref={boxRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={toggle} className="account-btn" aria-label="บัญชีและการตั้งค่า">
        {me?.pictureUrl
          ? <img src={me.pictureUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
          : <span className="avatar-fallback">{Array.from(me?.displayName || '👤')[0]}</span>}
        <span className="account-name">{me?.displayName || ''}</span>
      </button>
      {open && createPortal(
        <div className="account-sheet" ref={sheetRef} style={{ top: pos.top, right: pos.right }}>
          <div className="account-sheet-label">ธีม</div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {THEMES.map(([k, l]) => <button key={k} type="button" style={chip(theme === k)} onClick={() => pickTheme(k)}>{l}</button>)}
          </div>
          <div className="account-sheet-label">ขนาดตัวอักษร</div>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {FONT_SIZES.map(([k, l]) => <button key={k} type="button" style={chip(fs === k)} onClick={() => pickFs(k)}>{l}</button>)}
          </div>
          <div className="account-sheet-label">สีการ์ดที่ Jarvis ตอบใน LINE</div>
          <div className="card-swatches">
            {CARD_THEMES.map(t => (
              <button key={t.key} type="button" title={t.label} aria-label={t.label} aria-pressed={(cardTheme || 'teal') === t.key}
                className={`card-swatch${(cardTheme || 'teal') === t.key ? ' on' : ''}`} style={{ background: t.primary }} onClick={() => pickCard(t.key)}>
                {(cardTheme || 'teal') === t.key ? '✓' : ''}
              </button>
            ))}
            <label className={`card-swatch custom${cardTheme && cardTheme.startsWith('#') ? ' on' : ''}`} title="เลือกสีเอง"
              style={cardTheme && cardTheme.startsWith('#') ? { background: cardTheme } : undefined}>
              {cardTheme && cardTheme.startsWith('#') ? '✓' : '🎨'}
              <input type="color" value={cardTheme && cardTheme.startsWith('#') ? cardTheme : '#2563EB'} onChange={e => pickCard(e.target.value)} aria-label="เลือกสีเอง" />
            </label>
          </div>
          <div className="card-preview" style={{ '--c1': themeColors(cardTheme).primary, '--c2': themeColors(cardTheme).secondary }}>
            <div className="card-preview-head">🏠 ตัวอย่างการ์ด</div>
            <div className="card-preview-body"><span className="card-preview-btn">เสร็จแล้ว</span><span className="card-preview-btn alt">แก้ไข</span></div>
          </div>
          {themeNote && <div className="account-sheet-label" style={{ marginTop: '0.4rem', textTransform: 'none' }}>{themeNote}</div>}
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="glass-btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: '0.8rem', textDecoration: 'none' }}>🔔 การแจ้งเตือน</Link>
          <Link href="/dashboard/guide" onClick={() => setOpen(false)} className="glass-btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: '0.8rem', textDecoration: 'none' }}>📖 คู่มือการใช้งาน</Link>
          <Link href="/dashboard/memory" onClick={() => setOpen(false)} className="glass-btn-outline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: '0.5rem', textDecoration: 'none' }}>🧠 สิ่งที่ Jarvis จำได้</Link>
          <form action="/api/auth/logout" method="POST" style={{ marginTop: '0.5rem' }}>
            <button type="submit" className="glass-btn-danger" style={{ width: '100%', minHeight: 44 }}>ออกจากระบบ</button>
          </form>
        </div>,
        document.body
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
