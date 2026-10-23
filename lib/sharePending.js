// lib/sharePending.js — text shared INTO the app from another app (Android share sheet → "Jarvis").
// The share arrives at /share (public) which parks it here, because the person may have to log in first;
// /dashboard/share (and a banner on Today) picks it up afterwards. Stored only on this device, expires in 6 hours.

const KEY = 'jarvis-share';
const TTL = 6 * 3600e3;

// → { title, text, url } trimmed, or null when there is nothing to keep
export function cleanShare(input) {
  // (a form POST turns every newline into CRLF, so line breaks are normalised first)
  const f = k => String(input?.[k] || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, k === 'text' ? 20000 : 2000);
  const out = { title: f('title'), text: f('text'), url: f('url') };
  return out.title || out.text || out.url ? out : null;
}

// One block of text to work with: shared text (or title), plus the link when it is not already inside the text.
export function shareToText({ title = '', text = '', url = '' }) {
  const body = text || title;
  const parts = [body];
  if (title && text && !text.includes(title)) parts.unshift(title);
  if (url && !body.includes(url)) parts.push(url);
  return parts.filter(Boolean).join('\n\n');
}

export function stashShare(item, now = Date.now()) {
  const clean = cleanShare(item); if (!clean) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ ...clean, at: now })); return true; } catch { return false; }
}
export function readShare(now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v.at !== 'number' || now - v.at > TTL) { localStorage.removeItem(KEY); return null; }
    return cleanShare(v);
  } catch { return null; }
}
export function clearShare() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
