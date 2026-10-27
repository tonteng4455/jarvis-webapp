'use client';
// app/login/page.jsx
import { useEffect, useState } from 'react';
const ERRORS = {
  google_not_configured: 'ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google บนเซิร์ฟเวอร์นี้',
  google_failed: 'เข้าสู่ระบบกับ Google ไม่สำเร็จ ลองอีกครั้งครับ',
  state_mismatch: 'หมดเวลา ลองอีกครั้งครับ',
  token_exchange: 'เข้าสู่ระบบกับ LINE ไม่สำเร็จ ลองอีกครั้งครับ',
  id_token_invalid: 'เข้าสู่ระบบกับ LINE ไม่สำเร็จ ลองอีกครั้งครับ',
  db: 'บันทึกไม่สำเร็จ ลองอีกครั้งครับ',
};

export default function LoginPage() {
  const [err, setErr] = useState(null);
  useEffect(() => { setErr(new URLSearchParams(window.location.search).get('error')); }, []);
  return (
    <main className="page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: 340, width: '100%' }}>
        <img src="/icon-192.png" alt="Jarvis" width="96" height="96" style={{ borderRadius: 22, display: 'block', margin: '0 auto 0.8rem', boxShadow: '0 6px 20px rgba(11,42,91,0.35)' }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Jarvis</h1>
        <a href="/api/auth/login" className="glass-btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.5rem' }}>
          เข้าสู่ระบบด้วย LINE
        </a>
        <div style={{ height: '0.6rem' }} />
        <a href="/api/auth/google" className="glass-btn-outline" data-act="google-login" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.5rem' }}>
          เข้าสู่ระบบด้วย Google
        </a>
        {err && <p role="alert" style={{ marginTop: '0.9rem', fontSize: '0.85rem', color: 'var(--danger, #c0392b)' }}>{ERRORS[err] || 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้งครับ'}</p>}
        <p className="muted" style={{ marginTop: '0.9rem', fontSize: '0.78rem' }}>ใช้ได้ทั้งสองทาง ผูกบัญชีทีหลังได้ที่เมนูบัญชี ข้อมูลไม่หาย</p>
        {process.env.NEXT_PUBLIC_MOCK_MODE === '1' && (
          <p style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            <a href="/api/auth/dev-login?user=demo">[test] เข้าด้วยบัญชีทดสอบ</a> · <a href="/api/auth/dev-login?user=nodrive">ไม่เชื่อม Drive</a>
          </p>
        )}
      </div>
    </main>
  );
}
