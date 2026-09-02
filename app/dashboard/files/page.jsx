'use client';
// app/dashboard/files/page.jsx — file manager. Files themselves are
// uploaded from LINE chat (the bot stores them in R2); this page is
// for browsing, opening, and deleting what's already there — no
// upload button here, matching how notes/tasks/etc. are also created
// via the bot and only edited/managed here.

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
    setData(prev => {
      const file = prev.files.find(f => f.id === id);
      return { ...prev, files: prev.files.filter(f => f.id !== id), usedBytes: prev.usedBytes - (file?.size_bytes || 0) };
    });
  }

  const files = data?.files || [];
  const shown = filterKind === 'all' ? files : files.filter(f => f.kind === filterKind);
  const pct = data ? Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100)) : 0;
  const kindCounts = files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});

  return (
    <main className="page page-wide">
      <DashNav current="files" />
      <h1 className="page-title">📁 ไฟล์ของฉัน</h1>

      {data === null && <p className="text-white-muted">กำลังโหลด...</p>}

      {data && (
        <>
          <div className="glass-panel" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
              <span>ใช้ไป {formatBytes(data.usedBytes)} จาก {formatBytes(data.quotaBytes)}</span>
              <span className="muted">{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-muted)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? 'var(--danger)' : 'var(--accent)', borderRadius: 999, transition: 'width 0.3s ease' }} />
            </div>
            {!data.isPremium && pct >= 80 && (
              <p className="muted" style={{ marginTop: '0.6rem', fontSize: '0.75rem' }}>
                พื้นที่ใกล้เต็มแล้วครับ — Premium ได้พื้นที่ 5GB (จากเดิม 1GB) ✨
              </p>
            )}
          </div>

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

          {shown.length === 0 && <div className="glass-card"><p className="muted">ยังไม่มีไฟล์ครับ ส่งรูปหรือไฟล์เข้าแชทกับ Jarvis ได้เลย</p></div>}

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
