'use client';
// app/dashboard/_sort.jsx — the small ⇅ sort button + menu used by every list in the web app (notes, tasks, appointments,
// expenses, files, memory). One look, one place: the choice is remembered per list in localStorage.
// Default everywhere: the item changed most recently first.

import { useState, useEffect, useLayoutEffect, useRef } from 'react';

export const BY_EDITED = { key: 'updated', icon: '🕘', label: 'แก้ไขล่าสุดก่อน' };
export const BY_OLDEST = { key: 'oldest', icon: '🕰️', label: 'เก่าสุดก่อน' };
export const BY_TITLE = { key: 'title', icon: '🔤', label: 'ชื่อ ก–ฮ' };

// when an item was last changed (falls back to when it was made, for rows from before updated_at.sql)
export const stampOf = r => Date.parse(r?.updated_at || r?.created_at || '') || 0;
export const thCompare = (a, b) => String(a || '').trim().localeCompare(String(b || '').trim(), 'th');

// → [key, setKey]; `options` = [{ key, icon, label }], the first is the default unless `def` says otherwise
export function useSortPref(storageKey, options, def) {
  const first = def || options[0].key;
  const [key, setKey] = useState(first);
  useEffect(() => { try { const v = localStorage.getItem(storageKey); if (options.some(o => o.key === v)) setKey(v); } catch { /* no storage */ } }, [storageKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pick = k => { setKey(k); try { localStorage.setItem(storageKey, k); } catch { /* ok */ } };
  return [key, pick];
}

// inField: the button sits inside a `.note-search-wrap` (the search box) and the menu opens under it; otherwise it is a small stand-alone button.
export function SortMenu({ options, value, onChange, inField = false, label = 'เรียง', glyph = '⇅' }) {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.key === value) || options[0];
  const menuRef = useRef(null);
  // opens towards the left of its button; when that would run off the screen (the button is near the left edge) open to the right instead
  useLayoutEffect(() => {
    const el = menuRef.current; if (!open || !el) return;
    el.classList.remove('left');
    if (el.getBoundingClientRect().left < 8) el.classList.add('left');
  }, [open]);
  return (
    <>
      <button type="button" className={`note-sort-btn${inField ? '' : ' solo'}`} data-act="sort-btn" aria-haspopup="menu" aria-expanded={open}
        title={`${label}: ${cur.label}`} aria-label={`${label}: เลือกรูปแบบ (ตอนนี้: ${cur.label})`} onClick={() => setOpen(v => !v)}>{glyph}</button>
      {open && (
        <>
          <div className="note-sort-scrim" onClick={() => setOpen(false)} />
          <div className="note-sort-menu" role="menu" data-act="sort-menu" ref={menuRef}>
            {options.map(o => (
              <button key={o.key} type="button" role="menuitemradio" aria-checked={value === o.key} data-sort={o.key}
                className={value === o.key ? 'on' : ''} onClick={() => { onChange(o.key); setOpen(false); }}>
                <span>{o.icon}</span><span>{o.label}</span><span className="tick">{value === o.key ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// a wrapper that makes the menu open under its own button (for the stand-alone variant)
export function SortSolo(props) { return <span className="sort-solo-wrap"><SortMenu {...props} /></span>; }
