'use client';
// app/dashboard/files/page.jsx — file manager. Files themselves are
// uploaded from LINE chat (the bot stores them in the user's own
// Google Drive, in a "Bot_file" folder — see the bot's uploadToDrive);
// this page is for browsing, opening, and deleting what's already
// there — no upload button here, matching how notes/calendar/etc. are
// also created via the bot and only edited/managed here.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DashNav } from '../_components';
import { apiGet, ErrorState, ListSkeleton, useToast } from '../_ui';

const KIND_ICON = { image: '🖼️', video: '🎬', audio: '🎵', file: '📄' };

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

function PreviewSheet({ f, onClose, onDelete }) {
  const [broken, setBroken] = useState(false);
  const list = previewSources(f, 1000);
  return createPortal(
    <div className="convert-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="convert-sheet" role="dialog" aria-label={f.file_name}>
        {isViewable(f)
          ? <iframe src={viewerUrl(f)} title={f.file_name} className="file-viewer" allow="autoplay" referrerPolicy="no-referrer" />
          : f.kind === 'image' && list.length > 0 && !broken
          ? <PreviewChain list={list} onAllFailed={() => setBroken(true)} alt={f.file_name} />
          : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', background: 'var(--surface-muted)', borderRadius: 12 }}>{KIND_ICON[f.kind] || '📄'}</div>}
        <div style={{ marginTop: '0.7rem', fontWeight: 600, wordBreak: 'break-all' }}>{f.file_name}</div>
        <div className="muted">{formatBytes(f.size_bytes)} · {formatDate(f.created_at)}</div>
        <div className="convert-actions" style={{ justifyContent: 'stretch' }}>
          {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="glass-btn-outline" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>🔗 เปิดไฟล์เต็ม</a>}
          <button type="button" className="glass-btn-danger" style={{ flex: 1 }} onClick={() => onDelete(f)}>🗑️ ลบ</button>
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
const downloadUrl = f => { const id = driveId(f); return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : null; };
function triggerDownload(url) {
  const fr = document.createElement('iframe');
  fr.style.display = 'none'; fr.src = url;
  document.body.appendChild(fr);
  setTimeout(() => fr.remove(), 120000);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function FilesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const toast = useToast();
  const [filterKind, setFilterKind] = useState('all');
  const [cols, setCols] = useState(3);
  const [open, setOpen] = useState(null);
  const [sel, setSel] = useState(null);          // null = normal; Set of ids = select mode
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { const c = parseInt(localStorage.getItem('jarvis-file-cols'), 10); if (c === 3 || c === 4) setCols(c); } catch { /* ignore */ } }, []);
  function chooseCols(c) { setCols(c); try { localStorage.setItem('jarvis-file-cols', String(c)); } catch { /* ignore */ } }

  async function load() {
    setError(false);
    try { setData(await apiGet('/api/files')); }
    catch (e) { if (e.message !== 'unauthorized') setError(true); }
  }

  useEffect(() => { load(); }, []);

  async function deleteFile(f) {
    if (!confirm('ลบไฟล์นี้ถาวรใช่ไหมครับ? กู้คืนไม่ได้แล้ว')) return;
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

  async function deleteSelected() {
    const ids = shown.filter(x => sel?.has(x.id)).map(x => x.id); if (!ids.length || busy) return;
    if (!confirm(`ลบ ${ids.length} ไฟล์ถาวรใช่ไหมครับ? กู้คืนไม่ได้แล้ว`)) return;
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
      triggerDownload(url); n++;
      await sleep(900);
    }
    setBusy(false);
    toast.show(n ? `⬇️ สั่งดาวน์โหลด ${n} ไฟล์แล้ว — ดูในแถบแจ้งเตือน/โฟลเดอร์ดาวน์โหลด ถ้าไม่ขึ้น (ไฟล์ใหญ่หรือเบราว์เซอร์บล็อก) ให้แตะไฟล์แล้วกด “เปิดไฟล์เต็ม” แล้วบันทึกเอง${skipped ? ` · ข้าม ${skipped} ไฟล์ที่ไม่มีลิงก์` : ''}` : 'ไฟล์ที่เลือกไม่มีลิงก์ดาวน์โหลด', n ? { duration: 7000 } : { tone: 'error' });
  }

  const files = data?.files || [];
  const shown = filterKind === 'all' ? files : files.filter(f => f.kind === filterKind);
  const visibleSelCount = sel ? shown.filter(x => sel.has(x.id)).length : 0;
  const kindCounts = files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});

  return (
    <main className="page page-wide">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>📁 ไฟล์ของฉัน</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

          {shown.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีไฟล์ครับ ส่งรูปหรือไฟล์เข้าแชทกับ Jarvis ได้เลย</p></div>}

          <div className="file-grid" style={{ '--cols': cols, '--cols-wide': cols + 2 }}>
            {shown.map(f => <Tile key={f.id} f={f} selecting={sel !== null} selected={!!sel?.has(f.id)} onOpen={setOpen} onToggle={toggle} onStartSelect={startSelect} />)}
          </div>
        </>
      )}
      {open && <PreviewSheet f={open} onClose={() => setOpen(null)} onDelete={deleteFile} />}
    </main>
  );
}
