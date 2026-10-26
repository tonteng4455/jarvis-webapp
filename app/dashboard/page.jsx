'use client';
// app/dashboard/page.jsx — Google Keep-style notes (now the dashboard's landing page).
//
// Everything auto-saves — no explicit "Save" required for most actions,
// but title/content edits wait until you click "เสร็จสิ้น" or click
// away before hitting the network (local state only until then).

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashNav, NOTE_CATEGORIES } from './_components';
import { NoteEditorPanel, EditorOverlay, useNoteImages, DownloadSheet, COLORS, colorBg } from './_noteEditor';
import { ConvertToTaskSheet, ConvertToEventSheet, noteSource } from './_taskEditor';
import { ConvertChooser, convertItem } from './_convert';
import { previewText } from '../../lib/noteBlocks';
import { noteToMarkdown, notesToMarkdownFiles, notesToCombinedMarkdown, safeFileName } from '../../lib/noteMarkdown';
import { notesToPdf } from '../../lib/notePdf';
import { createZip } from '../../lib/zip';
import { apiGet, ErrorState, Fab, ListSkeleton, useToast, withoutPending } from './_ui';


const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function categoryLabel(key) {
  return NOTE_CATEGORIES.find(c => c.key === key)?.label || key || 'ทั่วไป';
}

// --- New-note composer: opened ONLY by a deliberate tap on the list page (the "＋ จดโน้ตใหม่"
// bar, the round ＋ button, or the one-shot ?new=1 shortcut) — never as a side effect of coming
// back to this page. Saves on ✓ or when you click away. ---
function Composer({ onCreate, onUpdate, onDiscard, onEditingChange, categories, openSignal }) {
  const [open, setOpen] = useState(false);
  // Open when the signal CHANGES while this is mounted. The old version opened whenever the signal
  // was non-zero, so remounting the composer (e.g. leaving the archive view) popped a new note open.
  const seenSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== seenSignal.current) { seenSignal.current = openSignal; setOpen(true); }
  }, [openSignal]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState('default');
  const imgState = useNoteImages([], 'composer');
  const { images, setImages, uploadingRef } = imgState;
  const ref = useRef(null);

  useEffect(() => { onEditingChange(open); }, [open, onEditingChange]);

  const draft = useRef({});
  draft.current = { title, content, category, images, pinned, color };

  // The draft is saved ONCE (POST) the first time it has something in it, and every later save is an update (PATCH) of that
  // same note — so the autosave timer, "page went to the background", ✓ and click-away can all fire in any order without
  // ever making a second copy. Saves run one after another (never two creates racing each other).
  const created = useRef(null);          // { id, sent } once the note exists on the server
  const leaving = useRef(false), leaveTried = useRef(false);
  const chain = useRef(Promise.resolve());
  const snapshot = d => ({ title: d.title, content: d.content, category: d.category, pinned: d.pinned, color: d.color, images: JSON.stringify(d.images) });
  const isEmpty = d => !d.title.trim() && !d.content.trim() && d.images.length === 0;
  function persistDraft({ quiet = true } = {}) {
    chain.current = chain.current.then(async () => {
      const d = draft.current;
      if (uploadingRef.current) return;                      // wait for the in-flight photo upload
      if (!created.current) {
        if (isEmpty(d)) return;
        // While the page is being closed / left, the one create request that goes out may report "failed" to this page even
        // though the server received it — sending it again would make a second copy. So: one attempt only.
        if (leaving.current) { if (leaveTried.current) return; leaveTried.current = true; }
        const note = await onCreate(d, { quiet });
        if (note?.id) created.current = { id: note.id, sent: snapshot(d) };
        return;
      }
      const now = snapshot(d), sent = created.current.sent, patch = {};
      for (const k of ['title', 'content', 'category', 'pinned', 'color']) if (now[k] !== sent[k]) patch[k] = d[k];
      if (now.images !== sent.images) patch.images = d.images;
      if (Object.keys(patch).length === 0) return;
      created.current.sent = now;
      await onUpdate(created.current.id, patch);
    }).catch(() => {});
    return chain.current;
  }

  const committing = useRef(false);
  const resetUi = () => { setTitle(''); setContent(''); setCategory('general'); setPinned(false); setColor('default'); setImages([]); setOpen(false); };
  async function commit() {
    if (uploadingRef.current || committing.current) return;       // a second click-away / double tap must not save twice
    committing.current = true;
    try {
      if (isEmpty(draft.current)) {                               // nothing left (or emptied after it was auto-saved)
        await chain.current;
        if (created.current) await onDiscard(created.current.id);
      } else await persistDraft({ quiet: false });
      created.current = null;
      resetUi();
    } finally { committing.current = false; }
  }
  function discard() {                                              // 🗑️ "ทิ้งร่างนี้" — also removes a copy that was already auto-saved
    resetUi();
    chain.current = chain.current.then(async () => { const c = created.current; created.current = null; if (c) await onDiscard(c.id); }).catch(() => {});
  }

  // Like Keep: saved shortly after you stop typing, and when the page is hidden / closed / Back is pressed.
  const persistRef = useRef(null);
  persistRef.current = () => { if (!committing.current) persistDraft(); };
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => persistRef.current(), 1500);
    return () => clearTimeout(t);
  }, [open, title, content, category, images, pinned, color]);
  useEffect(() => {
    if (!open) return undefined;
    const flush = () => persistRef.current();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    const onHide = () => { leaving.current = true; flush(); };
    const onShow = () => { leaving.current = false; leaveTried.current = false; };   // came back from the back/forward cache
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow); };
  }, [open]);
  // leaving the page (Back, navigating away) with a draft open: it is saved, never thrown away
  const openRef = useRef(false); openRef.current = open;
  useEffect(() => () => { if (openRef.current) { leaving.current = true; persistRef.current(); } }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) commit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, content, category, images, pinned, color]);

  if (!open) {
    return (
      <div className="add-bar" onClick={() => setOpen(true)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') setOpen(true); }}>
        <span className="add-bar-plus">＋</span><span>จดโน้ตใหม่...</span>
      </div>
    );
  }
  return (
    <EditorOverlay>
      <div className="note-editor-modal note-composer" ref={ref} style={{ '--tint': colorBg(color) }}>
        <NoteEditorPanel isNew
          titleValue={title} onTitle={setTitle} initialContent="" onContent={setContent}
          imgState={imgState} categories={categories} category={category} onCategory={setCategory}
          pinned={pinned} onPin={() => setPinned(v => !v)} color={color} onColor={setColor}
          onDelete={discard} onDone={commit} doneDisabled={imgState.uploading > 0} />
      </div>
    </EditorOverlay>
  );
}

// --- One note: collapsed = a compact horizontal row (same idea as a
// calendar-list card) with a color accent bar and a drag handle.
// Clicking it EXPANDS into the same prominent "note-composer" look
// used for creating a new note — big title input, auto-grow textarea,
// category select, full toolbar — instead of editing cramped inside
// the small row. Saves on "เสร็จสิ้น" or clicking away. ---
function NoteCard({ note, onUpdate, onDelete, onConvert, onEditingChange, onHandlePointerDown, isDragging, autoEditId, categories, selection }) {
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(null);   // null | 'choose' | 'task' | 'event'
  const press = useRef(null);
  const longFired = useRef(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category || 'general');
  const imgState = useNoteImages(note.images || [], note.id);
  const { images, setImages, uploadingRef } = imgState;
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

  useEffect(() => { if (!editing) { setTitle(note.title); setContent(note.content); setCategory(note.category || 'general'); setImages(note.images || []); } }, [note.title, note.content, note.category, note.images, editing]);
  useEffect(() => { onEditingChange(note.id, editing); }, [editing, note.id, onEditingChange]);
  useEffect(() => () => onEditingChange(note.id, false), [note.id, onEditingChange]);   // a card that unmounts while editing (converted away) must not pause the auto-refresh forever

  // What was last sent to the server, so ✓, click-away, the autosave timer and "page is going away"
  // can all call persist() without ever sending the same edit twice.
  const sent = useRef(null);
  const latest = useRef({});
  latest.current = { title, content, category, images };
  useEffect(() => {
    if (editing) sent.current = { title: note.title, content: note.content, category: note.category || 'general', images: JSON.stringify(note.images || []) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function persist() {
    if (!sent.current || uploadingRef.current) return false;   // wait for the in-flight photo upload
    const cur = latest.current;
    const imagesJson = JSON.stringify(cur.images);
    const patch = {};
    if (cur.title !== sent.current.title) patch.title = cur.title;
    if (cur.content !== sent.current.content) patch.content = cur.content;
    if (cur.category !== sent.current.category) patch.category = cur.category;
    if (imagesJson !== sent.current.images) patch.images = cur.images;
    if (Object.keys(patch).length === 0) return true;
    const before = sent.current;
    sent.current = { title: cur.title, content: cur.content, category: cur.category, images: imagesJson };
    // if it could not be sent, mark it unsent again so the next save retries it
    Promise.resolve(onUpdate(note.id, { title: cur.title, content: cur.content, category: cur.category, ...(patch.images ? { images: cur.images } : {}) }))
      .then(okSent => { if (okSent === false && sent.current && sent.current.title === cur.title && sent.current.content === cur.content) sent.current = before; })
      .catch(() => { sent.current = before; });
    return true;
  }
  const persistRef = useRef(persist); persistRef.current = persist;

  function saveEdit() {
    if (uploadingRef.current) return;
    persist();
    setEditing(false);
  }

  // Like Keep: nothing typed is lost — saved shortly after you stop typing, and when the page is
  // hidden/closed or you press Back (the editor is full-screen on a phone, there is no "outside" to tap).
  useEffect(() => {
    if (!editing) return undefined;
    const t = setTimeout(() => persistRef.current(), 1500);
    return () => clearTimeout(t);
  }, [editing, title, content, category, images]);
  useEffect(() => {
    if (!editing) return undefined;
    const flush = () => persistRef.current();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', flush);            // the connection came back: send what could not go out
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); window.removeEventListener('online', flush); flush(); };
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) saveEdit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, content, category, images]);

  const isArchived = note.archived;

  // Long-press a row (or use the "เลือก" button) to select several notes; while selecting, a tap toggles.
  function rowDown(e) {
    longFired.current = false;                                   // a long-press whose click never came (Android context menu) must not swallow the next tap
    if (!selection || selection.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { longFired.current = true; press.current = null; setTimeout(() => { longFired.current = false; }, 800); try { navigator.vibrate?.(18); } catch { /* ignore */ } selection.start(note); }, 450) };
  }
  function rowMove(e) { const p = press.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) rowCancel(); }
  function rowCancel() { if (press.current) { clearTimeout(press.current.t); press.current = null; } }
  useEffect(() => rowCancel, []);
  function rowClick() {
    if (longFired.current) { longFired.current = false; return; }
    if (selection?.active) selection.toggle(note); else setEditing(true);
  }

  if (editing) {
    return (
      <EditorOverlay>
        <div className="note-editor-modal note-composer" ref={ref} data-note-id={note.id} style={{ '--tint': colorBg(note.color) }}>
          <NoteEditorPanel
            titleValue={title} onTitle={setTitle} initialContent={note.content || ''} onContent={setContent}
            imgState={imgState} categories={categories} category={category} onCategory={setCategory}
            pinned={!!note.pinned} onPin={() => onUpdate(note.id, { pinned: !note.pinned })}
            archived={!!isArchived} onArchive={() => onUpdate(note.id, { archived: !isArchived })}
            onDelete={() => onDelete(note.id)}
            onConvert={onConvert ? () => { persist(); setConverting('choose'); } : undefined}
            color={note.color || 'default'} onColor={key => onUpdate(note.id, { color: key })}
            onDone={saveEdit} doneDisabled={imgState.uploading > 0} />
        </div>
        {converting === 'choose' && (
          <ConvertChooser from="note" onCancel={() => setConverting(null)} onPick={to => setConverting(to)} />
        )}
        {converting === 'task' && (
          <ConvertToTaskSheet source={noteSource({ ...note, title, content })} onCancel={() => setConverting(null)}
            onConfirm={async payload => { const ok = await onConvert(note, 'task', payload, payload.task_name); if (ok) { setConverting(null); setEditing(false); } }} />
        )}
        {converting === 'event' && (() => {
          const src = noteSource({ ...note, title, content });
          return (
            <ConvertToEventSheet source={{ title: src.name, details: src.details, due: { date: '', time: '' } }}
              heading="📅 เปลี่ยนโน้ตเป็นนัดหมาย" detailsLabel="รายละเอียด (จากเนื้อหาโน้ต)"
              footnote="โน้ตเดิมจะถูกลบหลังสร้างนัด (กด “เลิกทำ” ได้ 6 วินาที) และนัดจะถูกส่งไป Google Calendar"
              onCancel={() => setConverting(null)}
              onConfirm={async payload => { const ok = await onConvert(note, 'event', payload, payload.title); if (ok) { setConverting(null); setEditing(false); } }} />
          );
        })()}
      </EditorOverlay>
    );
  }

  return (
    <div className={`note-row${selection?.ids?.has(note.id) ? ' is-selected' : ''}`} ref={ref} data-note-id={note.id}
      onPointerDown={rowDown} onPointerMove={rowMove} onPointerUp={rowCancel} onPointerCancel={rowCancel} onPointerLeave={rowCancel}
      onContextMenu={e => { if (selection) e.preventDefault(); }}
      onClick={rowClick} role="button" tabIndex={0} aria-pressed={selection?.active ? !!selection.ids.has(note.id) : undefined}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); rowClick(); } }} style={{ opacity: isDragging ? 0.4 : 1 }}>
      {selection?.active
        ? <span className="note-drag-handle is-check" aria-hidden><span className={`note-check${selection.ids.has(note.id) ? ' on' : ''}`}>{selection.ids.has(note.id) ? '✓' : ''}</span></span>   /* same box as the drag handle, so the row does not change size */
        : <span className="note-drag-handle" title="ลากเพื่อสลับตำแหน่ง"
        onPointerDown={e => { e.stopPropagation(); rowCancel(); onHandlePointerDown(e); }} onClick={e => e.stopPropagation()}>⠿</span>}
      <div className="note-row-accent" style={{ background: colorBg(note.color) === 'var(--note-default)' ? 'var(--border-strong)' : colorBg(note.color) }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {note.title && <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title}</div>}
        <div className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {previewText(note.content) || (note.images?.length ? 'รูปภาพ' : 'โน้ตว่างเปล่า')}
        </div>
      </div>
      {note.images?.length > 0 && <span title={`มีรูป ${note.images.length} รูป`} style={{ fontSize: '0.75rem', flex: '0 0 auto' }}>📷{note.images.length}</span>}
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
function DraggableSection({ notes, onUpdate, onDelete, onConvert, onEditingChange, onReorder, onDragStateChange, autoEditId, categories, selection }) {
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
        <NoteCard onConvert={onConvert} selection={selection}
          key={n.id}
          note={n}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEditingChange={onEditingChange}
          isDragging={draggingId === n.id}
          autoEditId={autoEditId}
          categories={categories}
          onHandlePointerDown={(e) => handlePointerDown(e, i)}
        />
      ))}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<main className="page"><ListSkeleton /></main>}>
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

  // NOTE_CATEGORIES is a fixed default list, not read from the
  // database — same underlying gap as expenses' EXPENSE_CATEGORIES
  // (see that page's comment on this exact bug). Deriving the actual
  // dropdown options from the defaults plus whatever categories this
  // user has already used on a note fixes it without a new API call.
  const categoryOptions = (() => {
    const defaults = new Set(NOTE_CATEGORIES.map(c => c.key));
    const used = [...new Set((notes || []).map(n => n.category).filter(Boolean))]
      .filter(cat => !defaults.has(cat));
    return [...NOTE_CATEGORIES, ...used.map(cat => ({ key: cat, label: `🏷️ ${cat}` }))];
  })();

  const toast = useToast();
  const [error, setError] = useState(false);
  const [openSignal, setOpenSignal] = useState(0);

  const stampRef = useRef(null);       // fingerprint of the list on screen (see /api/notes?stamp=1)
  const load = useCallback(async (archived = showArchived) => {
    try {
      const data = await apiGet(`/api/notes?archived=${archived}`);
      setError(false);
      stampRef.current = data.stamp ?? null;
      setNotes(withoutPending(data.notes));
    } catch (e) {
      // A failed background refresh must not wipe notes already on screen.
      if (e.message !== 'unauthorized') setNotes(prev => { if (prev === null) setError(true); return prev; });
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);
  // One-time (per device) clean-up: photos attached before photos became private lose their "anyone with the link" access.
  const privacyRan = useRef(false);
  useEffect(() => {
    if (notes === null || privacyRan.current) return;
    privacyRan.current = true;
    (async () => {
      try {
        if (localStorage.getItem('jarvis-photos-private-v1') === '1') return;
        let offset = 0;
        for (let i = 0; i < 100; i++) {
          const res = await fetch('/api/notes/images/privatize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offset }) });
          if (!res.ok) return;                                    // not connected to Google / offline: try again next visit
          const d = await res.json();
          if (d.done) { if (!d.failed) localStorage.setItem('jarvis-photos-private-v1', '1'); return; }
          offset = d.next;
        }
      } catch { /* try again next visit */ }
    })();
  }, [notes]);
  // ?new=1 (Today's quick-add button, the installed app's "จดโน้ต" shortcut) opens the composer ONCE and
  // is then removed from the address, so reloading / coming back never re-opens it.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setOpenSignal(n => n + 1);
    window.history.replaceState(null, '', '/dashboard');
  }, [searchParams]);

  // Auto-refresh — a note added via the LINE bot shows up here without
  // a manual reload. Paused while the composer or any card is being
  // edited, or a drag is in progress — a poll mid-drag or mid-typing
  // would clobber unsaved local state.
  // Egress: this used to re-download EVERY note (text included) every 8 s. Now it asks for a tiny fingerprint (ids +
  // timestamps only), reloads the list only when that changed, and does nothing while the tab is in the background.
  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      if (composerEditing || editingIds.current.size > 0 || draggingRef.current) return;
      busy = true;
      try {
        const { stamp } = await apiGet(`/api/notes?stamp=1&archived=${showArchived}`);
        if (stampRef.current === null) stampRef.current = stamp;                       // (old server without a stamp) just remember it
        else if (stamp !== stampRef.current) await load();
      } catch { /* offline / signed out: try again next time */ }
      busy = false;
    };
    const timer = setInterval(check, 10000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [load, composerEditing, showArchived]);

  const setCardEditing = useCallback((id, isEditing) => {
    if (isEditing) editingIds.current.add(id); else editingIds.current.delete(id);
  }, []);

  // → the created note (so the composer can keep updating THAT note instead of making another), or null.
  // quiet: an automatic save in the background does not pop up errors on every pause in typing.
  async function createNote({ title, content, category, images, pinned, color }, { quiet = false } = {}) {
    let res;
    try {
      const body = JSON.stringify({ title, content, category, images, pinned, color });
      res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        keepalive: body.length < 60000,           // still delivered if the page is being closed / left (the draft is saved on pagehide)
      });
    } catch { if (!quiet) toast.show('❌ บันทึกไม่สำเร็จ', { tone: 'error' }); return null; }
    if (res.ok) { const d = await res.json().catch(() => ({})); load(); return d.note || null; }
    const data = await res.json().catch(() => ({}));
    if (quiet) return null;
    if (data.error === 'quota_reached') {
      setStatus(`📝 คุณมีโน้ตครบ ${data.limit} รายการแล้วครับ (สูงสุดสำหรับ Free) ลองลบโน้ตเก่าที่ไม่ใช้แล้ว หรืออัปเกรด Premium เพื่อจดได้ไม่จำกัด`);
    } else {
      toast.show('❌ บันทึกไม่สำเร็จ', { tone: 'error' });
    }
    return null;
  }

  // A draft that was already auto-saved and then thrown away (🗑️, or everything deleted): remove that copy too.
  async function discardNote(id) {
    setNotes(prev => prev?.filter(n => n.id !== id));
    try { await fetch(`/api/notes/${id}`, { method: 'DELETE', keepalive: true }); } catch { load(); }
  }

  // → true when the server has it. false when it could not be sent (connection dropped) — the caller keeps the change
  // marked "unsent" so the next save (✓, click-away, the connection coming back) sends it again instead of losing it.
  const offlineToastAt = useRef(0);
  async function updateNote(id, patch) {
    setNotes(prev => prev?.map(n => n.id === id ? { ...n, ...patch } : n));
    const body = JSON.stringify(patch);
    let res;
    try {
      res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
        keepalive: body.length < 60000,
      });
    } catch {
      if (Date.now() - offlineToastAt.current > 20000) { offlineToastAt.current = Date.now(); toast.show('📶 อินเทอร์เน็ตหลุด — ที่แก้ไว้ยังอยู่ในหน้านี้ จะบันทึกให้เมื่อกลับมาออนไลน์ (หรือกด ✓)', { tone: 'warn', duration: 6000 }); }
      return false;
    }
    if (!res.ok) { load(); return false; }
    if ('archived' in patch || 'pinned' in patch) load();
    return true;
  }

  function deleteNote(id) {
    const note = (notes || []).find(n => n.id === id);
    if (!note) return;
    toast.undoableDelete({
      id,
      label: `ลบโน้ต${note.title ? ` “${note.title.slice(0, 24)}”` : ''}แล้ว`,
      remove: () => setNotes(prev => prev?.filter(n => n.id !== id)),
      commit: async () => {
        try {
          const res = await fetch(`/api/notes/${id}`, { method: 'DELETE', keepalive: true });
          if (!res.ok) throw new Error(String(res.status));
        } catch (e) { toast.show('❌ ลบไม่สำเร็จ', { tone: 'error' }); load(); }
      },
      restore: () => setNotes(prev => prev ? [...prev, note].sort((a, b) => (b.pinned - a.pinned) || ((a.sort_order ?? 1e9) - (b.sort_order ?? 1e9))) : prev),
    });
  }

  // Note → task / appointment: create the new item, then remove the note with the usual 6-second undo —
  // undoing brings the note back AND removes what was just created.
  function convertNote(note, toKind, payload, title) {
    return convertItem({
      toast, fromKind: 'note', toKind, item: note, title, payload,
      removeLocal: () => setNotes(prev => prev?.filter(n => n.id !== note.id)),
      restoreLocal: () => setNotes(prev => prev ? [...prev, note].sort((a, b) => (b.pinned - a.pinned) || ((a.sort_order ?? 1e9) - (b.sort_order ?? 1e9))) : prev),
      reload: load,
    });
  }

  // ---- select several notes → download as .md / delete ----
  const [sel, setSel] = useState(null);          // null = normal; Set of ids = select mode
  const [dlOpen, setDlOpen] = useState(false);       // the "download as .md / PDF" dialog
  const [pdfBusy, setPdfBusy] = useState(false);
  const selButton = useRef(false);
  const selection = {
    active: sel !== null, ids: sel,
    start: note => { selButton.current = !note; setSel(new Set(note ? [note.id] : [])); },
    toggle: note => setSel(prev => { const next = new Set(prev); next.has(note.id) ? next.delete(note.id) : next.add(note.id); return next.size === 0 && !selButton.current ? null : next; }),
  };
  const exitSelect = () => { selButton.current = false; setSel(null); setDlOpen(false); };
  useEffect(() => {                                   // Escape: close the download dialog first, then leave select mode
    if (sel === null) return undefined;
    const k = e => { if (e.key !== 'Escape') return; if (dlOpen) setDlOpen(false); else { selButton.current = false; setSel(null); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [sel === null, dlOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
  const chosenNotes = () => filtered.filter(n => sel?.has(n.id));   // only what is on screen: never act on hidden (archived / filtered-out) selections

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function downloadMd(mode) {
    const list = chosenNotes(); if (!list.length) return;
    const enc = new TextEncoder();
    if (list.length === 1) {
      const f = notesToMarkdownFiles(list)[0];
      saveBlob(new Blob([f.text], { type: 'text/markdown;charset=utf-8' }), f.name);
    } else if (mode === 'zip') {
      const files = notesToMarkdownFiles(list).map(f => ({ name: f.name, data: enc.encode(f.text) }));
      saveBlob(new Blob([createZip(files)], { type: 'application/zip' }), `jarvis-notes-${localDay()}.zip`);
    } else {
      saveBlob(new Blob([notesToCombinedMarkdown(list)], { type: 'text/markdown;charset=utf-8' }), `jarvis-notes-${localDay()}.md`);
    }
    toast.show(`⬇️ ดาวน์โหลด ${list.length} โน้ตเป็น Markdown แล้ว`);
    exitSelect();
  }
  // the PDF is drawn here in the browser (pictures placed between rows come out between the rows)
  async function downloadPdf(mode) {
    const list = chosenNotes(); if (!list.length || pdfBusy) return;
    setDlOpen(false); setPdfBusy(true); toast.show('⏳ กำลังสร้าง PDF…');
    try {
      const imageUrl = id => `/api/notes/images/${encodeURIComponent(id)}`;
      if (list.length > 1 && mode === 'zip') {
        const files = [], names = new Map();
        for (const n of list) {
          const base = safeFileName(n.title || String(n.content || '').split('\n').find(l => l.trim()) || 'โน้ต'), k = names.get(base) || 0; names.set(base, k + 1);
          files.push({ name: `${k ? `${base} (${k + 1})` : base}.pdf`, data: await notesToPdf([n], { imageUrl }) });
        }
        saveBlob(new Blob([createZip(files)], { type: 'application/zip' }), `jarvis-notes-pdf-${localDay()}.zip`);
      } else {
        const bytes = await notesToPdf(list, { imageUrl });
        const one = list.length === 1;
        saveBlob(new Blob([bytes], { type: 'application/pdf' }), one ? `${safeFileName(list[0].title || String(list[0].content || '').split('\n').find(l => l.trim()) || 'โน้ต')}.pdf` : `jarvis-notes-${localDay()}.pdf`);
      }
      toast.show(`📕 ดาวน์โหลด ${list.length} โน้ตเป็น PDF แล้ว`);
      exitSelect();
    } catch { toast.show('สร้าง PDF ไม่สำเร็จ ลองอีกครั้งครับ'); } finally { setPdfBusy(false); }
  }
  async function deleteSelected() {
    const ids = chosenNotes().map(n => n.id); if (!ids.length) return;
    if (!confirm(`ลบ ${ids.length} โน้ตใช่ไหมครับ? (ลบแล้วกู้คืนไม่ได้)`)) return;
    const done = [];
    for (let i = 0; i < ids.length; i += 3) {
      await Promise.all(ids.slice(i, i + 3).map(async id => {
        try { const r = await fetch(`/api/notes/${id}`, { method: 'DELETE' }); if (r.ok) done.push(id); } catch { /* counted as failed */ }
      }));
    }
    setNotes(prev => prev?.filter(n => !done.includes(n.id)));
    exitSelect();
    toast.show(done.length === ids.length ? `🗑️ ลบ ${done.length} โน้ตแล้ว` : `ลบได้ ${done.length} จาก ${ids.length} โน้ต — ที่เหลือลบไม่สำเร็จ`, done.length === ids.length ? undefined : { tone: 'error' });
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
  const visibleSelCount = sel ? filtered.filter(n => sel.has(n.id)).length : 0;
  const pinned = filtered.filter(n => n.pinned);
  const others = filtered.filter(n => !n.pinned);

  const grouped = {};
  for (const n of filtered) {
    const key = n.category || 'general';
    (grouped[key] = grouped[key] || []).push(n);
  }

  return (
    <main className="page page-wide">
      <DashNav />
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
            {(notes?.length || 0) > 0 && <button className="glass-btn-outline" style={sel !== null ? { visibility: 'hidden' } : undefined} tabIndex={sel !== null ? -1 : 0} aria-hidden={sel !== null} onClick={() => selection.start(null)}>☑️ เลือก</button>}   {/* hidden, not removed: removing it would re-wrap this row and shift the list under a finger that is still down */}
            <button className="glass-btn-outline" onClick={() => { const v = !showArchived; setShowArchived(v); load(v); }}>
              {showArchived ? '⬅️ กลับไปโน้ตปกติ' : '🗄️ ดูคลังเก็บ'}
            </button>
          </div>

          {sel !== null && (
            <div className="file-selbar" role="toolbar" aria-label="เลือกหลายโน้ต">
              <button type="button" className="fsb-x" onClick={exitSelect} aria-label="ยกเลิกการเลือก">✕</button>
              <b className="fsb-count">เลือก {visibleSelCount}</b>
              <button type="button" className="fsb-btn" onClick={() => setSel(prev => { const next = new Set(prev); const all = filtered.length > 0 && filtered.every(n => next.has(n.id)); filtered.forEach(n => (all ? next.delete(n.id) : next.add(n.id))); return next; })}>{filtered.length > 0 && filtered.every(n => sel.has(n.id)) ? 'ไม่เลือกเลย' : 'ทั้งหมด'}</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="fsb-btn" disabled={!visibleSelCount || pdfBusy} onClick={() => setDlOpen(true)}>{pdfBusy ? '⏳' : '⬇️'} ดาวน์โหลด</button>
              <button type="button" className="fsb-btn danger" disabled={!visibleSelCount} onClick={deleteSelected}>🗑️ ลบ</button>
            </div>
          )}
          {dlOpen && <DownloadSheet count={visibleSelCount} onClose={() => setDlOpen(false)} onPick={(fmt, pack) => (fmt === 'pdf' ? downloadPdf(pack) : downloadMd(pack))} />}

          {!showArchived && <Composer onCreate={createNote} onUpdate={updateNote} onDiscard={discardNote} onEditingChange={setComposerEditing} categories={categoryOptions} openSignal={openSignal} />}

          {error && <ErrorState onRetry={() => { setError(false); load(); }} />}
          {!error && notes === null && <ListSkeleton rows={4} height={72} />}
          {notes?.length === 0 && <p className="text-white-muted">{showArchived ? 'ยังไม่มีโน้ตในคลังเก็บ' : 'ยังไม่มีโน้ตครับ ลองจดดูได้เลย'}</p>}

          {viewMode === 'all' && (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>📌 ปักหมุด</div>
                  <DraggableSection notes={pinned} onUpdate={updateNote} onDelete={deleteNote} onConvert={convertNote} selection={selection} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                    onDragStateChange={(v) => { draggingRef.current = v; }}
                    onReorder={(r, opts) => reorderSection(r, new Set(pinned.map(n => n.id)), opts)} />
                  {others.length > 0 && <div className="text-white-muted" style={{ margin: '1rem 0 0.5rem', fontWeight: 600 }}>อื่นๆ</div>}
                </>
              )}
              <DraggableSection notes={others} onUpdate={updateNote} onDelete={deleteNote} onConvert={convertNote} selection={selection} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(others.map(n => n.id)), opts)} />
            </>
          )}

          {viewMode === 'grouped' && Object.entries(grouped).map(([category, catNotes]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                🏷️ {categoryLabel(category)} <span style={{ opacity: 0.7 }}>({catNotes.length})</span>
              </div>
              <DraggableSection notes={catNotes} onUpdate={updateNote} onDelete={deleteNote} onConvert={convertNote} selection={selection} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(catNotes.map(n => n.id)), opts)} />
            </div>
          ))}
        </>
      {!showArchived && <Fab onClick={() => setOpenSignal(n => n + 1)} label="จดโน้ตใหม่" />}
    </main>
  );
}
