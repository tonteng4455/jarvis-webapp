'use client';
// app/dashboard/files/page.jsx — file manager. Files themselves are
// uploaded from LINE chat (the bot stores them in the user's own
// Google Drive, in a "Bot_file" folder — see the bot's uploadToDrive);
// this page is for browsing, opening, and deleting what's already
// there — no upload button here, matching how notes/calendar/etc. are
// also created via the bot and only edited/managed here.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DashNav } from '../_components';
import { apiGet, ErrorState, ListSkeleton, useToast } from '../_ui';

const KIND_ICON = { image: '🖼️', video: '🎬', audio: '🎵', file: '📄' };

// Drive's own thumbnail endpoint works in an <img> for "anyone with the link" files (the old
// uc?export=view address is increasingly refused when hot-linked). Fall back through the stored URL,
// then to the plain icon — a tile never shows a broken-image box.
function previewSources(f, size) {
  const list = [];
  if (f.kind !== 'image') return list;
  if (f.drive_file_id) list.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(f.drive_file_id)}&sz=w${size}`);
  if (f.url) list.push(f.url);
  return list;
}
const extOf = n => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ''); return m ? m[1].toUpperCase() : ''; };

function Tile({ f, onOpen }) {
  const [failed, setFailed] = useState(false);
  const canPreview = f.kind === 'image' && previewSources(f, 300).length > 0 && !failed;
  return (
    <button type="button" className={`file-tile${canPreview ? '' : ' is-doc'}`} onClick={() => onOpen(f)} title={f.file_name} aria-label={f.file_name}>
      {canPreview
        ? <FallbackImg f={f} onAllFailed={() => setFailed(true)} />
        : <span className="ft-icon">{KIND_ICON[f.kind] || '📄'}{extOf(f.file_name) && <small>{extOf(f.file_name)}</small>}</span>}
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
        {f.kind === 'image' && list.length > 0 && !broken
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

export default function FilesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const toast = useToast();
  const [filterKind, setFilterKind] = useState('all');
  const [cols, setCols] = useState(3);
  const [open, setOpen] = useState(null);

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

  const files = data?.files || [];
  const shown = filterKind === 'all' ? files : files.filter(f => f.kind === filterKind);
  const kindCounts = files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});

  return (
    <main className="page page-wide">
      <DashNav />
      <div className="page-head">
        <h1 className="page-title" style={{ marginBottom: 0 }}>📁 ไฟล์ของฉัน</h1>
        <div className="seg" role="group" aria-label="จำนวนต่อแถว">
          <button type="button" className={cols === 3 ? 'active' : ''} onClick={() => chooseCols(3)} aria-label="3 ต่อแถว">▦ 3</button>
          <button type="button" className={cols === 4 ? 'active' : ''} onClick={() => chooseCols(4)} aria-label="4 ต่อแถว">▦ 4</button>
        </div>
      </div>

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
            {shown.map(f => <Tile key={f.id} f={f} onOpen={setOpen} />)}
          </div>
        </>
      )}
      {open && <PreviewSheet f={open} onClose={() => setOpen(null)} onDelete={deleteFile} />}
    </main>
  );
}
