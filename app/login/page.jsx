'use client';
// app/login/page.jsx
export default function LoginPage() {
  return (
    <main className="page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: 340, width: '100%' }}>
        <img src="/icon-192.png" alt="Jarvis" width="96" height="96" style={{ borderRadius: 22, display: 'block', margin: '0 auto 0.8rem', boxShadow: '0 6px 20px rgba(11,42,91,0.35)' }} />
        <h1 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Jarvis</h1>
        <a href="/api/auth/login" className="glass-btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.5rem' }}>
          เข้าสู่ระบบด้วย LINE
        </a>
        {process.env.NEXT_PUBLIC_MOCK_MODE === '1' && (
          <p style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            <a href="/api/auth/dev-login?user=demo">[test] เข้าด้วยบัญชีทดสอบ</a> · <a href="/api/auth/dev-login?user=nodrive">ไม่เชื่อม Drive</a>
          </p>
        )}
      </div>
    </main>
  );
}
