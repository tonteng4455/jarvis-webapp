// lib/draft.js — unsaved form drafts kept on THIS device, so a pause / app switch / the phone discarding the tab
// never loses what someone was typing. Keyed per person (the id is remembered once the dashboard knows who is signed in),
// expires after a day, wiped on sign-out. Every call is wrapped: storage can be blocked, full, or missing.

const PREFIX = 'jarvis-draft:';
const OWNER_KEY = 'jarvis-uid';
const MAX_AGE_MS = 24 * 3600 * 1000;

export function setDraftOwner(uid) { try { if (uid) localStorage.setItem(OWNER_KEY, String(uid)); } catch { /* ignore */ } }
const owner = () => { try { return localStorage.getItem(OWNER_KEY) || ''; } catch { return ''; } };
const fullKey = key => `${PREFIX}${owner()}:${key}`;

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.at !== 'number' || Date.now() - o.at > MAX_AGE_MS) { localStorage.removeItem(fullKey(key)); return null; }
    return o.v ?? null;
  } catch { return null; }
}
export function saveDraft(key, value) { try { localStorage.setItem(fullKey(key), JSON.stringify({ at: Date.now(), v: value })); } catch { /* ignore */ } }
export function clearDraft(key) { try { localStorage.removeItem(fullKey(key)); } catch { /* ignore */ } }
export function clearAllDrafts() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem(OWNER_KEY);
  } catch { /* ignore */ }
}
