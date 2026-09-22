'use client';
// app/login/page.jsx
export default function LoginPage() {
  return (
    <main className="page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: 340, width: '100%' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>✨ Jarvis</h1>
        <a href="/api/auth/login" className="glass-btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.5rem' }}>
          เข้าสู่ระบบด้วย LINE
        </a>
      </div>
    </main>
  );
}
