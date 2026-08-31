'use client';
// app/dashboard/_components.jsx

import { useState, useEffect } from 'react';

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
  ];
  return (
    <nav className="dash-nav">
      {tabs.map(t => (
        <a key={t.key} href={t.href} className={`dash-nav-item${current === t.key ? ' active' : ''}`}>
          {t.label}
        </a>
      ))}
      <ThemeToggle />
    </nav>
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
