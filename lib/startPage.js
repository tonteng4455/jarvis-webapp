// lib/startPage.js — which page the app opens on: 💬 แชท (default) or 🏠 วันนี้. Chosen in the settings menu (top right).
// It lives in a plain cookie (not localStorage) so the SERVER can use it too: the "/" page, the LINE / Google login redirects and the
// LIFF landing all need to know before any page has loaded. One choice per browser / device, like the theme and the text size.

export const START_COOKIE = 'jarvis_start';
export const START_PAGES = { chat: '/dashboard/chat', today: '/dashboard/today' };

// 'today' | 'chat' (anything else → 'chat')
export const normalizeStart = v => (v === 'today' ? 'today' : 'chat');
export const startPath = v => START_PAGES[normalizeStart(v)];

// the value out of a Cookie header / document.cookie string
export function startFromCookieString(str) {
  const m = new RegExp(`(?:^|;\\s*)${START_COOKIE}=([^;]*)`).exec(String(str || ''));
  let v = ''; try { v = m ? decodeURIComponent(m[1]) : ''; } catch { /* a broken cookie is just "not set" */ }
  return normalizeStart(v);
}

// browser only: remember the choice for a year
export function saveStart(v) {
  const val = normalizeStart(v);
  document.cookie = `${START_COOKIE}=${val}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  return val;
}
export const readStart = () => startFromCookieString(typeof document === 'undefined' ? '' : document.cookie);
