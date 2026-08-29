'use client';
// app/liff/page.jsx
//
// The single entry point every LIFF link (opened from a Flex card
// button in the bot) points to: https://liff.line.me/{LIFF_ID}?to=...
// LINE resolves that into an in-app browser window loading THIS page.
// We initialize LIFF, log in (skips the whole OAuth redirect dance —
// LIFF already knows who's tapping, since they're inside LINE), then
// hand the resulting ID token to /api/auth/liff to mint our normal
// session cookie, and finally redirect to wherever the link meant to
// go (?to=/dashboard/notes&id=123, etc).
//
// Query params:
//   to  — destination path under /dashboard (defaults to /dashboard)
//   id  — an item id to auto-open on that page (note/task/event)

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LiffEntryPage() {
  return (
    <Suspense fallback={<main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}><p className="text-white-muted">กำลังโหลด...</p></main>}>
      <LiffEntryPageInner />
    </Suspense>
  );
}

function LiffEntryPageInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState('กำลังเข้าสู่ระบบ...');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Load the LIFF SDK dynamically — only this page needs it, no
        // reason to ship it on every route.
        await loadLiffSdk();

        // Fetched from the server at RUNTIME rather than read directly
        // from process.env.NEXT_PUBLIC_LIFF_ID here — build-time
        // inlining of NEXT_PUBLIC_ vars needs a separate Cloudflare
        // "Build variables" config step that's easy to miss, whereas a
        // plain server-side env var (read in /api/liff-config) works
        // exactly like every other runtime var already does.
        const configRes = await fetch('/api/liff-config');
        const { liffId } = await configRes.json();
        if (!liffId) { setStatus('❌ ยังไม่ได้ตั้งค่า LIFF ID บนเซิร์ฟเวอร์ (LIFF_ID / NEXT_PUBLIC_LIFF_ID)'); return; }

        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login({ redirectUri: window.location.href });
          return; // liff.login() navigates away; nothing more to do here
        }

        const idToken = window.liff.getIDToken();
        if (!idToken) { setStatus('❌ ไม่พบข้อมูลยืนยันตัวตนจาก LINE'); return; }

        // Shape check, shown only if the verify step below fails — a
        // real JWT is header.payload.signature (2 dots, fairly long).
        // If liff.getIDToken() is returning something malformed (wrong
        // scope, stale SDK state, etc.), this makes that visible
        // directly on-screen instead of needing DevTools.
        const tokenShape = `length=${idToken.length}, dots=${(idToken.match(/\./g) || []).length}, starts="${idToken.slice(0, 12)}..."`;

        const res = await fetch('/api/auth/liff', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error('LIFF auth failed:', body, 'token shape:', tokenShape);
          const serverDebug = body.debug ? `\nserver เห็น: client_id=${body.debug.client_id_used}, token length=${body.debug.id_token_length}, dots=${body.debug.id_token_dots}` : '';
          setStatus(`❌ เข้าสู่ระบบไม่สำเร็จ: ${body.error || res.status}${body.detail ? ` — ${body.detail}` : ''}\n\nclient เห็น: ${tokenShape}${serverDebug}`);
          return;
        }

        if (cancelled) return;
        const to = params.get('to') || '/dashboard';
        const id = params.get('id');
        const dest = id ? `${to}${to.includes('?') ? '&' : '?'}id=${encodeURIComponent(id)}` : to;
        window.location.replace(dest);
      } catch (e) {
        console.error('LIFF init failed:', e);
        setStatus('❌ เปิดไม่สำเร็จ ลองใหม่อีกครั้งครับ');
      }
    }
    run();
    return () => { cancelled = true; };
  }, [params]);

  return (
    <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <p className="text-white-muted" style={{ whiteSpace: 'pre-wrap', textAlign: 'center', padding: '0 1rem' }}>{status}</p>
    </main>
  );
}

function loadLiffSdk() {
  return new Promise((resolve, reject) => {
    if (window.liff) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load LIFF SDK'));
    document.head.appendChild(script);
  });
}
