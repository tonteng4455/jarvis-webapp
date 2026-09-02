'use client';
// app/dashboard/notes/page.jsx — Google Keep-style notes.
//
// Everything auto-saves — no explicit "Save" required for most actions,
// but title/content edits wait until you click "เสร็จสิ้น" or click
// away before hitting the network (local state only until then).

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, CategorySelect, NOTE_CATEGORIES } from '../_components';

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

function categoryLabel(key) {
  return NOTE_CATEGORIES.find(c => c.key === key)?.label || key || 'ทั่วไป';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.5rem' }}>
        <div style={{ flex: 1, maxWidth: 180 }} onMouseDown={e => e.stopPropagation()}>
          <CategorySelect options={NOTE_CATEGORIES} value={category} onChange={setCategory} />
        </div>
        <button onClick={commit} className="glass-btn" style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', flex: '0 0 auto' }}>เสร็จสิ้น</button>
      </div>
    </div>
  );
}

// --- One note: collapsed = a compact horizontal row (same idea as a
// calendar-list card) with a color accent bar and a drag handle.
// Clicking it EXPANDS into the same prominent "note-composer" look
// used for creating a new note — big title input, auto-grow textarea,
// category select, full toolbar — instead of editing cramped inside
// the small row. Saves on "เสร็จสิ้น" or clicking away. ---
function NoteCard({ note, onUpdate, onDelete, onEditingChange, onHandlePointerDown, isDragging, autoEditId }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category || 'general');
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef(null);

  // Coming from a LIFF link (bot card's "✏️ แก้ไข" button) with
  // ?id=... — jump straight into editing this one note, scrolled into
  // view, instead of making someone find it in the list first.
  useEffect(() => {
    if (autoEditId && String(note.id) === String(autoEditId)) {
      setEditing(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId]);

  useEffect(() => { if (!editing) { setTitle(note.title); setContent(note.content); setCategory(note.category || 'general'); } }, [note.title, note.content, note.category, editing]);
  useEffect(() => { onEditingChange(note.id, editing); }, [editing, note.id, onEditingChange]);

  function saveEdit() {
    setEditing(false);
    if (title !== note.title || content !== note.content || category !== note.category) {
      onUpdate(note.id, { title, content, category });
    }
  }

  useEffect(() => {
    if (!editing) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) saveEdit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, content, category]);

  const isArchived = note.archived;

  if (editing) {
    return (
      <div className="note-composer" ref={ref} data-note-id={note.id}>
        <input className="note-title-input" placeholder="หัวข้อ" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <AutoGrowTextarea className="note-content-textarea" placeholder="พิมพ์โน้ต..." value={content} onChange={e => setContent(e.target.value)} />
        <div style={{ marginTop: '0.5rem', maxWidth: 220 }} onMouseDown={e => e.stopPropagation()}>
          <CategorySelect options={NOTE_CATEGORIES} value={category} onChange={setCategory} />
        </div>

        <div className="note-toolbar">
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
          <button onClick={saveEdit} className="glass-btn" style={{ marginLeft: 'auto', padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>เสร็จสิ้น</button>
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

  return (
    <div className="note-row" ref={ref} data-note-id={note.id}
      onClick={() => setEditing(true)} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <span className="note-drag-handle" title="ลากเพื่อสลับตำแหน่ง"
        onPointerDown={onHandlePointerDown} onClick={e => e.stopPropagation()}>⠿</span>
      <div className="note-row-accent" style={{ background: colorBg(note.color) === 'var(--note-default)' ? 'var(--border-strong)' : colorBg(note.color) }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {note.title && <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title}</div>}
        <div className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {note.content || 'โน้ตว่างเปล่า'}
        </div>
      </div>
      {note.pinned && <span title="ปักหมุด">📌</span>}
      <span className="muted" style={{ fontSize: '0.65rem', flex: '0 0 auto' }}>{categoryLabel(note.category)}</span>
    </div>
  );
}

// A vertical list whose rows can be dragged to reorder among each
// other. Built on POINTER EVENTS (not native HTML5 drag-and-drop) —
// the old implementation used draggable/dragstart/dragover/drop, which
// is a MOUSE-ONLY spec that most mobile browsers don't fire at all for
// touch gestures. That's why dragging on a phone just snapped back to
// the original position: the drop event never fired, so nothing ever
// actually reordered. Pointer Events (pointerdown/pointermove/pointerup)
// unify mouse AND touch, so the same code now works on both. A single
// vertical stack (rather than the earlier masonry grid) also makes
// target-index detection unambiguous — no column-jumping to reason
// about, just "which row am I closest to vertically".
function DraggableSection({ notes, onUpdate, onDelete, onEditingChange, onReorder, onDragStateChange, autoEditId }) {
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const dragState = useRef(null); // { fromIndex, pointerId }
  // React state updates are async/batched — during a fast drag, several
  // pointermove events can fire before a re-render lands, so reading
  // the `notes` PROP directly risked handlePointerUp saving a stale
  // array (the reorder shown on screen and the reorder actually saved
  // could silently diverge). A ref updated synchronously on every move
  // sidesteps that entirely — always reads/writes the true latest order.
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  function handlePointerDown(e, index) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragState.current = { fromIndex: index, pointerId: e.pointerId };
    setDraggingId(notesRef.current[index].id);
    onDragStateChange(true);
  }

  function findTargetIndex(clientY) {
    if (!containerRef.current) return null;
    const cards = Array.from(containerRef.current.querySelectorAll('[data-note-id]'));
    let closestIndex = null;
    let closestDist = Infinity;
    cards.forEach((cardEl, i) => {
      const rect = cardEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - midY);
      if (dist < closestDist) { closestDist = dist; closestIndex = i; }
    });
    return closestIndex;
  }

  function handlePointerMove(e) {
    if (!dragState.current || e.pointerId !== dragState.current.pointerId) return;
    e.preventDefault();
    const targetIndex = findTargetIndex(e.clientY);
    const fromIndex = dragState.current.fromIndex;
    if (targetIndex === null || targetIndex === fromIndex) return;
    const reordered = [...notesRef.current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    dragState.current.fromIndex = targetIndex;
    notesRef.current = reordered; // update immediately — don't wait for the prop round-trip
    onReorder(reordered, { silent: true });
  }

  function handlePointerUp(e) {
    if (!dragState.current || e.pointerId !== dragState.current.pointerId) return;
    dragState.current = null;
    setDraggingId(null);
    onDragStateChange(false);
    onReorder(notesRef.current, { silent: false }); // always the latest order, never stale
  }

  return (
    <div className="list-stack" ref={containerRef}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      {notes.map((n, i) => (
        <NoteCard
          key={n.id}
          note={n}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEditingChange={onEditingChange}
          isDragging={draggingId === n.id}
          autoEditId={autoEditId}
          onHandlePointerDown={(e) => handlePointerDown(e, i)}
        />
      ))}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <NotesPageInner />
    </Suspense>
  );
}

function NotesPageInner() {
  const [notes, setNotes] = useState(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'grouped'
  const [composerEditing, setComposerEditing] = useState(false);
  const [status, setStatus] = useState(null);
  const editingIds = useRef(new Set());
  const draggingRef = useRef(false);
  const searchParams = useSearchParams();
  const autoEditId = searchParams.get('id');

  const load = useCallback(async (archived = showArchived) => {
    const res = await fetch(`/api/notes?archived=${archived}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    setNotes(data.notes);
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh — a note added via the LINE bot shows up here without
  // a manual reload. Paused while the composer or any card is being
  // edited, or a drag is in progress — a poll mid-drag or mid-typing
  // would clobber unsaved local state.
  useEffect(() => {
    const timer = setInterval(() => {
      if (composerEditing || editingIds.current.size > 0 || draggingRef.current) return;
      load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load, composerEditing]);

  const setCardEditing = useCallback((id, isEditing) => {
    if (isEditing) editingIds.current.add(id); else editingIds.current.delete(id);
  }, []);

  async function createNote({ title, content, category }) {
    const res = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category }),
    });
    if (res.ok) { load(); return; }
    const data = await res.json().catch(() => ({}));
    if (data.error === 'quota_reached') {
      setStatus(`📝 คุณมีโน้ตครบ ${data.limit} รายการแล้วครับ (สูงสุดสำหรับ Free) ลองลบโน้ตเก่าที่ไม่ใช้แล้ว หรืออัปเกรด Premium เพื่อจดได้ไม่จำกัด`);
    } else {
      setStatus('❌ บันทึกไม่สำเร็จ');
    }
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

  async function reorderSection(reordered, sectionIds, opts = {}) {
    // `reordered` is the new order for just the items in ONE section
    // (pinned-only, or one category group) — rebuild the notes array
    // with those items sitting in the SAME slots they originally
    // occupied, but filled in in their new relative order; anything
    // outside this section stays exactly where it was.
    //
    // This used to only tag each note with its new `sort_order` VALUE
    // without ever touching the array's actual element order — so
    // every derived view (`pinned`/`others`/`grouped`, all plain
    // .filter() calls that preserve whatever order the source array
    // is already in) kept rendering the OLD order every time, making
    // the drag look like it had no effect at all, live or after
    // release, even though the field value itself was being updated
    // correctly under the hood.
    const reorderedIter = reordered[Symbol.iterator]();
    setNotes(prev => prev?.map(n => sectionIds.has(n.id) ? reorderedIter.next().value : n));
    if (opts.silent) return; // live drag feedback only — don't hit the network on every pixel of movement
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
      {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}

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
                  <DraggableSection notes={pinned} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId}
                    onDragStateChange={(v) => { draggingRef.current = v; }}
                    onReorder={(r, opts) => reorderSection(r, new Set(pinned.map(n => n.id)), opts)} />
                  {others.length > 0 && <div className="text-white-muted" style={{ margin: '1rem 0 0.5rem', fontWeight: 600 }}>อื่นๆ</div>}
                </>
              )}
              <DraggableSection notes={others} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(others.map(n => n.id)), opts)} />
            </>
          )}

          {viewMode === 'grouped' && Object.entries(grouped).map(([category, catNotes]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                🏷️ {categoryLabel(category)} <span style={{ opacity: 0.7 }}>({catNotes.length})</span>
              </div>
              <DraggableSection notes={catNotes} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(catNotes.map(n => n.id)), opts)} />
            </div>
          ))}
        </>
    </main>
  );
}
