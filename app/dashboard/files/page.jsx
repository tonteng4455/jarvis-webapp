'use client';
// app/dashboard/files/page.jsx — file manager. Files themselves are
// uploaded from LINE chat (the bot stores them in the user's own
// Google Drive, in a "Bot_file" folder — see the bot's uploadToDrive);
// this page is for browsing, opening, and deleting what's already
// there — no upload button here, matching how notes/calendar/etc. are
// also created via the bot and only edited/managed here.

import { useState, useEffect } from 'react';
import { DashNav } from '../_components';

const KIND_ICON = { image: '🖼️', video: '🎬', audio: '🎵', file: '📄' };

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
  const [status, setStatus] = useState(null);
  const [filterKind, setFilterKind] = useState('all');

  function load() {
    fetch('/api/files').then(async res => {
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json();
      setData(json);
    });
  }

  useEffect(() => { load(); }, []);

  async function deleteFile(id) {
    if (!confirm('ลบไฟล์นี้ถาวรใช่ไหมครับ? กู้คืนไม่ได้แล้ว')) return;
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!res.ok) { setStatus('❌ ลบไม่สำเร็จ'); return; }
    setData(prev => ({ ...prev, files: prev.files.filter(f => f.id !== id) }));
  }

  const files = data?.files || [];
  const shown = filterKind === 'all' ? files : files.filter(f => f.kind === filterKind);
  const kindCounts = files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});

  return (
    <main className="page page-wide">
      <DashNav current="files" />
      <h1 className="page-title">📁 ไฟล์ของฉัน</h1>

      {data === null && <p className="text-white-muted">กำลังโหลด...</p>}

      {data && (
        <>
          {status && <p className="text-white-muted" style={{ marginBottom: '0.8rem' }}>{status}</p>}

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

          {shown.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีไฟล์ครับ ส่งรูปหรือไฟล์เข้าแชทกับ Dee ได้เลย</p></div>}

          <div className="grid-cards">
            {shown.map(f => (
              <div key={f.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {f.kind === 'image' && f.url ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.file_name} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 'var(--radius-sm)', display: 'block' }} />
                  </a>
                ) : (
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-sm)' }}>
                    {KIND_ICON[f.kind] || '📄'}
                  </div>
                )}
                <div style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.file_name}>
                  {f.file_name}
                </div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{formatBytes(f.size_bytes)} · {formatDate(f.created_at)}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="glass-btn-outline" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: '0.75rem' }}>
                      🔗 เปิด
                    </a>
                  )}
                  <button className="glass-btn-danger" style={{ flex: 1, fontSize: '0.75rem' }} onClick={() => deleteFile(f.id)}>🗑️ ลบ</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
