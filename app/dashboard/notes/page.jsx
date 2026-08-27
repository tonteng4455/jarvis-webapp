'use client';
// app/dashboard/notes/page.jsx — Google Keep-style notes (Premium only).
//
// Everything auto-saves — no "Save" button anywhere, matching Keep.
// Also: auto-refreshes periodically (so a note added via the LINE bot
// shows up here without a manual page reload), supports drag-to-reorder
// within a section, and has a "grouped by category" view alongside the
// normal pinned/others masonry view.

import { useState, useEffect, useRef, useCallback } from 'react';
import { DashNav, PremiumUpsell } from '../_components';

const COLORS = [
  { key: 'default', label: 'ค่าเริ่มต้น' },
  { key: 'red', label: 'แดง' },
  { key: 'orange', label: 'ส้ม' },
  { key: 'yellow', label: 'เหลือง' },
  { key: 'green', label: 'เขียว' },
  { key: 'teal', label: 'เขียวอมฟ้า' },
  { key: 'blue', label: 'ฟ้า' },
  { key: 'purple', label: 'ม่วง' },
  { key: 'pink', label: 'ชมพู' },
  { key: 'gray', label: 'เทา' },
];

const REFRESH_MS = 8000; // auto-refresh interval — paused while any card is being edited

function colorBg(key) {
  return `var(--note-${key || 'default'})`;
}

// --- New-note composer: click to expand, auto-saves on blur ---
function Composer({ onCreate, onEditingChange }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const ref = useRef(null);

  useEffect(() => { onEditingChange(open); }, [open, onEditingChange]);

  async function commit() {
    if (!title.trim() && !content.trim()) { setOpen(false); return; }
    await onCreate({ title, content });
    setTitle(''); setContent(''); setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) commit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, content]);

  if (!open) {
    return (
      <div className="note-composer" onClick={() => setOpen(true)} style={{ cursor: 'text' }}>
        <span className="muted">➕ จดโน้ตใหม่...</span>
      </div>
    );
  }
  return (
    <div className="note-composer" ref={ref}>
      <input className="note-title-input" placeholder="หัวข้อ" value={title}
        onChange={e => setTitle(e.target.value)} autoFocus />
      <textarea className="note-content-textarea" placeholder="พิมพ์โน้ต..." rows={3}
        value={content} onChange={e => setContent(e.target.value)} />
      <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
        <button onClick={commit} className="glass-btn" style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem' }}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

// --- One note card: click content to edit inline, auto-saves on blur.
// Also draggable — dragging is handled by the parent grid (this just
// wires up the native drag event handlers it's given as props). ---
function NoteCard({ note, onUpdate, onDelete, onEditingChange, dragProps }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (!editing) { setTitle(note.title); setContent(note.content); } }, [note.title, note.content, editing]);
  useEffect(() => { onEditingChange(note.id, editing); }, [editing, note.id, onEditingChange]);

  useEffect(() => {
    if (!editing) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setEditing(false);
        if (title !== note.title || content !== note.content) {
          onUpdate(note.id, { title, content });
        }
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, content]);

  return (
    <div className="note-card" ref={ref} style={{ background: colorBg(note.color) }} {...dragProps}>
      {editing ? (
        <>
          <input className="note-title-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea className="note-content-textarea" rows={4} value={content} onChange={e => setContent(e.target.value)} />
        </>
      ) : (
        <div onClick={() => setEditing(true)} style={{ cursor: 'text', minHeight: 30 }}>
          {note.title && <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{note.title}</div>}
          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: '#2c2f3d' }}>{note.content || <span className="muted">โน้ตว่างเปล่า</span>}</div>
        </div>
      )}

      <div className="note-toolbar">
        <span className="note-icon-btn" title="ลากเพื่อสลับตำแหน่ง" style={{ cursor: 'grab' }}>⠿</span>
        <button className="note-icon-btn" title="ปักหมุด" onClick={() => onUpdate(note.id, { pinned: !note.pinned })}>
          {note.pinned ? '📌' : '📍'}
        </button>
        <button className="note-icon-btn" title="สี" onClick={() => setPickerOpen(v => !v)}>🎨</button>
        <button className="note-icon-btn" title="เก็บเข้าคลัง" onClick={() => onUpdate(note.id, { archived: true })}>🗄️</button>
        <button className="note-icon-btn" title="ลบ" onClick={() => { if (confirm('ลบโน้ตนี้ใช่ไหม?')) onDelete(note.id); }}>🗑️</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>{note.category}</span>
      </div>

      {pickerOpen && (
        <div className="note-swatch-row">
          {COLORS.map(c => (
            <span key={c.key} title={c.label}
              className={`note-swatch${note.color === c.key ? ' active' : ''}`}
              style={{ background: colorBg(c.key) }}
              onClick={() => { onUpdate(note.id, { color: c.key }); setPickerOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// A masonry section whose cards can be dragged to reorder AMONG each
// other (dragging is scoped per-section — e.g. pinned notes reorder
// within pinned, others within others — matching how Keep itself keeps
// pinned/unpinned as separate reorderable groups).
function DraggableSection({ notes, onUpdate, onDelete, onEditingChange, onReorder }) {
  const dragIndex = useRef(null);

  function handleDrop(targetIndex) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const reordered = [...notes];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered);
  }

  return (
    <div className="note-masonry">
      {notes.map((n, i) => (
        <NoteCard
          key={n.id}
          note={n}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEditingChange={onEditingChange}
          dragProps={{
            draggable: true,
            onDragStart: () => { dragIndex.current = i; },
            onDragOver: (e) => e.preventDefault(),
            onDrop: () => handleDrop(i),
          }}
        />
      ))}
    </div>
  );
}

export default function NotesPage() {
  const [notes, setNotes] = useState(null);
  const [locked, setLocked] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'grouped'
  const [composerEditing, setComposerEditing] = useState(false);
  const editingIds = useRef(new Set());

  const load = useCallback(async (archived = showArchived) => {
    const res = await fetch(`/api/notes?archived=${archived}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (res.status === 403) { setLocked(true); return; }
    const data = await res.json();
    setNotes(data.notes);
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh — so a note added via the LINE bot shows up here
  // without a manual reload. Paused while the composer or any card is
  // actively being edited, so a poll never clobbers in-progress typing.
  // Also simply doesn't run at all for a locked (Free) account — there's
  // nothing to refresh behind the paywall, so polling would just be
  // wasted requests forever for as long as that tab stays open.
  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => {
      if (composerEditing || editingIds.current.size > 0) return;
      load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, composerEditing, locked]);

  const setCardEditing = useCallback((id, isEditing) => {
    if (isEditing) editingIds.current.add(id); else editingIds.current.delete(id);
  }, []);

  async function createNote({ title, content }) {
    const res = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    if (res.ok) load();
  }

  async function updateNote(id, patch) {
    setNotes(prev => prev?.map(n => n.id === id ? { ...n, ...patch } : n));
    const res = await fetch(`/api/notes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) load();
    else if ('archived' in patch || 'pinned' in patch) load();
  }

  async function deleteNote(id) {
    setNotes(prev => prev?.filter(n => n.id !== id));
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  }

  // Persist a new drag order: assign sequential sort_order to just the
  // notes in this section (pinned or others), save optimistically.
  async function reorderSection(reordered, sectionIds) {
    const idToOrder = new Map(reordered.map((n, i) => [n.id, i]));
    setNotes(prev => prev?.map(n => sectionIds.has(n.id) ? { ...n, sort_order: idToOrder.get(n.id) } : n));
    await Promise.all(reordered.map((n, i) =>
      fetch(`/api/notes/${n.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      })
    ));
  }

  const filtered = notes?.filter(n =>
    !search.trim() || `${n.title} ${n.content}`.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const pinned = filtered.filter(n => n.pinned);
  const others = filtered.filter(n => !n.pinned);

  const grouped = {};
  for (const n of filtered) {
    const key = n.category || 'general';
    (grouped[key] = grouped[key] || []).push(n);
  }

  return (
    <main className="page page-wide">
      <DashNav current="notes" />
      <h1 className="page-title">📝 โน้ตของฉัน</h1>
      {locked && <PremiumUpsell />}

      {!locked && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="glass-input" placeholder="🔍 ค้นหาโน้ต..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <div className="dash-nav" style={{ margin: 0, padding: 0 }}>
              <span className={`dash-nav-item${viewMode === 'all' ? ' active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setViewMode('all')}>📌 ทั้งหมด</span>
              <span className={`dash-nav-item${viewMode === 'grouped' ? ' active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setViewMode('grouped')}>🗂️ แยกตามหมวด</span>
            </div>
            <button className="glass-btn-outline" onClick={() => { const v = !showArchived; setShowArchived(v); load(v); }}>
              {showArchived ? '⬅️ กลับไปโน้ตปกติ' : '🗄️ ดูคลังเก็บ'}
            </button>
          </div>

          {!showArchived && <Composer onCreate={createNote} onEditingChange={setComposerEditing} />}

          {notes === null && <p className="text-white-muted">กำลังโหลด...</p>}
          {notes?.length === 0 && <p className="text-white-muted">{showArchived ? 'ยังไม่มีโน้ตในคลังเก็บ' : 'ยังไม่มีโน้ตครับ ลองจดดูได้เลย'}</p>}

          {viewMode === 'all' && (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>📌 ปักหมุด</div>
                  <DraggableSection notes={pinned} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing}
                    onReorder={(r) => reorderSection(r, new Set(pinned.map(n => n.id)))} />
                  {others.length > 0 && <div className="text-white-muted" style={{ margin: '1rem 0 0.5rem', fontWeight: 600 }}>อื่นๆ</div>}
                </>
              )}
              <DraggableSection notes={others} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing}
                onReorder={(r) => reorderSection(r, new Set(others.map(n => n.id)))} />
            </>
          )}

          {viewMode === 'grouped' && Object.entries(grouped).map(([category, catNotes]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                🏷️ {category} <span style={{ opacity: 0.7 }}>({catNotes.length})</span>
              </div>
              <DraggableSection notes={catNotes} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing}
                onReorder={(r) => reorderSection(r, new Set(catNotes.map(n => n.id)))} />
            </div>
          ))}
        </>
      )}
    </main>
  );
}
