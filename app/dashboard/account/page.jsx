'use client';
// app/dashboard/account/page.jsx — how this person signs in: LINE and / or Google, joined into one account (nothing is lost).

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashNav } from '../_components';
import { useToast } from '../_ui';

const ERRORS = {
  google_not_configured: 'ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google บนเซิร์ฟเวอร์ (ผู้ดูแลระบบต้องใส่ GOOGLE_LOGIN_CLIENT_ID / SECRET)',
  google_failed: 'เข้าสู่ระบบกับ Google ไม่สำเร็จ ลองอีกครั้งครับ',
  state_mismatch: 'หมดเวลา ลองกดผูกบัญชีใหม่อีกครั้งครับ',
  session_changed: 'บัญชีที่ล็อกอินอยู่เปลี่ยนไประหว่างทาง ลองกดผูกบัญชีใหม่อีกครั้งครับ',
  line_already: 'บัญชีนี้ผูกกับ LINE อยู่แล้ว (ผูก LINE บัญชีที่สองไม่ได้ เพราะบอทใช้รหัส LINE เดียวต่อหนึ่งบัญชี)',
  db: 'บันทึกไม่สำเร็จ ลองอีกครั้งครับ',
};

export default function AccountPage() {
  return <Suspense fallback={null}><AccountInner /></Suspense>;
}

function AccountInner() {
  const toast = useToast(), router = useRouter(), params = useSearchParams();
  const [info, setInfo] = useState(null);
  const [merge, setMerge] = useState(null);          // what each side holds, while waiting for the confirmation
  const [mergeError, setMergeError] = useState('');
  const [busy, setBusy] = useState(false);
  const mergeToken = params.get('merge'), err = params.get('error'), linked = params.get('linked');

  const load = useCallback(async () => { const r = await fetch('/api/account'); if (r.ok) setInfo(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!mergeToken) { setMerge(null); return; }
    fetch(`/api/account/merge?t=${encodeURIComponent(mergeToken)}`).then(async r => { if (r.ok) setMerge(await r.json()); else setMergeError(r.status === 410 ? 'ลิงก์ยืนยันหมดอายุแล้ว ลองกดผูกบัญชีใหม่อีกครั้งครับ' : 'เปิดหน้ายืนยันไม่ได้'); }).catch(() => setMergeError('เปิดหน้ายืนยันไม่ได้'));
  }, [mergeToken]);
  useEffect(() => { if (linked === 'google') toast.show('ผูกบัญชี Google แล้ว'); if (linked === 'already') toast.show('บัญชี Google นี้ผูกอยู่แล้ว'); }, [linked]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmMerge() {
    setBusy(true);
    try {
      const r = await fetch('/api/account/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: mergeToken }) });
      if (!r.ok) throw new Error('merge');
      toast.show('รวมบัญชีแล้ว ข้อมูลอยู่ครบ'); router.replace('/dashboard/account'); await load();
    } catch { setMergeError('รวมบัญชีไม่สำเร็จ ข้อมูลยังอยู่เหมือนเดิม ลองอีกครั้งครับ'); } finally { setBusy(false); }
  }
  async function unlink(subject) {
    if (!window.confirm('เลิกใช้บัญชี Google นี้เข้าสู่ระบบ? ข้อมูลยังอยู่กับบัญชีนี้ครบ')) return;
    const r = await fetch('/api/account/unlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject }) });
    if (r.ok) { toast.show('เลิกผูกแล้ว'); load(); } else toast.show('เลิกผูกไม่ได้ ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อยหนึ่งทาง');
  }

  const sum = side => Object.entries(side.counts).filter(([, n]) => n > 0).map(([k, n]) => `${merge.labels[k]} ${n}`).join(' · ') || 'ยังไม่มีข้อมูล';
  const typeName = t => (t === 'line' ? 'บัญชี LINE' : 'บัญชี Google');

  return (
    <main className="page">
      <DashNav />
      <div className="glass-panel" style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>👤 บัญชีและการเข้าสู่ระบบ</h1>
        <p className="muted" style={{ marginBottom: '1rem' }}>เข้าสู่ระบบได้ทั้ง LINE และ Google ข้อมูลทั้งหมด (โน้ต งาน นัดหมาย เงิน ไฟล์) เป็นชุดเดียวกัน</p>
        {err && <div role="alert" className="note-image-error" style={{ marginBottom: '0.8rem' }}>⚠️ {ERRORS[err] || 'เกิดข้อผิดพลาด'}</div>}

        {mergeError && <div role="alert" className="note-image-error" style={{ marginBottom: '0.8rem' }}>⚠️ {mergeError}</div>}
        {merge && (
          <div className="glass-card" data-testid="merge-box" style={{ marginBottom: '1rem', padding: '0.9rem', border: '2px solid var(--accent)' }}>
            <strong>บัญชีนี้มีข้อมูลอยู่แล้ว จะรวมเข้าด้วยกันไหม?</strong>
            <p style={{ margin: '0.6rem 0 0.2rem' }}><b>{typeName(merge.to.type)}</b>{merge.to.name ? ` (${merge.to.name})` : ''} — บัญชีหลักที่จะเหลืออยู่</p>
            <p className="muted" style={{ margin: 0 }}>{sum(merge.to)}</p>
            <p style={{ margin: '0.6rem 0 0.2rem' }}><b>{typeName(merge.from.type)}</b>{merge.from.name ? ` (${merge.from.name})` : ''} — จะย้ายเข้ามารวม</p>
            <p className="muted" style={{ margin: 0 }}>{sum(merge.from)}</p>
            <p style={{ margin: '0.7rem 0 0.8rem', fontSize: '0.85rem' }}>หลังรวมแล้วทั้งสองทางเข้าสู่ระบบจะเห็นข้อมูลชุดเดียวกัน ทำย้อนกลับไม่ได้ แต่ไม่มีข้อมูลหาย</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="glass-btn" data-act="merge-ok" disabled={busy} onClick={confirmMerge}>{busy ? 'กำลังรวม…' : 'รวมบัญชี'}</button>
              <button type="button" className="glass-btn-outline" data-act="merge-cancel" disabled={busy} onClick={() => router.replace('/dashboard/account')}>ยกเลิก</button>
            </div>
          </div>
        )}

        {info && (
          <>
            <div className="account-sheet-label">ตอนนี้เข้าสู่ระบบได้ด้วย</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.4rem 0 1rem', display: 'grid', gap: '0.5rem' }}>
              <li className="glass-card" data-provider="line" style={{ padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span aria-hidden="true">💬</span><span style={{ flex: 1 }}><b>LINE</b><br /><span className="muted">{info.line ? 'ผูกแล้ว (ใช้กับบอท LINE ได้ด้วย)' : 'ยังไม่ได้ผูก'}</span></span>
                {!info.line && <a className="glass-btn" data-act="link-line" href="/api/auth/link-line" style={{ textDecoration: 'none' }}>ผูก LINE</a>}
              </li>
              {info.google.map(g => (
                <li key={g.subject} className="glass-card" data-provider="google" style={{ padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span aria-hidden="true">🔵</span><span style={{ flex: 1, minWidth: 0 }}><b>Google</b><br /><span className="muted" style={{ overflowWrap: 'anywhere' }}>{g.label}</span></span>
                  {info.canUnlinkGoogle && <button type="button" className="glass-btn-outline" data-act="unlink" onClick={() => unlink(g.subject)}>เลิกผูก</button>}
                </li>
              ))}
              {info.google.length === 0 && (
                <li className="glass-card" data-provider="google" style={{ padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span aria-hidden="true">🔵</span><span style={{ flex: 1 }}><b>Google</b><br /><span className="muted">ยังไม่ได้ผูก</span></span>
                  <a className="glass-btn" data-act="link-google" href="/api/auth/google?mode=link" style={{ textDecoration: 'none' }}>ผูก Google</a>
                </li>
              )}
            </ul>
            {info.google.length > 0 && <a className="glass-btn-outline" data-act="link-google" href="/api/auth/google?mode=link" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: '0.8rem' }}>＋ ผูก Google อีกบัญชี</a>}
            {!info.googleReady && <p className="muted" style={{ fontSize: '0.8rem' }}>การเข้าสู่ระบบด้วย Google ยังไม่ได้เปิดบนเซิร์ฟเวอร์นี้</p>}
            {!info.line && <p className="muted" style={{ fontSize: '0.85rem' }}>ถ้าผูก LINE ด้วย ข้อมูลทั้งหมดจะย้ายไปเป็นบัญชี LINE ของคุณ (ถ้ามีข้อมูลเก่าใน LINE อยู่แล้วจะรวมให้ หลังกดยืนยัน) และใช้บอท LINE ได้ด้วย</p>}
          </>
        )}
      </div>
    </main>
  );
}
