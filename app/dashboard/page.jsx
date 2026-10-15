'use client';
// app/dashboard/page.jsx — Google Keep-style notes (now the dashboard's landing page).
//
// Everything auto-saves — no explicit "Save" required for most actions,
// but title/content edits wait until you click "เสร็จสิ้น" or click
// away before hitting the network (local state only until then).

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { DashNav, CategorySelect, NOTE_CATEGORIES } from './_components';
import { MAX_NOTE_IMAGES } from '../../lib/noteImages';
import { apiGet, ErrorState, Fab, ListSkeleton, shareText, useToast, withoutPending } from './_ui';

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

// Locks the page behind a full-screen editor so scrolling a long note
// can't "chain" through to the note list underneath. overflow:hidden on
// <body> alone isn't enough on mobile Safari/Chrome (touch scrolling
// still moves the page once the inner panel hits its end), so this pins
// the body with position:fixed at the current scroll offset and puts it
// back exactly where it was on close.
function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

// Shared backdrop for both the new-note composer and the edit modal.
function EditorOverlay({ children }) {
  useBodyScrollLock();
  return <div className="note-editor-overlay">{children}</div>;
}

// ---------- Images in notes ----------
// Photos are stored in the user's own Google Drive (uploaded through the
// bot Worker) — a note only keeps {drive_file_id, name} references, so
// nothing image-sized ever touches Supabase. Removing an image from a
// note (or deleting the note) only drops the reference; the file stays
// in the user's Drive folder on purpose.
function driveImageSrc(id, width) {
  // Test-only: with the mock backend the photos live in memory, not Drive.
  if (process.env.NEXT_PUBLIC_MOCK_MODE === '1') return `/api/dev/drive-image/${encodeURIComponent(id)}`;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
}

// Downscale a photo in the browser before uploading (phone photos are
// often 3–8 MB; ~1600px JPEG is plenty for a note and ~10x smaller).
// Falls back to the original file if the browser can't decode it.
async function shrinkImage(file, maxEdge = 1600, quality = 0.82) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG transparency → white instead of black in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Shared by the composer and the edit modal: owns the images list for
// ONE open editor plus the upload state. `uploadingRef` lets the
// click-outside handlers refuse to close the editor mid-upload (which
// would orphan the file just uploaded).
function useNoteImages(initial) {
  const [images, setImages] = useState(initial || []);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [connectUrl, setConnectUrl] = useState('');
  const uploadingRef = useRef(false);
  const imagesRef = useRef(images);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { uploadingRef.current = uploading > 0; }, [uploading]);

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setError('');
    setConnectUrl('');
    const room = MAX_NOTE_IMAGES - imagesRef.current.length;
    if (room <= 0) { setError(`แนบรูปได้สูงสุด ${MAX_NOTE_IMAGES} รูปต่อโน้ต`); return; }
    if (files.length > room) setError(`แนบรูปได้สูงสุด ${MAX_NOTE_IMAGES} รูปต่อโน้ต — ใส่ให้ ${room} รูปแรก`);
    uploadingRef.current = true;
    for (const original of files.slice(0, room)) {
      setUploading(n => n + 1);
      try {
        const file = await shrinkImage(original);
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await fetch('/api/notes/images', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.image) {
          setImages(prev => [...prev, data.image]);
        } else if (data.error === 'google_not_connected') {
          setConnectUrl(data.connectUrl || '');
          setError(data.connectUrl
            ? 'ต้องเชื่อมต่อ Google Drive ก่อนถึงจะแนบรูปได้ครับ'
            : 'ต้องเชื่อมต่อ Google Drive ก่อนถึงจะแนบรูปได้ — พิมพ์ "เชื่อมต่อ google" ในแชท LINE แล้วลองใหม่ครับ');
        } else if (data.error === 'too_large') {
          setError('รูปใหญ่เกินไป ลองรูปที่เล็กลงครับ');
        } else {
          setError('อัปโหลดรูปไม่สำเร็จ ลองอีกครั้งครับ');
        }
      } catch {
        setError('อัปโหลดรูปไม่สำเร็จ ลองอีกครั้งครับ');
      } finally {
        setUploading(n => n - 1);
      }
    }
  }

  function removeImage(id) { setImages(prev => prev.filter(im => im.drive_file_id !== id)); }
  return { images, setImages, uploading, uploadingRef, error, connectUrl, addFiles, removeImage };
}

function ImageThumb({ image, onOpen, onRemove }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="note-image-thumb" onClick={() => onOpen(image)}>
      {failed ? (
        <span className="note-image-fail" title="โหลดรูปไม่ได้">🖼️</span>
      ) : (
        <img src={driveImageSrc(image.drive_file_id, 400)} alt={image.name || 'รูปในโน้ต'}
          loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      )}
      <button type="button" className="note-image-remove" title="เอารูปออกจากโน้ต"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onRemove(image.drive_file_id); }}>✕</button>
    </div>
  );
}

// Image row + "add photo" button + full-size viewer (see the portal
// note below on why the viewer is not a plain child).
function NoteImagesEditor({ state }) {
  const { images, uploading, error, connectUrl, addFiles, removeImage } = state;
  const [viewing, setViewing] = useState(null);
  const inputRef = useRef(null);
  return (
    <>
      {(images.length > 0 || uploading > 0) && (
        <div className="note-image-strip">
          {images.map(im => (
            <ImageThumb key={im.drive_file_id} image={im} onOpen={setViewing} onRemove={removeImage} />
          ))}
          {uploading > 0 && <div className="note-image-thumb note-image-loading">⏳</div>}
        </div>
      )}
      {error && (
        <div className="note-image-error">
          {error}
          {connectUrl && (
            <> <a href={connectUrl} target="_blank" rel="noopener noreferrer"
              onMouseDown={e => e.stopPropagation()} style={{ fontWeight: 600, textDecoration: 'underline' }}>🔗 เชื่อมต่อ Google Drive</a></>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      <button type="button" className="glass-btn-outline note-add-image-btn"
        disabled={images.length >= MAX_NOTE_IMAGES}
        onMouseDown={e => e.stopPropagation()}
        onClick={() => inputRef.current?.click()}>
        📷 เพิ่มรูป{images.length > 0 ? ` (${images.length}/${MAX_NOTE_IMAGES})` : ''}
      </button>
      {viewing && createPortal(
        // Portal to <body>: the editor modal has a backdrop-filter, which
        // would turn this position:fixed viewer into "fixed inside the
        // modal" and clip it. mousedown must not reach the document-level
        // click-outside handler (the portal is outside the modal's DOM),
        // or tapping the viewer would save and close the editor.
        <div className="note-lightbox" onMouseDown={e => e.stopPropagation()} onClick={() => setViewing(null)}>
          <img src={driveImageSrc(viewing.drive_file_id, 1600)} alt={viewing.name || 'รูปในโน้ต'} referrerPolicy="no-referrer" />
          <button type="button" className="note-lightbox-close" title="ปิด">✕</button>
        </div>,
        document.body
      )}
    </>
  );
}

// Textarea that grows to fit its content — no scrollbar, no cramped box.
// The surrounding editor panel is what scrolls, so two things have to be
// handled by hand:
//  1. Resizing (height:auto → scrollHeight) momentarily collapses the
//     panel's scrollable height; the browser clamps scrollTop and the
//     view jumps to the middle of the note. We save/restore scrollTop
//     around the resize.
//  2. The line being typed must stay in view with some breathing room
//     below it (esp. on the last line), so after each change we measure
//     the caret's position and scroll the panel just enough.
const CARET_MARGIN_BOTTOM = 96; // px of free space kept under the caret line
const CARET_MARGIN_TOP = 24;

function caretTop(ta) {
  // Mirror the textarea's text/wrapping in an off-screen div and read
  // where a marker at the caret lands (textareas don't expose caret
  // coordinates). Returns { top, height } relative to the textarea.
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing',
    'textTransform', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'boxSizing', 'tabSize']) {
    mirror.style[prop] = cs[prop];
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.width = `${ta.clientWidth}px`;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = ta.value.slice(0, ta.selectionEnd);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineH = parseFloat(cs.lineHeight) || marker.offsetHeight || 20;
  const top = marker.offsetTop;
  mirror.remove();
  return { top, height: lineH };
}

function keepCaretVisible(ta) {
  const scroller = ta.closest('.note-editor-modal');
  if (!scroller || document.activeElement !== ta) return;
  const { top, height } = caretTop(ta);
  const sRect = scroller.getBoundingClientRect();
  const tRect = ta.getBoundingClientRect();
  const caretTopInView = tRect.top - sRect.top + top;          // relative to scroller's visible box
  const caretBottomInView = caretTopInView + height;
  if (caretBottomInView + CARET_MARGIN_BOTTOM > scroller.clientHeight) {
    scroller.scrollTop += caretBottomInView + CARET_MARGIN_BOTTOM - scroller.clientHeight;
  } else if (caretTopInView < CARET_MARGIN_TOP) {
    scroller.scrollTop -= CARET_MARGIN_TOP - caretTopInView;
  }
}

function AutoGrowTextarea({ value, onChange, placeholder, autoFocus, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    const scroller = ta.closest('.note-editor-modal');
    const saved = scroller ? scroller.scrollTop : 0;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    if (scroller) scroller.scrollTop = saved;
    keepCaretVisible(ta);
  }, [value]);
  return (
    <textarea ref={ref} className={className} placeholder={placeholder} value={value}
      onChange={onChange} autoFocus={autoFocus} rows={1} style={{ overflow: 'hidden' }}
      // Arrow keys / clicks move the caret without changing the value.
      onKeyUp={e => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) keepCaretVisible(e.currentTarget); }}
      onClick={e => keepCaretVisible(e.currentTarget)} />
  );
}

// --- New-note composer: click to expand, auto-grows, has a category
// picker, and only saves when you click "เสร็จสิ้น" or click away. ---
function Composer({ onCreate, onEditingChange, categories, openSignal }) {
  const [open, setOpen] = useState(false);
  // The mobile "+" button (and ?new=1) bump openSignal to open this.
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const imgState = useNoteImages([]);
  const { images, setImages, uploadingRef } = imgState;
  const ref = useRef(null);

  useEffect(() => { onEditingChange(open); }, [open, onEditingChange]);

  async function commit() {
    if (uploadingRef.current) return; // wait for the in-flight photo upload
    if (!title.trim() && !content.trim() && images.length === 0) { setOpen(false); return; }
    await onCreate({ title, content, category, images });
    setTitle(''); setContent(''); setCategory('general'); setImages([]); setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) commit();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, content, category, images]);

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
      <div className="note-editor-modal note-composer" ref={ref}>
        <input className="note-title-input" placeholder="หัวข้อ" value={title}
          onChange={e => setTitle(e.target.value)} autoFocus />
        <AutoGrowTextarea className="note-content-textarea" placeholder="พิมพ์โน้ต..." value={content}
          onChange={e => setContent(e.target.value)} />
        <NoteImagesEditor state={imgState} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.5rem' }}>
          <div style={{ flex: 1, maxWidth: 180 }} onMouseDown={e => e.stopPropagation()}>
            <CategorySelect options={categories} value={category} onChange={setCategory} />
          </div>
          <button onClick={commit} disabled={imgState.uploading > 0} className="glass-btn" style={{ padding: '0.35rem 0.9rem', fontSize: '0.78rem', flex: '0 0 auto' }}>เสร็จสิ้น</button>
        </div>
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
function NoteCard({ note, onUpdate, onDelete, onEditingChange, onHandlePointerDown, isDragging, autoEditId, categories }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category || 'general');
  const [pickerOpen, setPickerOpen] = useState(false);
  const imgState = useNoteImages(note.images || []);
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

  function saveEdit() {
    if (uploadingRef.current) return; // wait for the in-flight photo upload
    setEditing(false);
    const imagesChanged = JSON.stringify(images) !== JSON.stringify(note.images || []);
    if (title !== note.title || content !== note.content || category !== note.category || imagesChanged) {
      onUpdate(note.id, { title, content, category, ...(imagesChanged ? { images } : {}) });
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
  }, [editing, title, content, category, images]);

  const isArchived = note.archived;

  if (editing) {
    return (
      <EditorOverlay>
        <div className="note-editor-modal note-composer" ref={ref} data-note-id={note.id}>
          <input className="note-title-input" placeholder="หัวข้อ" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <AutoGrowTextarea className="note-content-textarea" placeholder="พิมพ์โน้ต..." value={content} onChange={e => setContent(e.target.value)} />
          <NoteImagesEditor state={imgState} />
          <div style={{ marginTop: '0.5rem', maxWidth: 220 }} onMouseDown={e => e.stopPropagation()}>
            <CategorySelect options={categories} value={category} onChange={setCategory} />
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
            <button className="note-icon-btn" title="แชร์/คัดลอกข้อความ" onMouseDown={e => e.stopPropagation()}
              onClick={() => shareText({ title, text: content }, toast)}>📤</button>
            <button className="note-icon-btn" title="ลบ (เลิกทำได้)" onMouseDown={e => e.stopPropagation()}
              onClick={() => onDelete(note.id)}>🗑️</button>
            <button onClick={saveEdit} disabled={imgState.uploading > 0} className="glass-btn" style={{ marginLeft: 'auto', padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}>เสร็จสิ้น</button>
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
      </EditorOverlay>
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
          {note.content || (note.images?.length ? 'รูปภาพ' : 'โน้ตว่างเปล่า')}
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
function DraggableSection({ notes, onUpdate, onDelete, onEditingChange, onReorder, onDragStateChange, autoEditId, categories }) {
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

  const load = useCallback(async (archived = showArchived) => {
    try {
      const data = await apiGet(`/api/notes?archived=${archived}`);
      setError(false);
      setNotes(withoutPending(data.notes));
    } catch (e) {
      // A failed background refresh must not wipe notes already on screen.
      if (e.message !== 'unauthorized') setNotes(prev => { if (prev === null) setError(true); return prev; });
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (searchParams.get('new') === '1') setOpenSignal(n => n + 1); }, [searchParams]);

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

  async function createNote({ title, content, category, images }) {
    const res = await fetch('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category, images }),
    });
    if (res.ok) { load(); return; }
    const data = await res.json().catch(() => ({}));
    if (data.error === 'quota_reached') {
      setStatus(`📝 คุณมีโน้ตครบ ${data.limit} รายการแล้วครับ (สูงสุดสำหรับ Free) ลองลบโน้ตเก่าที่ไม่ใช้แล้ว หรืออัปเกรด Premium เพื่อจดได้ไม่จำกัด`);
    } else {
      toast.show('❌ บันทึกไม่สำเร็จ', { tone: 'error' });
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
            <button className="glass-btn-outline" onClick={() => { const v = !showArchived; setShowArchived(v); load(v); }}>
              {showArchived ? '⬅️ กลับไปโน้ตปกติ' : '🗄️ ดูคลังเก็บ'}
            </button>
          </div>

          {!showArchived && <Composer onCreate={createNote} onEditingChange={setComposerEditing} categories={categoryOptions} openSignal={openSignal} />}

          {error && <ErrorState onRetry={() => { setError(false); load(); }} />}
          {!error && notes === null && <ListSkeleton rows={4} height={72} />}
          {notes?.length === 0 && <p className="text-white-muted">{showArchived ? 'ยังไม่มีโน้ตในคลังเก็บ' : 'ยังไม่มีโน้ตครับ ลองจดดูได้เลย'}</p>}

          {viewMode === 'all' && (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>📌 ปักหมุด</div>
                  <DraggableSection notes={pinned} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                    onDragStateChange={(v) => { draggingRef.current = v; }}
                    onReorder={(r, opts) => reorderSection(r, new Set(pinned.map(n => n.id)), opts)} />
                  {others.length > 0 && <div className="text-white-muted" style={{ margin: '1rem 0 0.5rem', fontWeight: 600 }}>อื่นๆ</div>}
                </>
              )}
              <DraggableSection notes={others} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(others.map(n => n.id)), opts)} />
            </>
          )}

          {viewMode === 'grouped' && Object.entries(grouped).map(([category, catNotes]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <div className="text-white-muted" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                🏷️ {categoryLabel(category)} <span style={{ opacity: 0.7 }}>({catNotes.length})</span>
              </div>
              <DraggableSection notes={catNotes} onUpdate={updateNote} onDelete={deleteNote} onEditingChange={setCardEditing} autoEditId={autoEditId} categories={categoryOptions}
                onDragStateChange={(v) => { draggingRef.current = v; }}
                onReorder={(r, opts) => reorderSection(r, new Set(catNotes.map(n => n.id)), opts)} />
            </div>
          ))}
        </>
      {!showArchived && <Fab onClick={() => setOpenSignal(n => n + 1)} label="จดโน้ตใหม่" />}
    </main>
  );
}
