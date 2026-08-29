'use client';
// app/admin/page.jsx
//
// Admin console for managing user permissions (grant/extend/revoke
// Premium). Single shared password (ADMIN_SECRET) — Boq is the only
// admin, so this intentionally skips a full multi-admin auth system.

import { useState, useEffect, useCallback } from 'react';

function formatBytes(n) {
  if (!n && n !== 0) return '-';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [days, setDays] = useState(365);

  const loadUsers = useCallback(async (secret, q) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q || '')}`, {
        headers: { 'x-admin-secret': secret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setUsers(data.users);
      setUnlocked(true);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  function unlock(e) {
    e.preventDefault();
    loadUsers(adminSecret, search);
  }

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => loadUsers(adminSecret, search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function grantPremium(lineUserId) {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/set-premium', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret, lineUserId, days: Number(days) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setStatus(`✅ Premium ถึง ${new Date(data.user.premium_until).toLocaleString('th-TH')}`);
      loadUsers(adminSecret, search);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  async function revokePremium(lineUserId) {
    if (!confirm('ยกเลิก Premium ของผู้ใช้นี้ใช่ไหม?')) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/revoke-premium', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret, lineUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setStatus('✅ ยกเลิก Premium แล้ว');
      loadUsers(adminSecret, search);
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    }
  }

  if (!unlocked) {
    return (
      <main className="page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={unlock} className="glass-panel" style={{ maxWidth: 320, width: '100%' }}>
          <h1 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Admin Console</h1>
          <input type="password" placeholder="Admin password" value={adminSecret}
            onChange={e => setAdminSecret(e.target.value)} required className="glass-input" style={{ marginBottom: '0.75rem' }} />
          <button type="submit" className="glass-btn" style={{ width: '100%' }}>
            {loading ? 'กำลังโหลด...' : 'เข้าสู่ระบบ'}
          </button>
          {status && <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>{status}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="page page-wide">
      <h1 className="page-title">Admin Console — Users</h1>

      <div className="glass-card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="ค้นหาด้วยชื่อ / userId / เบอร์โทร" value={search}
          onChange={e => setSearch(e.target.value)} className="glass-input" style={{ flex: 1, minWidth: 200 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
          วันที่จะเพิ่มตอนกด Grant:
          <input type="number" value={days} onChange={e => setDays(e.target.value)} className="glass-input" style={{ width: 64 }} />
        </label>
      </div>

      {status && <p className="text-white-muted" style={{ marginBottom: '1rem' }}>{status}</p>}

      <div className="glass-card">
        <table className="glass-table">
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>เบอร์โทร</th>
              <th>สถานะ</th>
              <th>พื้นที่</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.line_user_id}>
                <td data-label="ผู้ใช้">
                  <div style={{ fontWeight: 'bold' }}>{u.display_name || '(ยังไม่เคย login เว็บ)'}</div>
                  <div className="muted">{u.line_user_id}</div>
                </td>
                <td data-label="เบอร์โทร">{u.phone_number || '-'}</td>
                <td data-label="สถานะ">
                  {u.is_premium && u.premium_until && new Date(u.premium_until) > new Date()
                    ? <span style={{ color: '#2ECC71' }}>Premium ถึง {new Date(u.premium_until).toLocaleDateString('th-TH')}</span>
                    : <span className="muted">Free</span>}
                </td>
                <td data-label="พื้นที่">{formatBytes(u.used_storage_bytes)} / {formatBytes(u.storage_quota_bytes)}</td>
                <td data-label="จัดการ" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button onClick={() => grantPremium(u.line_user_id)} className="glass-btn-outline" style={{ color: '#333', background: 'rgba(0,0,0,0.05)', borderColor: 'rgba(0,0,0,0.15)' }}>Grant/Extend</button>
                  <button onClick={() => revokePremium(u.line_user_id)} className="glass-btn-danger">Revoke</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem' }} className="muted">ไม่พบผู้ใช้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
