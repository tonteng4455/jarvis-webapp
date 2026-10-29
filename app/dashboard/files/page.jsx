'use client';
// app/dashboard/files/page.jsx — file manager. Files themselves are
// sent to the LINE chat or uploaded here (⬆️ button, or drag files onto the page): the bot stores them in the user's own
// Google Drive, in a "Bot_file" folder (see the bot's uploadToDrive). This page is for uploading, browsing, opening and deleting them.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DashNav } from '../_components';
import { apiGet, ErrorState, ListSkeleton, useRefreshOnReturn, useToast } from '../_ui';

const KIND_ICON = { image: '🖼️', video: '🎬', audio: '🎵', file: '📄' };
// pictures made in a note are PRIVATE files in the person's Drive: they are shown through the app's signed-in proxy, never a public link
const isNote = f => f.source === 'note';
const noteSrc = f => `/api/notes/images/${encodeURIComponent(f.drive_file_id)}`;

// Drive's own thumbnail endpoint works in an <img> for "anyone with the link" files (the old
// uc?export=view address is increasingly refused when hot-linked). Fall back through the stored URL,
// then to the plain icon — a tile never shows a broken-image box.
const DOC_EXT = new Set(['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'TXT', 'CSV', 'RTF', 'ODT']);
const extOf = n => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ''); return m ? m[1].toUpperCase() : ''; };
function driveId(f) {
  if (f.drive_file_id) return f.drive_file_id;
  const m = /\/file\/d\/([^/?#]+)/.exec(f.public_url || '') || /[?&]id=([^&#]+)/.exec(f.public_url || '');
  return m ? m[1] : null;
}
// PDF / Word / Excel / PowerPoint / text / video can be shown by Drive's own viewer.
function isViewable(f) {
  if (!driveId(f)) return false;
  if (f.kind === 'video') return true;
  if (f.kind !== 'file') return false;
  const m = String(f.mime_type || '');
  return DOC_EXT.has(extOf(f.file_name)) || /pdf|msword|officedocument|ms-excel|ms-powerpoint|text\//i.test(m);
}
const viewerUrl = f => `https://drive.google.com/file/d/${encodeURIComponent(driveId(f))}/preview`;

// Drive's own thumbnail endpoint works in an <img> for "anyone with the link" files (the old
// uc?export=view address is increasingly refused when hot-linked); it also renders the first page of
// PDF / Word / Excel / PowerPoint files. Fall back through the stored URL (images only), then to the
// plain icon — a tile never shows a broken-image box.
function previewSources(f, size) {
  const list = [];
  const id = driveId(f);
  if (isNote(f)) { list.push(noteSrc(f)); return list; }
  if (f.kind === 'image') {
    if (id) list.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`);
    if (f.url) list.push(f.url);
  } else if (isViewable(f)) {
    list.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`);
  }
  return list;
}
// Long-press (or the "เลือก" button) starts multi-select; in select mode a tap toggles a tile.
function Tile({ f, selecting, selected, onOpen, onToggle, onStartSelect }) {
  const [failed, setFailed] = useState(false);
  const press = useRef(null);
  const longFired = useRef(false);
  const canPreview = previewSources(f, 300).length > 0 && !failed;

  function down(e) {
    longFired.current = false;                                   // a long-press whose click never came (Android context menu) must not swallow the next tap
    if (selecting || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { longFired.current = true; press.current = null; setTimeout(() => { longFired.current = false; }, 800); try { navigator.vibrate?.(18); } catch { /* ignore */ } onStartSelect(f); }, 450) };
  }
  function move(e) { const p = press.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel(); }
  function cancel() { if (press.current) { clearTimeout(press.current.t); press.current = null; } }
  useEffect(() => cancel, []);

  function click(e) {
    if (longFired.current) { longFired.current = false; e.preventDefault(); return; }   // the long-press itself must not also "tap"
    if (selecting) onToggle(f); else onOpen(f);
  }

  return (
    <button type="button" className={`file-tile${canPreview ? '' : ' is-doc'}${canPreview && f.kind !== 'image' ? ' is-page' : ''}${selected ? ' is-selected' : ''}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onContextMenu={e => { if (selecting || longFired.current || press.current) e.preventDefault(); }} onClick={click} title={f.file_name} aria-label={f.file_name} aria-pressed={selecting ? !!selected : undefined}>
      {canPreview
        ? <FallbackImg f={f} onAllFailed={() => setFailed(true)} />
        : <span className="ft-icon">{KIND_ICON[f.kind] || '📄'}{extOf(f.file_name) && <small>{extOf(f.file_name)}</small>}</span>}
      {canPreview && f.kind !== 'image' && !selecting && <span className="ft-badge">{extOf(f.file_name) || KIND_ICON[f.kind]}</span>}
      {selecting && <span className={`ft-check${selected ? ' on' : ''}`} aria-hidden>{selected ? '✓' : ''}</span>}
      {isNote(f) && !f.note_id && !selecting && <span className="ft-badge lib" title="ไม่ได้อยู่ในโน้ตไหน">🗂️</span>}
      <span className="ft-name">{f.file_name}</span>
    </button>
  );
}

function FallbackImg({ f, onAllFailed }) {
  const [i, setI] = useState(0);
  const list = previewSources(f, 300);
  if (i >= list.length) { queueMicrotask(onAllFailed); return null; }
  return <img src={list[i]} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI(n => n + 1)} />;
}

function PreviewSheet({ f, onClose, onDelete, onSaved }) {
  const [broken, setBroken] = useState(false);
  const stem = n => String(n || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');      // the extension is kept by the server: only the name is edited
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stem(f.file_name));
  const [desc, setDesc] = useState(f.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: desc }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error === 'empty_name' ? 'ชื่อว่างเปล่า' : d.error === 'needs_sql' ? 'ยังบันทึกคำอธิบายไม่ได้ (ผู้ดูแลระบบต้องรัน file_rename.sql ก่อน)' : 'บันทึกไม่สำเร็จ ลองอีกครั้ง'); return; }
      onSaved(d.file, d.driveOk === false); setEditing(false);
    } catch { setErr('บันทึกไม่สำเร็จ ลองอีกครั้ง'); } finally { setSaving(false); }
  }
  const list = previewSources(f, 1000);
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="convert-sheet" role="dialog" aria-label={f.file_name}>
        {isViewable(f)
          ? <iframe src={viewerUrl(f)} title={f.file_name} className="file-viewer" allow="autoplay" referrerPolicy="no-referrer" />
          : f.kind === 'image' && list.length > 0 && !broken
          ? <PreviewChain list={list} onAllFailed={() => setBroken(true)} alt={f.file_name} />
          : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', background: 'var(--surface-muted)', borderRadius: 12 }}>{KIND_ICON[f.kind] || '📄'}</div>}
        {!editing && <div style={{ marginTop: '0.7rem', fontWeight: 600, wordBreak: 'break-all' }}>{f.file_name}</div>}
        {!editing && f.description && <div className="muted" style={{ wordBreak: 'break-word' }}>📝 {f.description}</div>}
        {!editing && f.original_name && f.original_name !== f.file_name && <div className="muted" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>ชื่อเดิม: {f.original_name}</div>}
        {editing && (
          <div className="file-edit" style={{ display: 'grid', gap: '0.4rem', marginTop: '0.7rem' }}>
            <label style={{ fontSize: '0.8rem' }}>ชื่อไฟล์ <small className="muted">(นามสกุลเติมให้เอง)</small>
              <input className="glass-input" data-field="name" value={name} maxLength={100} onChange={e => setName(e.target.value)} style={{ width: '100%', marginTop: 2 }} /></label>
            <label style={{ fontSize: '0.8rem' }}>คำอธิบาย <small className="muted">(ค้นเจอด้วยคำเหล่านี้)</small>
              <textarea className="glass-input" data-field="desc" rows={2} value={desc} maxLength={200} onChange={e => setDesc(e.target.value)} style={{ width: '100%', marginTop: 2, resize: 'vertical' }} /></label>
            {err && <div role="alert" className="note-image-error">{err}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="glass-btn" data-act="save-name" disabled={saving} style={{ flex: 1 }} onClick={save}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
              <button type="button" className="glass-btn-outline" data-act="cancel-edit" disabled={saving} style={{ flex: 1 }} onClick={() => { setEditing(false); setErr(''); setName(stem(f.file_name)); setDesc(f.description || ''); }}>ยกเลิก</button>
            </div>
          </div>
        )}
        <div className="muted">{isNote(f) ? (f.note_title ? `📝 อยู่ในโน้ต “${f.note_title}”` : '🗂️ อยู่ในคลัง ไม่ได้อยู่ในโน้ตไหน') : formatBytes(f.size_bytes)} · {formatDate(f.created_at)}</div>
        {!editing && <button type="button" className="glass-btn-outline" data-act="edit-name" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => setEditing(true)}>✏️ แก้ชื่อ / คำอธิบาย</button>}
        <div className="convert-actions" style={{ justifyContent: 'stretch' }}>
          {isNote(f) && <a href={noteSrc(f)} target="_blank" rel="noopener noreferrer" className="glass-btn-outline" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>🔗 เปิดภาพเต็ม</a>}
          {isNote(f) && f.note_id && <a href={`/dashboard?id=${encodeURIComponent(f.note_id)}`} className="glass-btn-outline" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>📝 เปิดโน้ต</a>}
          {!isNote(f) && f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="glass-btn-outline" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>🔗 เปิดไฟล์เต็ม</a>}
          <button type="button" className="glass-btn-danger" style={{ flex: 1 }} onClick={() => onDelete(f)}>🗑️ {isNote(f) ? 'ลบทิ้ง' : 'ลบ'}</button>
        </div>
        <button type="button" className="glass-btn-outline" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onClose}>ปิด</button>
      </div>
    </div>,
    document.body
  );
}

function PreviewChain({ list, onAllFailed, alt }) {
  const [i, setI] = useState(0);
  if (i >= list.length) { queueMicrotask(onAllFailed); return null; }
  return <img src={list[i]} alt={alt} referrerPolicy="no-referrer" className="file-preview-img" onError={() => setI(n => n + 1)} />;
}


function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return '-'; }
}


// Download = Drive's direct-download address in a hidden frame (the browser saves it, the page stays put).
// One file at a time with a short gap — phones allow several downloads in a row after one "allow" prompt.
const downloadUrl = f => { if (isNote(f)) return noteSrc(f); const id = driveId(f); return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : null; };
function triggerDownload(url, name) {
  if (url.startsWith('/')) { const a = document.createElement('a'); a.href = url; a.download = name || 'image'; document.body.appendChild(a); a.click(); a.remove(); return; }
  const fr = document.createElement('iframe');
  fr.style.display = 'none'; fr.src = url;
  document.body.appendChild(fr);
  setTimeout(() => fr.remove(), 120000);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MAX_UPLOAD = 8 * 1024 * 1024;                       // per file (the server checks again)
const UPLOAD_ERRORS = { too_large: 'ไฟล์ใหญ่เกิน 8 MB', google_not_connected: 'ต้องเชื่อมต่อ Google Drive ก่อน', empty_file: 'ไฟล์ว่างเปล่า', upload_failed: 'อัปโหลดไม่สำเร็จ ลองอีกครั้ง', db_error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', network: 'อินเทอร์เน็ตหลุด ลองอีกครั้ง' };
// one file → POST /api/files, with progress (fetch cannot report upload progress, XMLHttpRequest can)
function sendFile(file, onProgress) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => resolve({ ok: false, error: 'network' });
    xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* ignore */ } resolve(xhr.status >= 200 && xhr.status < 300 && body.file ? { ok: true, file: body.file } : { ok: false, error: body.error || 'upload_failed', connectUrl: body.connectUrl }); };
    const fd = new FormData(); fd.append('file', file, file.name);
    xhr.send(fd);
  });
}

export default function FilesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const toast = useToast();
  const [filterKind, setFilterKind] = useState('all');
  const [filterSrc, setFilterSrc] = useState('all');        // all | note (pictures made in notes) | lib (…that are in no note now) | web (uploaded here) | chat
  const [cols, setCols] = useState(3);
  const [open, setOpen] = useState(null);
  const [sel, setSel] = useState(null);          // null = normal; Set of ids = select mode
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState([]);       // the upload tray: { key, name, size, file, status: 'wait' | 'up' | 'done' | 'err', pct, error, connectUrl }
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');           // search box: words in the name, the first name, the description or the note's title
  const picker = useRef(null);
  const running = useRef(0);
  const queue = useRef([]);

  useEffect(() => { try { const c = parseInt(localStorage.getItem('jarvis-file-cols'), 10); if (c === 3 || c === 4) setCols(c); } catch { /* ignore */ } }, []);
  function chooseCols(c) { setCols(c); try { localStorage.setItem('jarvis-file-cols', String(c)); } catch { /* ignore */ } }

  async function load() {
    setError(false);
    try { setData(await apiGet('/api/files')); }
    catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }

  useEffect(() => { load(); }, []);
  // a link from the LINE bot (?id=<file id>) opens that file straight away
  const wantedId = useRef(null);
  useEffect(() => { try { wantedId.current = new URLSearchParams(window.location.search).get('id'); } catch { /* ignore */ } }, []);
  useEffect(() => {
    if (!data || !wantedId.current) return;
    const f = (data.files || []).find(x => x.id === wantedId.current);
    wantedId.current = null;
    if (f) setOpen(f);
  }, [data]);
  useRefreshOnReturn(load);

  function saved(file, driveFailed) {
    setData(prev => ({ ...prev, files: prev.files.map(x => (x.id === file.id ? { ...x, ...file, note_title: x.note_title } : x)) }));
    setOpen(o => (o && o.id === file.id ? { ...o, ...file, note_title: o.note_title } : o));
    toast.show(driveFailed ? 'เปลี่ยนชื่อในระบบแล้ว แต่ในไฟล์บน Google Drive ไม่สำเร็จ' : '✅ บันทึกแล้ว');
  }
  async function deleteFile(f) {
    if (!confirm(isNote(f) ? 'ลบรูปนี้ไหมครับ? จะย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)' : 'ลบไฟล์นี้ถาวรใช่ไหมครับ? กู้คืนไม่ได้แล้ว')) return;
    const res = await fetch(`/api/files/${f.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.show('❌ ลบไม่สำเร็จ', { tone: 'error' }); return; }
    setData(prev => ({ ...prev, files: prev.files.filter(x => x.id !== f.id) }));
    setOpen(null);
  }

  function startSelect(f) { selectButtonMode.current = !f; setSel(new Set(f ? [f.id] : [])); }
  function toggle(f) {
    setSel(prev => {
      const next = new Set(prev); next.has(f.id) ? next.delete(f.id) : next.add(f.id);
      return next.size === 0 && !selectButtonMode.current ? null : next;
    });
  }
  const selectButtonMode = useRef(false);
  const exitSelect = () => { selectButtonMode.current = false; setSel(null); };

  // ----- uploading (two at a time) -----
  const patchUp = (key, p) => setUploads(list => list.map(u => (u.key === key ? { ...u, ...p } : u)));
  async function runUpload(u) {
    running.current++; patchUp(u.key, { status: 'up', pct: 0, error: '' });
    const r = await sendFile(u.file, pct => patchUp(u.key, { pct }));
    running.current--;
    if (r.ok) {
      patchUp(u.key, { status: 'done', pct: 100 });
      setData(prev => ({ ...(prev || {}), files: [r.file, ...((prev?.files) || [])] }));
      setTimeout(() => setUploads(list => list.filter(x => x.key !== u.key)), 4000);
    } else patchUp(u.key, { status: 'err', error: r.error, connectUrl: r.connectUrl || '' });
    pump();
  }
  function pump() { while (running.current < 2 && queue.current.length) runUpload(queue.current.shift()); }
  function addUploads(fileList) {
    const list = Array.from(fileList || []).filter(f => f && f.name !== undefined);
    if (!list.length) return;
    const made = list.map(f => ({ key: Math.random().toString(36).slice(2), name: f.name, size: f.size, file: f, status: f.size > MAX_UPLOAD || f.size === 0 ? 'err' : 'wait', pct: 0, error: f.size > MAX_UPLOAD ? 'too_large' : f.size === 0 ? 'empty_file' : '' }));
    setUploads(prev => [...prev, ...made]);
    queue.current.push(...made.filter(u => u.status === 'wait'));
    pump();
  }
  function retryUpload(u) { patchUp(u.key, { status: 'wait', error: '' }); queue.current.push({ ...u, status: 'wait' }); pump(); }
  const dropUpload = key => setUploads(list => list.filter(x => x.key !== key));
  useEffect(() => {                                           // drag files onto the page
    let depth = 0;
    const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
    const enter = e => { if (hasFiles(e)) { depth++; setDragging(true); e.preventDefault(); } };
    const over = e => { if (hasFiles(e)) e.preventDefault(); };
    const leave = e => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); } };
    const drop = e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDragging(false); addUploads(e.dataTransfer.files); };
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, []);                                                     // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteSelected() {
    const ids = shown.filter(x => sel?.has(x.id)).map(x => x.id); if (!ids.length || busy) return;
    const hasNote = shown.some(x => sel?.has(x.id) && isNote(x)), hasChat = shown.some(x => sel?.has(x.id) && !isNote(x));
    if (!confirm(`ลบ ${ids.length} ไฟล์ใช่ไหมครับ?${hasNote ? '\nรูปจากโน้ตจะย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)' : ''}${hasChat ? '\nไฟล์จากแชทลบถาวร กู้คืนไม่ได้' : ''}`)) return;
    setBusy(true);
    const done = [];
    for (let i = 0; i < ids.length; i += 3) {
      await Promise.all(ids.slice(i, i + 3).map(async id => {
        try { const r = await fetch(`/api/files/${id}`, { method: 'DELETE' }); if (r.ok) done.push(id); } catch { /* counted as failed */ }
      }));
    }
    setData(prev => ({ ...prev, files: prev.files.filter(x => !done.includes(x.id)) }));
    setBusy(false); exitSelect();
    toast.show(done.length === ids.length ? `🗑️ ลบ ${done.length} ไฟล์แล้ว` : `ลบได้ ${done.length} จาก ${ids.length} ไฟล์ — ที่เหลือลบไม่สำเร็จ`, done.length === ids.length ? undefined : { tone: 'error' });
  }

  async function downloadSelected() {
    const chosen = shown.filter(x => sel?.has(x.id)); if (!chosen.length || busy) return;
    setBusy(true);
    let n = 0, skipped = 0;
    for (const f of chosen) {
      const url = downloadUrl(f);
      if (!url) { skipped++; continue; }
      triggerDownload(url, f.file_name); n++;
      await sleep(900);
    }
    setBusy(false);
    toast.show(n ? `⬇️ สั่งดาวน์โหลด ${n} ไฟล์แล้ว — ดูในแถบแจ้งเตือน/โฟลเดอร์ดาวน์โหลด ถ้าไม่ขึ้น (ไฟล์ใหญ่หรือเบราว์เซอร์บล็อก) ให้แตะไฟล์แล้วกด “เปิดไฟล์เต็ม” แล้วบันทึกเอง${skipped ? ` · ข้าม ${skipped} ไฟล์ที่ไม่มีลิงก์` : ''}` : 'ไฟล์ที่เลือกไม่มีลิงก์ดาวน์โหลด', n ? { duration: 7000 } : { tone: 'error' });
  }

  const files = data?.files || [];
  const srcOk = f => (filterSrc === 'all' ? true : filterSrc === 'note' ? isNote(f) && !!f.note_id : filterSrc === 'lib' ? isNote(f) && !f.note_id : filterSrc === 'web' ? f.source === 'web' : !isNote(f) && f.source !== 'web');
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = f => !words.length || words.every(w => `${f.file_name || ''} ${f.original_name || ''} ${f.description || ''} ${f.note_title || ''}`.toLowerCase().includes(w));
  const shown = files.filter(f => (filterKind === 'all' || f.kind === filterKind) && srcOk(f) && hit(f));
  const srcCounts = { note: files.filter(f => isNote(f) && f.note_id).length, lib: files.filter(f => isNote(f) && !f.note_id).length, web: files.filter(f => f.source === 'web').length, chat: files.filter(f => !isNote(f) && f.source !== 'web').length };
  const visibleSelCount = sel ? shown.filter(x => sel.has(x.id)).length : 0;
  const kindCounts = files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});

  return (
    <main className="page page-wide">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>📁 ไฟล์ของฉัน</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" className="glass-btn" data-act="upload" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => picker.current?.click()}>⬆️ อัปโหลด</button>
        <input ref={picker} type="file" multiple hidden data-testid="upload-input" aria-label="เลือกไฟล์ที่จะอัปโหลด" onChange={e => { addUploads(e.target.files); e.target.value = ''; }} />
        {files.length > 0 && <button type="button" className="glass-btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', ...(sel !== null ? { visibility: 'hidden' } : null) }} tabIndex={sel !== null ? -1 : 0} aria-hidden={sel !== null} onClick={() => { selectButtonMode.current = true; startSelect(null); }}>☑️ เลือก</button>}
        <div className="seg" role="group" aria-label="จำนวนต่อแถว">
          <button type="button" className={cols === 3 ? 'active' : ''} onClick={() => chooseCols(3)} aria-label="3 ต่อแถว">▦ 3</button>
          <button type="button" className={cols === 4 ? 'active' : ''} onClick={() => chooseCols(4)} aria-label="4 ต่อแถว">▦ 4</button>
        </div>
        </div>
      </div>

      {sel !== null && (
        <div className="file-selbar" role="toolbar" aria-label="เลือกหลายไฟล์">
          <button type="button" className="fsb-x" onClick={exitSelect} aria-label="ยกเลิกการเลือก">✕</button>
          <b className="fsb-count">เลือก {visibleSelCount}</b>
          <button type="button" className="fsb-btn" onClick={() => setSel(prev => { const next = new Set(prev); const all = shown.length > 0 && shown.every(x => next.has(x.id)); shown.forEach(x => (all ? next.delete(x.id) : next.add(x.id))); return next; })}>{shown.length > 0 && shown.every(x => sel.has(x.id)) ? 'ไม่เลือกเลย' : 'ทั้งหมด'}</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="fsb-btn" disabled={!visibleSelCount || busy} onClick={downloadSelected}>⬇️ ดาวน์โหลด</button>
          <button type="button" className="fsb-btn danger" disabled={!visibleSelCount || busy} onClick={deleteSelected}>🗑️ ลบ</button>
        </div>
      )}

      {error && <ErrorState onRetry={() => { setData(null); load(); }} />}
      {!error && data === null && <ListSkeleton rows={3} height={110} />}

      {data && (
        <>
          {files.length > 0 && (
            <input type="search" className="glass-input" data-testid="file-search" placeholder="🔎 ค้นหาจากชื่อ / ชื่อเดิม / คำอธิบาย" aria-label="ค้นหาไฟล์" value={query} onChange={e => setQuery(e.target.value)} style={{ width: '100%', marginBottom: '0.6rem' }} />
          )}
          {(srcCounts.note + srcCounts.lib + srcCounts.web > 0) && (
            <div className="dash-nav" style={{ margin: '0 0 0.6rem' }} role="group" aria-label="แหล่งที่มา">
              {[['all', 'ทุกที่', files.length], ['note', '📝 รูปในโน้ต', srcCounts.note], ['lib', '🗂️ คลัง (ไม่อยู่ในโน้ตไหน)', srcCounts.lib], ['web', '⬆️ อัปโหลดจากเว็บ', srcCounts.web], ['chat', '💬 จากแชท', srcCounts.chat]].map(([k, l, n]) => (
                <span key={k} className={`dash-nav-item${filterSrc === k ? ' active' : ''}`} data-src={k} style={{ cursor: 'pointer' }} onClick={() => setFilterSrc(k)}>{l} {n}</span>
              ))}
            </div>
          )}
          <div className="dash-nav" style={{ margin: '0 0 1rem' }}>
            <span className={`dash-nav-item${filterKind === 'all' ? ' active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilterKind('all')}>
              ทั้งหมด {files.length}
            </span>
            {Object.entries(kindCounts).map(([kind, count]) => (
              <span key={kind} className={`dash-nav-item${filterKind === kind ? ' active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilterKind(kind)}>
                {KIND_ICON[kind] || '📄'} {count}
              </span>
            ))}
          </div>

          {shown.length === 0 && <div className="glass-card"><p className="muted">{words.length || filterKind !== 'all' || filterSrc !== 'all' ? 'ไม่พบไฟล์ที่ตรงกับที่ค้น/กรองไว้ครับ' : 'ยังไม่มีไฟล์ครับ กด “⬆️ อัปโหลด” (หรือลากไฟล์มาวางในหน้านี้) หรือส่งรูป/ไฟล์เข้าแชทกับ Jarvis ได้เลย'}</p></div>}

          <div className="file-grid" style={{ '--cols': cols, '--cols-wide': cols + 2 }}>
            {shown.map(f => <Tile key={f.id} f={f} selecting={sel !== null} selected={!!sel?.has(f.id)} onOpen={setOpen} onToggle={toggle} onStartSelect={startSelect} />)}
          </div>
        </>
      )}
      {dragging && <div className="upload-drop" aria-hidden="true">⬆️ วางไฟล์ที่นี่เพื่ออัปโหลด<small>ไฟล์ละไม่เกิน 8 MB</small></div>}
      {uploads.length > 0 && (
        <div className="upload-tray" role="status" aria-label="กำลังอัปโหลด">
          {uploads.map(u => (
            <div key={u.key} className={`upload-row ${u.status}`} data-status={u.status}>
              <div className="up-name" title={u.name}>{u.status === 'done' ? '✅' : u.status === 'err' ? '⚠️' : '⬆️'} {u.name} <small>{formatBytes(u.size)}</small></div>
              {(u.status === 'up' || u.status === 'wait') && <div className="up-bar"><span style={{ width: `${u.pct}%` }} /></div>}
              {u.status === 'wait' && <div className="up-msg">รอคิว…</div>}
              {u.status === 'up' && <div className="up-msg">{u.pct}%</div>}
              {u.status === 'err' && (
                <div className="up-msg err">
                  {UPLOAD_ERRORS[u.error] || UPLOAD_ERRORS.upload_failed}
                  {u.error === 'google_not_connected' && u.connectUrl && <> · <a href={u.connectUrl} target="_blank" rel="noopener noreferrer">🔗 เชื่อมต่อ Google Drive</a></>}
                  {u.error !== 'too_large' && u.error !== 'empty_file' && <button type="button" className="up-btn" data-act="retry" onClick={() => retryUpload(u)}>ลองอีกครั้ง</button>}
                  <button type="button" className="up-btn" data-act="drop" onClick={() => dropUpload(u.key)}>ปิด</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open && <PreviewSheet key={open.id + ':' + (open.file_name || '') + ':' + (open.description || '')} f={open} onClose={() => setOpen(null)} onDelete={deleteFile} onSaved={saved} />}
    </main>
  );
}
