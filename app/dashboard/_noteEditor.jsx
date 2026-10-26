'use client';
// app/dashboard/_noteEditor.jsx — the note editing surface shared by "new note" and "edit note".
//
//  ┌ toolbar (sticky, always visible) ───────────────────────────────┐
//  │ 📷 รูป  📌 ปักหมุด  🗄️ เก็บ  🗑️ ลบ        ⇤ ⇥ ย่อหน้า     ✓ เสร็จสิ้น │
//  ├─────────────────────────────────────────────────────────────────┤
//  │ photos · title · BODY (text + bullet / checkbox / numbered rows) │
//  ├─────────────────────────────────────────────────────────────────┤
//  │ หมวดหมู่ ▾   🎨 สี   📤 แชร์                                      │
//  └─────────────────────────────────────────────────────────────────┘
//
// The body works like Google Keep: type "- " for a bullet, "[] " for a checkbox, "1. " for a
// numbered row; Enter continues the list, Enter on an empty row ends it; Tab / ⇥ indents.
// The saved text stays plain ("- item", "[ ] item", "1. item") — see lib/noteBlocks.js.

import { useState, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { MAX_NOTE_IMAGES } from '../../lib/noteImages';
import { CategorySelect } from './_components';
import { shareText, useToast } from './_ui';
import SketchEditor from './_sketch';
import {
  parseContent, serializeBlocks, numbering, setText, enterInText, enterInList, backspaceAtStart,
  indentBlock, toggleCheck, pasteInto, rowInfo, appendRow, doneLayout, moveSubtree, subtreeEnd, cycleList, LIST_CYCLE,
  normalizeRange, wholeRange, rangeText, deleteRange,
} from '../../lib/noteBlocks';

// Locks the page behind a full-screen editor so scrolling a long note
// can't "chain" through to the note list underneath. overflow:hidden on
// <body> alone isn't enough on mobile Safari/Chrome (touch scrolling
// still moves the page once the inner panel hits its end), so this pins
// the body with position:fixed at the current scroll offset and puts it
// back exactly where it was on close.
export function useBodyScrollLock() {
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
export function EditorOverlay({ children }) {
  useBodyScrollLock();
  const ref = useRef(null);
  // iOS Safari keeps the layout viewport full height when the keyboard opens, hiding the bottom
  // of a fixed panel behind it. Following the visual viewport keeps the whole editor (and the
  // line being typed) above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport, el = ref.current;
    if (!vv || !el) return undefined;
    const fit = () => { el.style.height = `${vv.height}px`; el.style.transform = `translateY(${vv.offsetTop}px)`; };
    fit();
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, []);
  return <div className="note-editor-overlay" ref={ref}>{children}</div>;
}

export const COLORS = [
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
export const colorBg = key => `var(--note-${key || 'default'})`;

// ---------- Images in notes ----------
// Photos are stored in the user's own Google Drive (uploaded through the
// bot Worker) — a note only keeps {drive_file_id, name} references, so
// nothing image-sized ever touches Supabase. Removing an image from a
// note (or deleting the note) only drops the reference; the file stays
// in the user's Drive folder on purpose.
// Note photos and drawings are PRIVATE in the owner's Drive — they are shown through the signed-in proxy (never a public link).
function driveImageSrc(id) {
  return `/api/notes/images/${encodeURIComponent(id)}`;
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
export function useNoteImages(initial, scope = 'note') {
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

  // ----- hand-drawn pictures -----
  const [sketch, setSketch] = useState(null);                // null | { image } (image = null for a new one)
  const openSketch = image => {
    if (!image && imagesRef.current.length >= MAX_NOTE_IMAGES) { setError(`แนบรูปได้สูงสุด ${MAX_NOTE_IMAGES} รูปต่อโน้ต`); return; }
    setError(''); setSketch({ image: image || null });
  };
  // an old drawing's file is removed a little AFTER the note has saved the new one (so a failed save never leaves a broken picture)
  const trashLater = id => { setTimeout(() => { fetch(`/api/notes/images/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true }).catch(() => {}); }, 12000); };
  async function saveSketch(blob, replaceId) {
    setError(''); setConnectUrl('');
    try {
      const form = new FormData();
      form.append('file', new File([blob], 'sketch.png', { type: 'image/png' })); form.append('kind', 'sketch');
      const res = await fetch('/api/notes/images', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.image) {
        setImages(prev => replaceId ? prev.map(im => im.drive_file_id === replaceId ? data.image : im) : [...prev, data.image]);
        if (replaceId) trashLater(replaceId);
        setSketch(null);
        return true;
      }
      if (data.error === 'google_not_connected') {
        setConnectUrl(data.connectUrl || '');
        setError('ต้องเชื่อมต่อ Google Drive ก่อนถึงจะเก็บลายมือได้ครับ');
        setSketch(null);        // the drawing is still backed up on this device; reopen it after connecting
      }
      return false;
    } catch { return false; }
  }

  function removeImage(id) {
    const gone = imagesRef.current.find(im => im.drive_file_id === id);
    setImages(prev => prev.filter(im => im.drive_file_id !== id));
    if (gone?.kind === 'sketch') trashLater(id);           // a drawing is only a file of ours; a photo stays in Drive on purpose
  }
  return { images, setImages, uploading, uploadingRef, error, connectUrl, addFiles, removeImage, sketch, setSketch, openSketch, saveSketch, scope };
}

function ImageThumb({ image, onOpen, onRemove }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`note-image-thumb${image.kind === 'sketch' ? ' is-sketch' : ''}`} onClick={() => onOpen(image)}>
      {image.kind === 'sketch' && <span className="note-image-badge" title="ลายมือ — แตะเพื่อแก้ไข">✏️</span>}
      {failed ? (
        <span className="note-image-fail" title="โหลดรูปไม่ได้">🖼️</span>
      ) : (
        <img src={driveImageSrc(image.drive_file_id)} alt={image.kind === 'sketch' ? 'ลายมือในโน้ต' : (image.name || 'รูปในโน้ต')}
          loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      )}
      <button type="button" className="note-image-remove" title="เอารูปออกจากโน้ต"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onRemove(image.drive_file_id); }}>✕</button>
    </div>
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
const CARET_MARGIN_TOP = 72; // clears the sticky toolbar

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
  // The visible bottom is the scroller's bottom OR where the on-screen keyboard starts, whichever is higher.
  const vv = window.visualViewport;
  const visibleBottom = Math.min(sRect.bottom, vv ? vv.offsetTop + vv.height : Infinity);
  const caretTopAbs = tRect.top + top;
  const caretBottomAbs = caretTopAbs + height;
  if (caretBottomAbs + CARET_MARGIN_BOTTOM > visibleBottom) {
    scroller.scrollTop += caretBottomAbs + CARET_MARGIN_BOTTOM - visibleBottom;
  } else if (caretTopAbs < sRect.top + CARET_MARGIN_TOP) {
    scroller.scrollTop -= sRect.top + CARET_MARGIN_TOP - caretTopAbs;
  }
}



// ---------- photos: the add button lives in the toolbar, the thumbnails sit under it ----------
export function NoteImageButton({ state }) {
  const { images, addFiles } = state;
  const inputRef = useRef(null);
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      <ToolBtn title={`เพิ่มรูป (${images.length}/${MAX_NOTE_IMAGES})`} disabled={images.length >= MAX_NOTE_IMAGES}
        onClick={() => inputRef.current?.click()}>
        📷{images.length > 0 && <span className="ne-badge">{images.length}</span>}
      </ToolBtn>
      <ToolBtn title="เขียน/วาดด้วยมือ" disabled={images.length >= MAX_NOTE_IMAGES} onClick={() => state.openSketch(null)}>✏️</ToolBtn>
    </>
  );
}

// Thumbnails (one scrollable row), upload errors, and the full-size viewer.
export function NoteImageStrip({ state }) {
  const { images, uploading, error, connectUrl, removeImage, sketch } = state;
  const [viewing, setViewing] = useState(null);
  return (
    <>
      {sketch && (
        <SketchEditor key={sketch.image?.drive_file_id || 'new'} imageUrl={sketch.image ? driveImageSrc(sketch.image.drive_file_id) : null}
          draftKey={`${state.scope}:${sketch.image?.drive_file_id || 'new'}`}
          onSave={blob => state.saveSketch(blob, sketch.image?.drive_file_id || null)} onCancel={() => state.setSketch(null)} />
      )}
      {(images.length > 0 || uploading > 0) && (
        <div className="note-image-strip">
          {images.map(im => (
            <ImageThumb key={im.drive_file_id} image={im} onOpen={i => (i.kind === 'sketch' ? state.openSketch(i) : setViewing(i))} onRemove={removeImage} />
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
      {viewing && createPortal(
        // Portal to <body>: the editor modal has a backdrop-filter, which would turn this
        // position:fixed viewer into "fixed inside the modal" and clip it. mousedown must not reach
        // the document-level click-outside handler, or tapping the viewer would save and close.
        <div className="note-lightbox" onMouseDown={e => e.stopPropagation()} onClick={() => setViewing(null)}>
          <img src={driveImageSrc(viewing.drive_file_id)} alt={viewing.name || 'รูปในโน้ต'} referrerPolicy="no-referrer" />
          <button type="button" className="note-lightbox-close" title="ปิด">✕</button>
        </div>,
        document.body
      )}
    </>
  );
}

// A toolbar button that never steals the caret from the text (so the on-screen keyboard stays up).
export function ToolBtn({ title, onClick, disabled, active, children, className = '' }) {
  return (
    <button type="button" className={`ne-btn${active ? ' on' : ''} ${className}`} title={title} aria-label={title} disabled={disabled}
      onPointerDown={e => e.preventDefault()} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
      onClick={onClick}>
      {children}
    </button>
  );
}

// ---------- the body: text paragraphs + list rows ----------
// Each textarea carries an invisible "sentinel" character at its start. A phone keyboard sends no
// event for Backspace at the very start of an empty box, but deleting the sentinel IS an input
// event — that is how "Backspace removes the bullet / joins the row above" works on every device.
const ZW = '​';
const stripZw = s => s.replace(/​/g, '');

function fitHeight(el) {
  const sc = el.closest('.note-editor-modal');
  const top = sc ? sc.scrollTop : 0;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  if (sc) sc.scrollTop = top;        // resizing must never make the panel jump
}

function RowText({ b, hl, placeholder, reg, onInput, onFocusRow, onKey, onPasteRow, onCopyCut }) {
  const ref = useRef(null);
  useLayoutEffect(() => { reg(b.id, ref.current); return () => reg(b.id, null); }, [b.id, reg]);
  useLayoutEffect(() => { if (ref.current) fitHeight(ref.current); }, [b.text]);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fitHeight(el); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const checkedStyle = b.type === 'check' && b.checked;
  return (
    <div className="kl-cell">
      {hl && <div className="kl-hl" aria-hidden>{ZW}{b.text.slice(0, hl[0])}<mark>{b.text.slice(hl[0], hl[1])}</mark>{b.text.slice(hl[1])}{'\n'}</div>}
      <textarea ref={ref} data-bid={b.id} rows={1} value={ZW + b.text}
        className={`kl-text${checkedStyle ? ' done' : ''}`} enterKeyHint="enter" spellCheck={false}
        onChange={e => onInput(e, b)} onFocus={() => onFocusRow(b.id)} onKeyDown={e => onKey(e, b)}
        onPaste={e => onPasteRow(e, b)} onCopy={onCopyCut} onCut={onCopyCut}
        onSelect={e => { const t = e.target; if (t.selectionStart === 0 && t.selectionEnd === 0 && t.value.startsWith(ZW)) t.setSelectionRange(1, 1); }} />
      {b.text === '' && placeholder && <span className="kl-ph" aria-hidden>{placeholder}</span>}
    </div>
  );
}

const BULLETS = ['•', '◦', '▪', '•', '◦'];
const LIST_GLYPH = { text: '☰', num: '1.', bullet: '•', check: '☑' };
const LIST_LABEL = { text: 'ข้อความ', num: 'เลขข้อ', bullet: 'จุด', check: 'ช่องติ๊ก' };

export const BlockEditor = forwardRef(function BlockEditor({ initial, onChange, onActive, placeholder = 'พิมพ์โน้ต...', autoFocus }, ref) {
  const [blocks, setBlocks] = useState(() => parseContent(initial));
  const blocksRef = useRef(blocks);
  // A selection across several rows (the rows are separate text boxes, so the browser can't do it): { a: {id,pos}, f: {id,pos} } — see lib/noteBlocks.js
  const [range, setRangeState] = useState(null);
  const rangeRef = useRef(null);
  const setRange = useCallback(r => { rangeRef.current = r; setRangeState(r); }, []);
  const noClick = useRef(false);                           // the click that ends a drag across rows must not count as a tap on the empty area
  const mouseSel = useRef(null);                          // a mouse drag that started inside a row
  const [hideDone, setHideDone] = useState(false);       // the "รายการที่ทำแล้ว" group is folded
  const [drag, setDrag] = useState(null);                // { id, i, j, dy, target } while a row is being dragged
  const dragRef = useRef(null);
  // Own undo/redo (the boxes are controlled, so the browser's native undo can't be trusted).
  const hist = useRef(null);
  if (!hist.current) hist.current = { list: [blocks], idx: 0, last: null };
  const els = useRef(new Map());
  const activeId = useRef(null);
  const rootRef = useRef(null);
  const reg = useCallback((id, el) => { if (el) els.current.set(id, el); else els.current.delete(id); }, []);

  const report = useCallback(() => {
    const h = hist.current;
    onActive?.({ ...rowInfo(blocksRef.current, activeId.current), canUndo: h.idx > 0, canRedo: h.idx < h.list.length - 1 });
  }, [onActive]);

  const focusAt = useCallback((id, pos) => {
    const el = els.current.get(id); if (!el) return;
    el.focus({ preventScroll: true });
    const p = Math.min(pos + 1, el.value.length);         // +1: the sentinel
    el.setSelectionRange(p, p);
    activeId.current = id;
    keepCaretVisible(el);
  }, []);

  // Apply an operation's result: render NOW (so the new row exists and can take focus inside the
  // same user gesture — that is what keeps the phone keyboard open), tell the parent, move the caret.
  const record = useCallback((blocks, typingId) => {
    const h = hist.current; const now = Date.now();
    if (serializeBlocks(h.list[h.idx]) === serializeBlocks(blocks)) return;
    h.list.length = h.idx + 1;
    if (typingId && h.last && h.last.key === typingId && now - h.last.t < 1200) h.list[h.idx] = blocks;   // one undo step per burst of typing
    else { h.list.push(blocks); if (h.list.length > 101) h.list.shift(); h.idx = h.list.length - 1; }
    h.last = { key: typingId || null, t: now };
  }, []);

  const commit = useCallback((res, keepFocusId, typingId) => {
    if (!res) return false;
    if (rangeRef.current) setRange(null);
    record(res.blocks, res.focus ? null : typingId);
    blocksRef.current = res.blocks;
    flushSync(() => setBlocks(res.blocks));
    onChange(serializeBlocks(res.blocks));
    if (res.focus) focusAt(res.focus.id, res.focus.pos);
    else if (keepFocusId) { const el = els.current.get(keepFocusId); if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }
    report();
    return true;
  }, [onChange, focusAt, report, record, setRange]);

  const jump = useCallback((delta) => {
    const h = hist.current; const ni = h.idx + delta;
    if (ni < 0 || ni >= h.list.length) return;
    const prev = blocksRef.current; h.idx = ni; h.last = null;
    const next = h.list[ni];
    blocksRef.current = next;
    flushSync(() => setBlocks(next));
    onChange(serializeBlocks(next));
    // put the caret where the change happened
    let k = 0; while (k < next.length && k < prev.length && next[k].id === prev[k].id && next[k].text === prev[k].text && next[k].type === prev[k].type && next[k].indent === prev[k].indent && next[k].checked === prev[k].checked) k++;
    const t = next[Math.min(k, next.length - 1)]; if (t) focusAt(t.id, t.text.length);
    setRange(null); report();
  }, [onChange, focusAt, report, setRange]);

  useImperativeHandle(ref, () => ({
    focusStart() { const f = blocksRef.current[0]; if (f) focusAt(f.id, 0); },
    cycle() {
      const cur = blocksRef.current;
      let id = activeId.current;
      if (!id || !cur.some(x => x.id === id)) id = cur[cur.length - 1]?.id;
      if (!id) return;
      const el = els.current.get(id);
      const caret = el ? Math.max(0, el.selectionStart - 1) : (cur.find(x => x.id === id)?.text.length || 0);
      commit(cycleList(cur, id, caret), id);
    },
    undo() { jump(-1); },
    redo() { jump(1); },
    indent(delta) {
      const id = activeId.current; if (!id) return;
      const el = els.current.get(id); const s = el?.selectionStart, e2 = el?.selectionEnd;
      if (commit(indentBlock(blocksRef.current, id, delta), id) && el) { try { el.setSelectionRange(s, e2); } catch { /* ignore */ } }
    },
  }), [commit, jump, focusAt]);

  useEffect(() => { if (autoFocus) { const first = blocksRef.current[0]; if (first) focusAt(first.id, first.text.length); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { report(); }, [report]);

  // Enter (and Backspace-at-start on keyboards that report it) arrive as `beforeinput` on every platform.
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const onBefore = (e) => {
      const ta = e.target;
      if (!(ta instanceof HTMLTextAreaElement) || !ta.dataset.bid || e.isComposing) return;
      const id = ta.dataset.bid;
      const sp = rangeRef.current ? normalizeRange(blocksRef.current, rangeRef.current) : null;
      if (sp && e.inputType === 'insertText' && e.data) { e.preventDefault(); replaceRange(sp, e.data); return; }          // typing over a selection that spans rows (also from a keyboard that sends no key events)
      if (sp && e.inputType.startsWith('delete')) { e.preventDefault(); replaceRange(sp, ''); return; }
      if (e.inputType === 'historyUndo') { e.preventDefault(); jump(-1); return; }
      if (e.inputType === 'historyRedo') { e.preventDefault(); jump(1); return; }
      if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
      const cur = blocksRef.current;
      const b = cur.find(x => x.id === id); if (!b) return;
      const dom = ta.value;
      const selStart = Math.max(0, ta.selectionStart - 1), selEnd = Math.max(0, ta.selectionEnd - 1);
      const text = stripZw(dom);
      let res = null;
      if (b.type === 'text') {
        if (selStart === selEnd) res = enterInText(cur, id, text, selStart);
      } else {
        const tmp = cur.map(x => (x.id === id ? { ...x, text: text.slice(0, selStart) + text.slice(selEnd) } : x));
        res = enterInList(tmp, id, selStart);
      }
      if (res) { e.preventDefault(); commit(res); }
    };
    root.addEventListener('beforeinput', onBefore);
    return () => root.removeEventListener('beforeinput', onBefore);
  }, [commit, jump]);

  function onInput(e, b) {
    const el = e.target;
    if (rangeRef.current) setRange(null);
    let dom = el.value;
    const textBefore = b.text;
    if (!dom.startsWith(ZW)) {
      // The sentinel is gone: either Backspace at the very start (text unchanged), or something was typed before it.
      if (dom === textBefore && el.selectionStart === 0) {
        el.value = ZW + textBefore; el.setSelectionRange(1, 1);
        if (commit(backspaceAtStart(blocksRef.current, b.id))) return;
        return;
      }
    }
    let caret = el.selectionStart;
    const zwBeforeCaret = (dom.slice(0, caret).match(/​/g) || []).length;
    let text = stripZw(dom);
    caret = Math.max(0, caret - zwBeforeCaret);

    // A phone keyboard that skipped `beforeinput`: Enter arrived as a "\n" inside a list row.
    if (b.type !== 'text' && text.includes('\n')) {
      const at = text.indexOf('\n');
      const joined = text.slice(0, at) + text.slice(at + 1).replace(/\n/g, ' ');
      const tmp = blocksRef.current.map(x => (x.id === b.id ? { ...x, text: joined } : x));
      commit(enterInList(tmp, b.id, at)); return;
    }
    const res = setText(blocksRef.current, b.id, text, caret);
    commit(res, b.id, b.id);
    if (!res?.focus) { if (el.value !== ZW + text) { el.value = ZW + text; el.setSelectionRange(caret + 1, caret + 1); } keepCaretVisible(el); }
  }

  function onKey(e, b) {
    const el = e.target;
    const cur = blocksRef.current;
    const i = cur.findIndex(x => x.id === b.id);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.nativeEvent.isComposing) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); jump(e.shiftKey ? 1 : -1); return; }
      if (k === 'y') { e.preventDefault(); jump(1); return; }
      if (k === 'a') {
        // a note with several rows: select the whole note at once; one text box: the browser's own select-all
        if (cur.length > 1) { e.preventDefault(); setRange(wholeRange(cur)); focusAt(cur[cur.length - 1].id, cur[cur.length - 1].text.length); }
        return;
      }
    }
    const span = rangeRef.current ? normalizeRange(cur, rangeRef.current) : null;
    if (rangeRef.current && !span) setRange(null);
    if (span && !e.nativeEvent.isComposing && rangeKey(e, span, b)) return;
    if (e.shiftKey && !mod && !e.nativeEvent.isComposing && startRange(e, el, b, i)) return;
    if (e.key === 'Tab' && b.type !== 'text') {
      e.preventDefault();
      const s = el.selectionStart, e2 = el.selectionEnd;
      if (commit(indentBlock(cur, b.id, e.shiftKey ? -1 : 1), b.id)) { try { el.setSelectionRange(s, e2); } catch { /* ignore */ } }
      return;
    }
    if (e.nativeEvent.isComposing) return;
    // Arrow keys move between rows when the caret is already at the edge of this one
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && !e.shiftKey && el.selectionStart <= 1 && el.selectionEnd <= 1 && i > 0) {
      e.preventDefault(); const p = cur[i - 1]; focusAt(p.id, p.text.length); return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && !e.shiftKey && el.selectionStart === el.value.length && i < cur.length - 1) {
      e.preventDefault(); focusAt(cur[i + 1].id, 0); return;
    }
    if (e.key === 'Home' && !e.shiftKey) { /* keep the caret after the sentinel */ requestAnimationFrame(() => { if (el.selectionStart === 0) el.setSelectionRange(1, 1); }); }
  }

  // ----- a selection across rows -----
  function nativeSelect(id, a, f) {                           // an ordinary selection inside one row
    const t = els.current.get(id); if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(Math.min(a, f) + 1, Math.max(a, f) + 1, f < a ? 'backward' : 'forward');
    activeId.current = id;
  }
  function setFocusEnd(f) {                                   // move the moving end of the selection to f ({id,pos})
    const rg = rangeRef.current; if (!rg) return;
    if (f.id === rg.a.id) { setRange(null); nativeSelect(f.id, rg.a.pos, f.pos); return; }
    setRange({ a: rg.a, f }); focusAt(f.id, f.pos);
  }
  function replaceRange(span, insert) {
    const res = deleteRange(blocksRef.current, span, insert);
    setRange(null); commit(res);
    if (insert && res.focus) hist.current.last = { key: res.focus.id, t: Date.now() };          // what is typed next joins this undo step
  }
  // Shift+arrow at the edge of a row: the selection grows into the next / previous row
  function startRange(e, el, b, i) {
    const cur = blocksRef.current, k = e.key;
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(k)) return false;
    const s0 = Math.max(0, el.selectionStart - 1), e0 = Math.max(0, el.selectionEnd - 1), collapsed = s0 === e0, dir = el.selectionDirection;
    const atEnd = (collapsed || dir !== 'backward') && e0 >= b.text.length, atStart = (collapsed || dir === 'backward') && s0 === 0;
    if ((k === 'ArrowDown' || k === 'ArrowRight') && atEnd && i < cur.length - 1) {
      e.preventDefault(); const nx = cur[i + 1];
      setRange({ a: { id: b.id, pos: s0 }, f: { id: nx.id, pos: k === 'ArrowRight' ? 0 : Math.min(e0, nx.text.length) } });
      focusAt(nx.id, k === 'ArrowRight' ? 0 : Math.min(e0, nx.text.length)); return true;
    }
    if ((k === 'ArrowUp' || k === 'ArrowLeft') && atStart && i > 0) {
      e.preventDefault(); const pv = cur[i - 1], pos = k === 'ArrowLeft' ? pv.text.length : Math.min(s0, pv.text.length);
      setRange({ a: { id: b.id, pos: e0 }, f: { id: pv.id, pos } }); focusAt(pv.id, pos); return true;
    }
    return false;
  }
  // keys while several rows are selected; true = handled
  function rangeKey(e, span, b) {
    const cur = blocksRef.current, rg = rangeRef.current, k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod) return false;                                     // copy / cut / paste arrive as their own events
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) {
      e.preventDefault();
      if (!e.shiftKey) {                                       // the selection collapses to one of its ends
        const toStart = k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Home';
        const r = cur[toStart ? span.i0 : span.i1]; setRange(null); focusAt(r.id, toStart ? span.p0 : span.p1); return true;
      }
      const fi = cur.findIndex(x => x.id === rg.f.id), row = cur[fi], fp = Math.min(rg.f.pos, row.text.length);
      let ni = fi, np = fp;
      if (k === 'ArrowRight') { if (fp < row.text.length) np = fp + 1; else if (fi < cur.length - 1) { ni = fi + 1; np = 0; } }
      else if (k === 'ArrowLeft') { if (fp > 0) np = fp - 1; else if (fi > 0) { ni = fi - 1; np = cur[ni].text.length; } }
      else if (k === 'ArrowDown') { if (fi < cur.length - 1) { ni = fi + 1; np = Math.min(fp, cur[ni].text.length); } else np = row.text.length; }
      else if (k === 'ArrowUp') { if (fi > 0) { ni = fi - 1; np = Math.min(fp, cur[ni].text.length); } else np = 0; }
      else if (k === 'Home') np = 0; else np = row.text.length;
      const f = { id: cur[ni].id, pos: np };
      if (f.id === rg.a.id && f.pos === rg.a.pos) { setRange(null); focusAt(f.id, f.pos); return true; }
      setFocusEnd(f); return true;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); const f = rg.f; setRange(null); focusAt(f.id, f.pos); return true; }
    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); replaceRange(span, ''); return true; }
    if (k === 'Enter') {
      e.preventDefault();
      const first = cur[span.i0];
      if (first.type === 'text') replaceRange(span, '\n');
      else { const res = deleteRange(cur, span, ''); setRange(null); commit(res); const r2 = enterInList(blocksRef.current, res.focus.id, res.focus.pos); if (r2) commit(r2); }
      return true;
    }
    if (k.length === 1) { e.preventDefault(); replaceRange(span, k); return true; }       // typing replaces the selection
    if (k === 'Shift' || k === 'Control' || k === 'Meta' || k === 'Alt' || k === 'CapsLock') return true;
    setRange(null); return false;
  }

  function onPasteRow(e, b) {
    const pasted = e.clipboardData?.getData('text') || '';
    const span = rangeRef.current ? normalizeRange(blocksRef.current, rangeRef.current) : null;
    if (span) {                                              // pasting over a selection that spans rows
      e.preventDefault(); const text = stripZw(pasted);
      if (!text.includes('\n')) { replaceRange(span, text); return; }
      const res = deleteRange(blocksRef.current, span, ''); setRange(null); commit(res);
      const r2 = pasteInto(blocksRef.current, res.focus.id, res.focus.pos, res.focus.pos, text); if (r2) commit(r2);
      return;
    }
    if (!pasted.includes('\n')) return;                     // one line → the browser's own paste
    const el = e.target;
    const s = Math.max(0, el.selectionStart - 1), en = Math.max(0, el.selectionEnd - 1);
    const res = pasteInto(blocksRef.current, b.id, s, en, stripZw(pasted));
    if (res) { e.preventDefault(); commit(res); }
  }

  // Never put the invisible sentinel on the clipboard.
  function onCopyCut(e) {
    const el = e.target;
    const span = rangeRef.current ? normalizeRange(blocksRef.current, rangeRef.current) : null;
    if (span) {                                              // the selection that spans rows, as plain text
      e.clipboardData.setData('text/plain', rangeText(blocksRef.current, span));
      e.preventDefault();
      if (e.type === 'cut') replaceRange(span, '');
      return;
    }
    const sel = stripZw(el.value.slice(el.selectionStart, el.selectionEnd));
    if (!sel) return;
    e.clipboardData.setData('text/plain', sel);
    e.preventDefault();
    if (e.type === 'cut') { try { document.execCommand('delete'); } catch { /* ignore */ } }
  }

  // ----- mouse: Shift+click and drag across rows -----
  const rowAtY = y => {                                      // the row (index) under a height on screen; above / below the note → first / last
    const rows = rootRef.current ? [...rootRef.current.querySelectorAll('[data-ri]')] : []; if (!rows.length) return -1;
    let best = Number(rows[0].dataset.ri), bd = Infinity;
    for (const r of rows) { const rc = r.getBoundingClientRect(), d = y < rc.top ? rc.top - y : y > rc.bottom ? y - rc.bottom : 0; if (d < bd) { bd = d; best = Number(r.dataset.ri); } if (d === 0) break; }
    return best;
  };
  // where in a row's text a pointer is (exact on a single line; wrapped rows: start or end by which half)
  const posAtPoint = (b, x, y, down) => {
    const t = els.current.get(b.id); if (!t) return down ? b.text.length : 0;
    const rc = t.getBoundingClientRect(), cs = getComputedStyle(t), lh = parseFloat(cs.lineHeight) || 24;
    if (!b.text) return 0;
    if (t.scrollHeight > lh * 1.5 + 4 || b.text.includes('\n')) return y > rc.top + rc.height / 2 ? b.text.length : 0;
    const ctx = (posAtPoint.cv = posAtPoint.cv || document.createElement('canvas')).getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const dx = x - rc.left; if (dx <= 0) return 0;
    let lo = 0, hi = b.text.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(b.text.slice(0, m)).width <= dx) lo = m; else hi = m - 1; }
    return lo < b.text.length && ctx.measureText(b.text.slice(0, lo + 1)).width - dx < dx - ctx.measureText(b.text.slice(0, lo)).width ? lo + 1 : lo;
  };
  function onRootMouseDown(e) {
    if (e.button !== 0) return;
    const ta = e.target instanceof Element ? e.target.closest('textarea[data-bid]') : null;
    if (e.shiftKey && ta && activeId.current && ta.dataset.bid !== activeId.current) {      // Shift+click on another row
      const cur = blocksRef.current, a = rangeRef.current ? rangeRef.current.a : { id: activeId.current, pos: Math.max(0, (els.current.get(activeId.current)?.selectionStart ?? 1) - 1) };
      const id = ta.dataset.bid;
      requestAnimationFrame(() => {
        const b = cur.find(x => x.id === id); if (!b) return;
        const pos = Math.min(b.text.length, Math.max(0, ta.selectionStart - 1));
        setRange({ a, f: { id, pos } }); focusAt(id, pos);
      });
      return;
    }
    if (rangeRef.current && !e.shiftKey) setRange(null);
    mouseSel.current = ta && !e.shiftKey ? { id: ta.dataset.bid, anchor: null } : null;
  }
  useEffect(() => {
    const move = e => {
      const m = mouseSel.current; if (!m) return;
      if (e.buttons !== 1) { mouseSel.current = null; return; }
      const cur = blocksRef.current, ai = cur.findIndex(x => x.id === m.id); if (ai < 0) { mouseSel.current = null; return; }
      const sc = rootRef.current?.closest('.note-editor-modal');
      if (sc) { const r = sc.getBoundingClientRect(); if (e.clientY < r.top + 36) sc.scrollTop -= 14; else if (e.clientY > r.bottom - 36) sc.scrollTop += 14; }
      const ti = rowAtY(e.clientY); if (ti < 0) return;
      if (ti === ai) { if (m.anchor !== null) { m.anchor = null; setRange(null); } return; }          // back in the first row: the browser's own selection again
      const down = ti > ai, at = els.current.get(m.id);
      if (m.anchor === null) {                                                                          // the browser's selection in the first row tells where the drag began
        if (!at) return;
        m.anchor = Math.max(0, (down ? at.selectionStart : at.selectionEnd) - 1);
      }
      const tb = cur[ti], pos = posAtPoint(tb, e.clientX, e.clientY, down);
      const rg = { a: { id: m.id, pos: Math.min(m.anchor, cur[ai].text.length) }, f: { id: tb.id, pos } };
      const old = rangeRef.current;
      if (old && old.f.id === rg.f.id && old.f.pos === rg.f.pos) return;
      if (at) { try { at.setSelectionRange(rg.a.pos + 1, rg.a.pos + 1); } catch { /* ignore */ } }
      rangeRef.current = rg; setRangeState(rg);
    };
    const up = () => {
      const m = mouseSel.current; mouseSel.current = null;
      if (m && rangeRef.current) { const f = rangeRef.current.f; focusAt(f.id, f.pos); noClick.current = true; setTimeout(() => { noClick.current = false; }, 0); }                // keys carry on from where the drag ended
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [focusAt, setRange]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping the empty area under the last row: carry on where the note ends (one more list row after a list).
  function onBackgroundClick(e) {
    if (e.target !== e.currentTarget || noClick.current) return;
    commit(appendRow(blocksRef.current));
  }

  // ----- drag & drop of list rows (⋮⋮ handle) -----
  function startDrag(e, b) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const cur = blocksRef.current;
    const i = cur.findIndex(x => x.id === b.id); if (i < 0) return;
    const j = subtreeEnd(cur, i);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { id: b.id, i, j, y0: e.clientY, y: e.clientY, target: null };
    setDrag({ id: b.id, i, j, dy: 0, target: null });
  }
  function dropTarget(d, y) {
    const rows = rootRef.current ? [...rootRef.current.querySelectorAll('[data-ri]')] : [];
    let t = blocksRef.current.length;
    for (const r of rows) {
      const k = Number(r.dataset.ri);
      if (k >= d.i && k < d.j) continue;
      const rect = r.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { t = k; break; }
    }
    return t >= d.i && t <= d.j ? null : t;                 // dropping where it already is = no move
  }
  function moveDrag(e) {
    const d = dragRef.current; if (!d) return;
    d.y = e.clientY; d.target = dropTarget(d, e.clientY);
    setDrag({ id: d.id, i: d.i, j: d.j, dy: e.clientY - d.y0, target: d.target });
  }
  function endDrag(e, cancel) {
    const d = dragRef.current; dragRef.current = null; setDrag(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d || cancel || d.target == null) return;
    commit(moveSubtree(blocksRef.current, d.id, d.target));
  }
  // scroll the panel while a row is held near its top / bottom edge
  useEffect(() => {
    if (!drag) return;
    const sc = rootRef.current?.closest('.note-editor-modal'); if (!sc) return;
    let raf = 0;
    const tick = () => {
      const d = dragRef.current; if (!d) return;
      const r = sc.getBoundingClientRect();
      if (d.y < r.top + 90) sc.scrollTop -= 10; else if (d.y > r.bottom - 90) sc.scrollTop += 10;
      d.target = dropTarget(d, d.y);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const span = range ? normalizeRange(blocks, range) : null;
  const nums = numbering(blocks);
  const { header, done } = doneLayout(blocks);
  const onlyEmptyText = blocks.length === 1 && blocks[0].type === 'text' && blocks[0].text === '';
  const dropLine = <div key="drop" className="kl-drop" />;
  return (
    <div className={`kl-root${drag ? ' dragging' : ''}`} ref={rootRef} onClick={onBackgroundClick} onMouseDown={onRootMouseDown}
      onBlur={e => { if (rangeRef.current && document.hasFocus() && !(e.relatedTarget && rootRef.current?.contains(e.relatedTarget))) setRange(null); }}>
      {blocks.map((b, i) => {
        const marker = b.type === 'bullet'
          ? <span className="kl-mark kl-bullet">{BULLETS[b.indent % BULLETS.length]}</span>
          : b.type === 'check'
            ? (
              <button type="button" role="checkbox" aria-checked={b.checked} aria-label="ทำเสร็จแล้ว" className={`kl-mark kl-check${b.checked ? ' on' : ''}`}
                onPointerDown={e => e.preventDefault()} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => commit(toggleCheck(blocksRef.current, b.id), activeId.current)}>{b.checked ? '✓' : ''}</button>
            )
            : b.type === 'num' ? <span className="kl-mark kl-num">{nums[i]}.</span> : null;
        const inDrag = drag && i >= drag.i && i < drag.j;
        const hidden = hideDone && done[i] && !inDrag;
        return (
          <div key={b.id} style={{ display: 'contents' }}>
            {drag && drag.target === i && dropLine}
            {header[i] > 0 && (
              <button type="button" className="kl-done-head" aria-expanded={!hideDone}
                onPointerDown={e => e.preventDefault()} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={e => { e.stopPropagation(); setHideDone(v => !v); }}>
                <span className="kl-done-caret">{hideDone ? '▸' : '▾'}</span> รายการที่ทำแล้ว <span className="kl-done-n">{header[i]}</span>
              </button>
            )}
            {!hidden && (
              <div data-ri={i} className={`kl-row kl-r-${b.type}${inDrag ? ' lifted' : ''}${span && i >= span.i0 && i <= span.i1 ? ' insel' : ''}`}
                style={{ ...(b.type === 'text' ? null : { paddingLeft: `${b.indent * 1.5}rem` }), ...(inDrag ? { transform: `translateY(${drag.dy}px)` } : null) }}
                onClick={e => { if (e.target === e.currentTarget) { e.stopPropagation(); focusAt(b.id, b.text.length); } }}>
                {marker}
                <RowText b={b} reg={reg} hl={span && i >= span.i0 && i <= span.i1 ? [i === span.i0 ? span.p0 : 0, i === span.i1 ? span.p1 : b.text.length] : null}
                  placeholder={onlyEmptyText ? placeholder : (b.type !== 'text' && b.text === '' ? 'รายการ' : '')}
                  onInput={onInput} onKey={onKey} onPasteRow={onPasteRow} onCopyCut={onCopyCut}
                  onFocusRow={id => { activeId.current = id; report(); }} />
                {b.type !== 'text' && (
                  <span className="kl-handle" title="ลากเพื่อย้าย" aria-label="ลากเพื่อย้ายแถว" role="button"
                    onPointerDown={e => startDrag(e, b)} onPointerMove={moveDrag}
                    onPointerUp={e => endDrag(e, false)} onPointerCancel={e => endDrag(e, true)}
                    onClick={e => e.stopPropagation()}>⋮⋮</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {drag && drag.target === blocks.length && dropLine}
    </div>
  );
});

// ---------- the whole editor panel ----------
export function NoteEditorPanel({
  titleValue, onTitle, initialContent, onContent, imgState, categories, category, onCategory,
  pinned, onPin, archived, onArchive, onDelete, onDone, doneDisabled, onColor, color, shareTitle, isNew, editorKey, onConvert,
}) {
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [info, setInfo] = useState({ list: false, canIndent: false, canOutdent: false });
  const bodyRef = useRef(null);
  const contentRef = useRef(initialContent || '');
  const handleChange = useCallback(v => { contentRef.current = v; onContent(v); }, [onContent]);

  return (
    <>
      <div className="ne-toolbar" role="toolbar" aria-label="เครื่องมือโน้ต">
        <NoteImageButton state={imgState} />
        <ToolBtn title={pinned ? 'เลิกปักหมุด' : 'ปักหมุด'} onClick={onPin} active={pinned}>{pinned ? '📌' : '📍'}</ToolBtn>
        {onArchive && <ToolBtn title={archived ? 'ย้ายกลับไปโน้ตปกติ' : 'เก็บเข้าคลัง'} onClick={onArchive}>{archived ? '↩️' : '🗄️'}</ToolBtn>}
        {onDelete && <ToolBtn title={isNew ? 'ทิ้งร่างนี้' : 'ลบ (เลิกทำได้)'} onClick={onDelete}>🗑️</ToolBtn>}
        <span className="ne-spacer" />
        <ToolBtn title={`รายการ: กดเพื่อสลับ เลขข้อ → จุด → ช่องติ๊ก → ข้อความ (ตอนนี้: ${LIST_LABEL[info.type] || 'ข้อความ'})`} active={info.list} className="ne-list" onClick={() => bodyRef.current?.cycle()}>{LIST_GLYPH[info.type] || '☰'}</ToolBtn>
        <ToolBtn title="ลดย่อหน้า" disabled={!info.canOutdent} onClick={() => bodyRef.current?.indent(-1)}>⇤</ToolBtn>
        <ToolBtn title="เพิ่มย่อหน้า" disabled={!info.canIndent} onClick={() => bodyRef.current?.indent(1)}>⇥</ToolBtn>
        <ToolBtn title="เสร็จสิ้น" className="ne-done" disabled={doneDisabled} onClick={onDone}>✓</ToolBtn>
      </div>

      <NoteImageStrip state={imgState} />
      <input className="note-title-input" placeholder="หัวข้อ" value={titleValue} onChange={e => onTitle(e.target.value)} autoFocus={isNew}
        enterKeyHint="next" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); bodyRef.current?.focusStart(); } }} />
      <BlockEditor key={editorKey} ref={bodyRef} initial={initialContent} onChange={handleChange} onActive={setInfo} />

      <div className="ne-bottom" onMouseDown={e => e.stopPropagation()}>
        <div className="ne-cat"><CategorySelect options={categories} value={category} onChange={onCategory} /></div>
        <ToolBtn className="ne-push" title="เลิกทำ (Ctrl+Z)" disabled={!info.canUndo} onClick={() => bodyRef.current?.undo()}>↶</ToolBtn>
        <ToolBtn title="ทำซ้ำ (Ctrl+Shift+Z)" disabled={!info.canRedo} onClick={() => bodyRef.current?.redo()}>↷</ToolBtn>
        {onConvert && <ToolBtn title="เปลี่ยนโน้ตนี้เป็นงานหรือนัดหมาย" onClick={onConvert}>🔄</ToolBtn>}
        <ToolBtn title="สี" onClick={() => setPickerOpen(v => !v)} active={pickerOpen}>🎨</ToolBtn>
        <ToolBtn title="แชร์/คัดลอกข้อความ" onClick={() => shareText({ title: titleValue, text: contentRef.current }, toast)}>📤</ToolBtn>
      </div>
      {pickerOpen && (
        <div className="note-swatch-row">
          {COLORS.map(c => (
            <span key={c.key} title={c.label} role="button" aria-label={c.label}
              className={`note-swatch${color === c.key ? ' active' : ''}`} style={{ background: colorBg(c.key) }}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { onColor(c.key); setPickerOpen(false); }} />
          ))}
        </div>
      )}
    </>
  );
}
