'use client';
// app/dashboard/_shell.jsx — client pieces of the dashboard layout.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_TABS, tabKeyForPath } from './_components';

// Thumb-reachable tab bar on phones (CSS hides it on wide screens,
// where the top bar carries the same tabs).
export function BottomNav() {
  const current = tabKeyForPath(usePathname());
  return (
    <nav className="bottom-nav" aria-label="เมนูหลัก">
      {NAV_TABS.map(t => (
        <Link key={t.key} href={t.href} className={`bottom-nav-item${current === t.key ? ' active' : ''}`}>
          <span className="bottom-nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (!offline) return null;
  return <div className="offline-banner">📡 ออฟไลน์ — แสดงข้อมูลที่บันทึกไว้ล่าสุด</div>;
}

export function SwRegister() {
  useEffect(() => {
    // Not in dev: a service worker fights hot reload.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
