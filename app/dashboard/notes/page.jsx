'use client';
// app/dashboard/notes/page.jsx — Google Keep-style notes (Premium only).
//
// Everything auto-saves — no explicit "Save" required for most actions,
// but title/content edits wait until you click "เสร็จสิ้น" or click
// away before hitting the network (local state only until then).

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

const CATEGORIES = [
  { key: 'general', label: '📄 ทั่วไป' },
  { key: 'work', label: '💼 งาน' },
  { key: 'personal', label: '🙋 ส่วนตัว' },
  { key: 'idea', label: '💡 ไอเดีย' },
  { key: 'shopping', label: '🛒 ช้อปปิ้ง' },
];

function categoryLabel(key) {
  return CATEGORIES.find(c => c.key === key)?.label || key || 'ทั่วไป';
}

function colorBg(key) {
  return `var(--note-${key || 'default'})`;
}

// Textarea that grows to fit its content — no scrollbar, no cramped box.
function AutoGrowTextarea({ value, onChange, placeholder, autoFocus, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px`; }
  }, [value]);
  return (
    <textarea ref={ref} className={className} placeholder={placeholder} value={value}
      onChange={onChange} autoFocus={autoFocus} rows={1} style={{ overflow: 'hidden' }} />
  );
}

// --- New-note composer: click to expand, auto-grows, has a category
// picker, and only saves when you click "เสร็จสิ้น" or click away. ---
function Composer({ onCreate, onEditingChange }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [catOpen, setCatOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { onEditingChange(open); }, [open, onEditingChange]);

  async function commit() {
    if (!title.trim() && !content.trim()) { setOpen(false); return; }
    await onCreate({ title, content, category });
    setTitle(''); setContent(''); setCategory('general'); setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) commit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, content, category]);

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
      <AutoGrowTextarea className="note-content-textarea" placeholder="พิมพ์โน้ต..." value={content}
        onChange={e => setContent(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', position: 'relative' }}>
        <button className="note-icon-btn" onClick={() => setCatOpen(v => !v)} onMouseDown={e => e.stopPropagation()}>
          {categoryLabel(category)} ▾
        </button>
        {catOpen && (
          <div className="note-swatch-row" style={{ position: 'absolute', top: '100%', left: 0, background: 'rgba(255,255,255,0.95)', borderRadius: 10, zIndex: 5, flexDirection: 'column', alignItems: 'stretch' }}>
            {CATEGORIES.map(c => (
              <span key={c.key} onClick={() => { setCategory(c.key); setCatOpen(false); }}
                style={{ padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{c.label}</span>
            ))}
          </div>
        )}
        <button onClick={commit} className="glass-btn" style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem' }}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

// --- One note card: click content to edit inline (auto-grows). Saves
// on "เสร็จสิ้น" or clicking away. Drag handle is its own small element
// so dragging never swallows clicks on the toolbar buttons. ---
function NoteCard({ note, onUpdate, onDelete, onEditingChange, onDragStart, onDragOverCard, onDropCard }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (!editing) { setTitle(note.title); setContent(note.content); } }, [note.title, note.content, editing]);
  useEffect(() => { onEditingChange(note.id, editing); }, [editing, note.id, onEditingChange]);

  function saveEdit() {
    setEditing(false);
    if (title !== note.title || content !== note.content) onUpdate(note.id, { title, content });
  }

  useEffect(() => {
    if (!editing) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) saveEdit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, content]);

  const isArchived = note.archived;

  return (
    <div className="note-card" ref={ref} style={{ background: colorBg(note.color) }}
      onDragOver={onDragOverCard} onDrop={onDropCard}>
      {editing ? (
        <>
          <input className="note-title-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <AutoGrowTextarea className="note-content-textarea" value={content} onChange={e => setContent(e.target.value)} />
          <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
            <button onClick={saveEdit} className="glass-btn" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>เสร็จสิ้น</button>
          </div>
        </>
      ) : (
        <div onClick={() => setEditing(true)} style={{ cursor: 'text', minHeight: 30 }}>
          {note.title && <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.3rem' }}>{note.title}</div>}
          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: '#2c2f3d' }}>{note.content || <span className="muted">โน้ตว่างเปล่า</span>}</div>
        </div>
      )}

      <div className="note-toolbar">
        <span className="note-icon-btn" title="ลากเพื่อสลับตำแหน่ง" draggable
          onDragStart={onDragStart} style={{ cursor: 'grab' }}>⠿</span>
        <button className="note-icon-btn" title="ปักหมุด" onMouseDown={e => e.stopPropagation()}
          onClick={() => onUpdate(note.id, { pinned: !note.pinned })}>
          {note.pinned ? '📌' : '📍'}
        </button>
        <button className="note-icon-btn" title="สี" onMouseDown={e => e.stopPropagation()}
          onClick={() => setPickerOpen(v => !v)}>🎨</button>
        {isArchived ? (
          <button className="note-icon-btn" title="ย้ายกลับไปโน้ตปกติ" onMouseDown={e => e.stopPropagation()}
            onClick={() => onUpdate(note.id, { archived: false })}>↩️</button>
        ) : (
          <button className="note-icon-btn" title="เก็บเข้าคลัง" onMouseDown={e => e.stopPropagation()}
            onClick={() => onUpdate(note.id, { archived: true })}>🗄️</button>
        )}
        <button className="note-icon-btn" title="ลบ" onMouseDown={e => e.stopPropagation()}
          onClick={() => { if (confirm('ลบโน้ตนี้ใช่ไหม?')) onDelete(note.id); }}>🗑️</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>{categoryLabel(note.category)}</span>
      </div>

      {pickerOpen && (
        <div className="note-swatch-row">
          {COLORS.map(c => (
            <span key={c.key} title={c.label}
              className={`note-swatch${note.color === c.key ? ' active' : ''}`}
              style={{ background: colorBg(c.key) }}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { onUpdate(note.id, { color: c.key }); setPickerOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// A masonry section whose cards can be dragged to reorder among each
// other. The drag HANDLE (⠿) is the only draggable element — not the
// whole card — so dragging never intercepts clicks on the toolbar
// buttons (pin/color/archive/delete), which native HTML5 drag-and-drop
// otherwise tends to swallow when the entire card is draggable.
function DraggableSection({ notes, onUpdate, onDelete, onEditingChange, onReorder, onDragStateChange }) {
  const dragIndex = useRef(null);

  function handleDragStart(i) {
    dragIndex.current = i;
    onDragStateChange(true);
  }
  function handleDrop(e, targetIndex) {
    e.preventDefault();
    onDragStateChange(false);
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
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); handleDragStart(i); }}
          onDragOverCard={(e) => e.preventDefault()}
          onDropCard={(e) => handleDrop(e, i)}
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
  const draggingRef = useRef(false);

  const load = useCallback(async (archived = showArchived) => {
    const res = await fetch(`/api/notes?archived=${archived}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (res.status === 403) { setLocked(true); return; }
    const data = await res.json();
    setNotes(data.notes);
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh — a note added via the LINE bot shows up here without
  // a manual reload. Paused while: locked (nothing to refresh), the
  // composer or any card is being edited, or a drag is in progress —
  // a poll mid-drag or mid-typing would clobber unsaved local state.
  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => {
      if (composerEditing || editingIds.current.size > 0 || draggingRef.current) return;
      load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load, composerEditing, locked]);

  const setCardEditing = useCallback((id, isEditing) => {
    if (isEditing) editingIds.current.add(id); else editingIds.current.delete(id);
  }, []);

  async function createNote({ title, content, category }) {
    const res = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category }),
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
                    onDragStateChange={(v) => { draggingRef.current = v; }}
                    onReorder={(r) => reorderSection(r, new Set(pinned.map(n => n.id)))} />
                  {others.length > 0 && <div className="text-white-muted" style={{ margin: '1rem 0 0.5rem', fontWeight: 600 }}>อื่นๆ</div>}
                </>
              )}
              <DraggableSection notes={others} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r) => reorderSection(r, new Set(others.map(n => n.id)))} />
            </>
          )}

          {viewMode === 'grouped' && Object.entries(grouped).map(([category, catNotes]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                🏷️ {categoryLabel(category)} <span style={{ opacity: 0.7 }}>({catNotes.length})</span>
              </div>
              <DraggableSection notes={catNotes} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r) => reorderSection(r, new Set(catNotes.map(n => n.id)))} />
            </div>
          ))}
        </>
      )}
    </main>
  );
}
