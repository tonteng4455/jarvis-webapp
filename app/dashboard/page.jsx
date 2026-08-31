'use client';
// app/dashboard/page.jsx

import { useState, useEffect } from 'react';
import { DashNav } from './_components';

function formatBytes(n) {
  if (!n && n !== 0) return '-';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export default function DashboardPage() {
  const [me, setMe] = useState(null);
  const [files, setFiles] = useState([]);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [meRes, filesRes] = await Promise.all([fetch('/api/me'), fetch('/api/files')]);
      if (meRes.status === 401) { window.location.href = '/login'; return; }
      const meData = await meRes.json();
      const filesData = await filesRes.json();
      setMe(meData);
      setPhone(meData.phoneNumber || '');
      setFiles(filesData.files || []);
    } catch (e) {
      setStatus('❌ โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePhone(e) {
    e.preventDefault();
    setStatus('กำลังบันทึก...');
    try {
      const res = await fetch('/api/me/phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setStatus('✅ บันทึกเบอร์โทรแล้วครับ');
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function deleteFile(id) {
    if (!confirm('ลบไฟล์นี้ใช่ไหม?')) return;
    await fetch('/api/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load();
  }

  if (loading) return <main className="page"><p className="text-white-muted">กำลังโหลด...</p></main>;
  if (!me) return null;

  const usagePct = Math.min(100, Math.round((me.usedBytes / me.quotaBytes) * 100));

  return (
    <main className="page">
      <DashNav current="dashboard" />

      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        {me.pictureUrl && <img src={me.pictureUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0 }} />}
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{me.displayName || 'ผู้ใช้'}</div>
          <div style={{ fontSize: '0.85rem', color: me.isPremium ? 'var(--success)' : 'var(--text-secondary)' }}>
            {me.isPremium ? `✨ Premium ถึง ${new Date(me.premiumUntil).toLocaleDateString('th-TH')}` : 'Free'}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>พื้นที่จัดเก็บ</h2>
        <div style={{ background: 'var(--border)', borderRadius: 8, overflow: 'hidden', height: 10 }}>
          <div style={{ width: `${usagePct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent))', height: '100%' }} />
        </div>
        <div className="muted" style={{ marginTop: '0.4rem' }}>{formatBytes(me.usedBytes)} / {formatBytes(me.quotaBytes)}</div>
      </div>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>เบอร์โทรติดต่อ</h2>
        <form onSubmit={savePhone} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input className="glass-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="08xxxxxxxx" style={{ flex: 1, minWidth: 160 }} />
          <button type="submit" className="glass-btn">บันทึก</button>
        </form>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          ใส่ไว้ครั้งเดียว แอดมินจะใช้ตอนติดต่อเรื่อง Premium โดยไม่ต้องถามซ้ำครับ
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>ไฟล์ของฉัน ({files.length})</h2>
        {files.length === 0 && <p className="muted">ยังไม่มีไฟล์ครับ</p>}
        <div className="list-stack">
          {files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.6rem', background: 'var(--surface)', borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                <div className="muted">{formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString('th-TH')}</div>
              </div>
              {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', flexShrink: 0 }}>เปิด</a>}
              <button onClick={() => deleteFile(f.id)} className="glass-btn-danger" style={{ flexShrink: 0 }}>ลบ</button>
            </div>
          ))}
        </div>
      </div>

      {status && <p className="text-white-muted" style={{ marginTop: '1rem' }}>{status}</p>}

      <form action="/api/auth/logout" method="POST" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <button type="submit" className="glass-btn-outline">ออกจากระบบ</button>
      </form>
    </main>
  );
}
