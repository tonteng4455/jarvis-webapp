// public/sw.js — service worker. Goals: the app opens instantly like an
// installed app and your notes stay readable offline.
//  • static assets (/_next/static, icons): cache-first
//  • pages: network-first, falling back to the last copy when offline
//  • GET /api/notes (the list): network-first, falling back to the last
//    copy — read-only offline; nothing is ever written offline
// Everything else (other APIs, all writes) goes straight to the network.
// Logging out wipes the API cache so one person's notes never linger
// for the next user of the same browser.
const VERSION = 'v1';
const STATIC = `jarvis-static-${VERSION}`;
const PAGES = `jarvis-pages-${VERSION}`;
const API = `jarvis-api-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, API]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname === '/api/auth/logout') {
    e.waitUntil(Promise.all([caches.delete(API), caches.delete(PAGES)]));
    return;
  }
  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/_next/static/') || /\.(png|ico|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.pathname === '/api/notes') { e.respondWith(networkFirst(req, API)); return; }
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate' && url.pathname.startsWith('/dashboard')) { e.respondWith(networkFirst(req, PAGES)); }
});
