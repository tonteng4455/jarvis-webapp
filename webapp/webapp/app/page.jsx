'use client';
// app/page.jsx — root landing page. The full file-manager dashboard
// referenced from the bot's "20 files" cap notice isn't built yet;
// this is a placeholder so the link the bot sends actually goes
// somewhere reasonable instead of 404ing.

export default function HomePage() {
  return (
    <main className="page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚧</div>
        <h1 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>อยู่ระหว่างพัฒนา</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          หน้าจัดการไฟล์แบบเต็มรูปแบบกำลังจะมาเร็วๆ นี้ครับ ระหว่างนี้ใช้งานผ่าน Jarvis ในไลน์ได้ตามปกติ
        </p>
        <a href="/login" className="glass-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
          เข้าสู่ระบบด้วย LINE
        </a>
      </div>
    </main>
  );
}
