'use client';
// app/dashboard/_noteTree.jsx — the pieces of "notes inside notes": breadcrumb, the tree (side panel on a wide screen / "move to…" sheet),
// and the question asked when a note that has sub-notes is deleted. The data rules live in lib/noteTree.js.

import { useMemo, useState, useEffect } from 'react';
import { buildTree, visibleRows, indexNotes, descendantIds, pathOf, noteLabel } from '../../lib/noteTree';

const OPEN_KEY = 'jarvis_notes_tree_open';
function useOpenSet() {
  const [open, setOpen] = useState(() => new Set());
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); if (Array.isArray(v)) setOpen(new Set(v)); } catch { /* none saved */ } }, []);
  const toggle = id => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem(OPEN_KEY, JSON.stringify([...n].slice(-300))); } catch { /* ok */ } return n; });
  const openAll = ids => setOpen(prev => { const n = new Set([...prev, ...ids]); return n; });
  return [open, toggle, openAll];
}

// 📝 โน้ต › งานโครงการ A › งบประมาณ   (every part but the last is a link back up)
export function Crumbs({ path, onGo }) {
  if (!path.length) return null;
  return (
    <nav className="note-crumbs" aria-label="ตำแหน่งของหน้านี้">
      <button type="button" className="note-crumb" onClick={() => onGo(null)} data-act="crumb-root">📝 โน้ต</button>
      {path.map((n, i) => (
        <span key={n.id} className="note-crumb-wrap">
          <span className="note-crumb-sep" aria-hidden>›</span>
          {i === path.length - 1
            ? <b className="note-crumb here" aria-current="page">{noteLabel(n)}</b>
            : <button type="button" className="note-crumb" onClick={() => onGo(n.id)}>{noteLabel(n)}</button>}
        </span>
      ))}
    </nav>
  );
}

function Rows({ rows, curId, onPick, onToggle, disabled, markId }) {
  return (
    <ul className="nt-list" role="tree">
      {rows.map(r => {
        const off = disabled?.has(r.note.id);
        return (
          <li key={r.note.id} role="treeitem" aria-expanded={r.hasKids ? r.open : undefined} aria-selected={curId === r.note.id} style={{ '--d': r.depth }}>
            <span className="nt-row">
              {r.hasKids
                ? <button type="button" className="nt-twist" aria-label={r.open ? 'ย่อ' : 'ขยาย'} onClick={() => onToggle(r.note.id)}>{r.open ? '▾' : '▸'}</button>
                : <span className="nt-twist none" aria-hidden>·</span>}
              <button type="button" className={`nt-item${curId === r.note.id ? ' on' : ''}${markId === r.note.id ? ' here' : ''}`} disabled={off} onClick={() => onPick(r.note.id)} title={noteLabel(r.note)}>
                <span aria-hidden>📄</span><span className="nt-name">{noteLabel(r.note)}</span>
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// the left panel of a wide screen: the whole tree, the page you are on highlighted
export function TreePanel({ notes, curId, onGo, cmp }) {
  const [open, toggle, openAll] = useOpenSet();
  const tree = useMemo(() => buildTree(notes, cmp), [notes, cmp]);
  const byId = useMemo(() => indexNotes(notes).byId, [notes]);
  useEffect(() => { if (curId) openAll(pathOf(curId, byId).slice(0, -1).map(n => n.id)); }, [curId, byId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rows = visibleRows(tree, open);
  return (
    <aside className="notes-tree" aria-label="โครงสร้างโน้ต">
      <button type="button" className={`nt-root${curId ? '' : ' on'}`} onClick={() => onGo(null)}>📝 โน้ตทั้งหมด</button>
      <Rows rows={rows} curId={curId} onPick={onGo} onToggle={toggle} />
    </aside>
  );
}

// "📂 ย้ายไปที่…": choose the new place for one note (itself and everything under it are greyed out — that would be a loop)
export function MoveSheet({ notes, moving, onPick, onClose, cmp }) {
  const [open, toggle, openAll] = useOpenSet();
  const { byId, kids } = useMemo(() => indexNotes(notes), [notes]);
  const tree = useMemo(() => buildTree(notes, cmp), [notes, cmp]);
  const blocked = useMemo(() => new Set([moving.id, ...descendantIds(moving.id, kids)]), [moving.id, kids]);
  const here = byId.has(moving.parent_id) ? moving.parent_id : null;
  useEffect(() => { openAll(pathOf(here, byId).map(n => n.id)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const rows = visibleRows(tree, open);
  return (
    <div className="space-overlay" style={{ zIndex: 5200 }} role="dialog" aria-label="ย้ายโน้ตไปที่" data-act="move-sheet" onClick={onClose}>
      <div className="space-sheet nt-sheet" onClick={e => e.stopPropagation()}>
        <div className="space-title">📂 ย้าย “{noteLabel(moving)}” ไปไว้ใต้…</div>
        <button type="button" className={`nt-root${here === null ? ' on' : ''}`} onClick={() => onPick(null)} data-act="move-root">📝 ระดับบนสุด (ไม่อยู่ใต้โน้ตไหน)</button>
        <Rows rows={rows} curId={here} disabled={blocked} onPick={onPick} onToggle={toggle} />
        <button type="button" className="glass-btn-outline" style={{ marginTop: '0.7rem', width: '100%' }} onClick={onClose}>ยกเลิก</button>
      </div>
    </div>
  );
}

// deleting a note that has sub-notes: never silently lose them
export function DeleteWithKidsSheet({ note, count, onLift, onAll, onClose }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="space-overlay" style={{ zIndex: 5200 }} role="dialog" aria-label="ลบโน้ตที่มีหน้าย่อย" data-act="delete-kids-sheet" onClick={onClose}>
      <div className="space-sheet" onClick={e => e.stopPropagation()}>
        <div className="space-title">🗑️ “{noteLabel(note)}” มีหน้าย่อยอยู่ {count} หน้า</div>
        <p className="muted" style={{ margin: '0 0 0.6rem' }}>จะให้ทำอย่างไรกับหน้าย่อย</p>
        <button type="button" className="space-opt" data-act="delete-lift" onClick={onLift}><span>⬆️</span><span><b>ลบเฉพาะหน้านี้</b><small>หน้าย่อยทั้งหมดย้ายขึ้นไปอยู่ชั้นบน ไม่มีอะไรหาย</small></span></button>
        <button type="button" className="space-opt" data-act="delete-all" onClick={onAll}><span>🗑️</span><span><b>ลบทั้งหมด ({count + 1} หน้า)</b><small>ลบหน้านี้พร้อมหน้าย่อยทุกชั้น (เลิกทำได้ 6 วินาที)</small></span></button>
        <button type="button" className="space-opt" onClick={onClose}><span>✕</span><span><b>ยกเลิก</b></span></button>
      </div>
    </div>
  );
}
