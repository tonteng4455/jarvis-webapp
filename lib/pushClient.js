// lib/pushClient.js — browser side of Web Push (only call from client components).

export function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// What this browser can do → { state, ios, standalone }
//   state: 'ok' | 'ios_install' (iPhone: must be added to the Home Screen first) | 'in_line' (LINE's own browser can't) | 'unsupported'
export function pushSupport() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  if (/\bLine\//i.test(ua)) return { state: 'in_line', ios, standalone };
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!has) return { state: ios && !standalone ? 'ios_install' : 'unsupported', ios, standalone };
  return { state: 'ok', ios, standalone };
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  // the service worker is only registered in production builds
  return Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 4000))]);
}

export async function currentSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function toPayload(sub) {
  const j = sub.toJSON();
  return { endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } };
}

export async function enablePush(publicKey) {
  const reg = await registration();
  if (!reg) throw new Error('no_service_worker');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: toPayload(sub), userAgent: navigator.userAgent }) });
  if (!res.ok) throw new Error('save_failed');
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// keep the server's copy fresh (the browser can rotate a subscription)
export async function resyncSubscription() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: toPayload(sub), userAgent: navigator.userAgent }) }).catch(() => {});
}
