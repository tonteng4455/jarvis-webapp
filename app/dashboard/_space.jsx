'use client';
// app/dashboard/_space.jsx — the "space" the dashboard is showing: the person's own data, or one LINE group's.
//   useSpace()   → { loaded, space: 'personal'|'group', group, groups, canUseGroups }
//   <SpaceChip/> → the button in the top bar (opens the switcher sheet)   <SpaceBanner/> → the strip that says whose data this is
//   <AddedBy item/> → "เพิ่มโดย …" under a row (group space only)
// The server decides everything (membership is checked with LINE on every API call); this file only shows it and changes the cookie.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { setDraftSpace } from '../../lib/draft';

let cache = null, inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach(f => f(cache));

export function loadSpace(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/space').then(r => r.ok ? r.json() : null).catch(() => null).then(d => { inflight = null; cache = d || cache || { space: 'personal', groups: [], canUseGroups: false }; setDraftSpace(cache.space === 'group' ? cache.group?.id : null); emit(); return cache; });
  return inflight;
}
export function useSpace() {
  const [st, setSt] = useState(cache);
  useEffect(() => { const f = v => setSt(v); listeners.add(f); loadSpace(); return () => listeners.delete(f); }, []);
  return { loaded: !!st, space: st?.space || 'personal', group: st?.group || null, groups: st?.groups || [], canUseGroups: !!st?.canUseGroups };
}
// switch, then reload so every page re-reads its data for the new owner
export async function switchSpace(space) {
  const r = await fetch('/api/space', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ space }) });
  if (!r.ok) return false;
  try { localStorage.removeItem('jarvis-notes-cache'); } catch { /* ignore */ }
  window.location.assign(space === 'personal' ? '/dashboard/today' : '/dashboard/calendar');
  return true;
}

export function SpaceChip() {
  const { loaded, space, group, groups, canUseGroups } = useSpace();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  if (!loaded || (!canUseGroups && space === 'personal') || (space === 'personal' && !groups.length)) return null;       // nothing to switch to: no chip
  async function pick(sp) { setErr(''); const ok = await switchSpace(sp); if (!ok) setErr('เปิดไม่ได้ — ตรวจสอบสมาชิกกลุ่มกับ LINE ไม่ผ่าน'); }
  return (
    <>
      <button type="button" className="space-chip" data-act="space-chip" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {space === 'group' ? '👥' : '👤'} {space === 'group' ? (group?.name || 'กลุ่ม') : 'ส่วนตัว'} ▾
      </button>
      {open && createPortal(
        <div className="space-overlay" data-act="space-sheet" role="dialog" aria-label="เลือกพื้นที่" onClick={() => setOpen(false)}>
          <div className="space-sheet" onClick={e => e.stopPropagation()}>
            <div className="space-title">เลือกพื้นที่</div>
            <button type="button" className={`space-opt${space === 'personal' ? ' on' : ''}`} data-act="space-personal" onClick={() => pick('personal')}>
              <span>👤</span><span><b>ส่วนตัว</b><small>ข้อมูลของคุณคนเดียว</small></span>
            </button>
            {groups.map(g => (
              <button type="button" key={g.id} className={`space-opt${space === 'group' && group?.id === g.id ? ' on' : ''}`} data-act="space-group" data-gid={g.id} onClick={() => pick('g:' + g.id)}>
                <span>👥</span><span><b>{g.name}</b><small>{g.memberCount ? `${g.memberCount} สมาชิก` : 'กลุ่ม LINE'}</small></span>
              </button>
            ))}
            <div className="space-hint">➕ เพิ่มกลุ่มใหม่: เชิญบอทเข้ากลุ่ม แล้วพิมพ์ <b>@บอท เว็บ</b> ในกลุ่มนั้น</div>
            {err && <div role="alert" className="space-err">{err}</div>}
          </div>
        </div>,
        document.body   // drawn in <body>: inside the nav (which scrolls sideways) a fixed sheet would be clipped, like the account sheet
      )}
    </>
  );
}

export function SpaceBanner() {
  const { space, group } = useSpace();
  if (space !== 'group') return null;
  return <div className="space-banner" data-act="space-banner">👥 กำลังดูข้อมูลของกลุ่ม “{group?.name || 'กลุ่ม'}” · สมาชิกทุกคนเห็นและแก้ได้</div>;
}

export function AddedBy({ item }) {
  const { space } = useSpace();
  if (space !== 'group' || !item?.created_by_name) return null;
  return <span className="added-by" data-act="added-by">เพิ่มโดย {item.created_by_me ? 'คุณ' : item.created_by_name}</span>;
}
