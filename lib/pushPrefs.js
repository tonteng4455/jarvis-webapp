// lib/pushPrefs.js — reminder preferences (users.push_prefs). Keep in sync with pushPrefs() in jarvis-line-bot.js.

export const PUSH_DEFAULTS = { lead: 30, atDue: true, morning: true, morningTime: '08:00', quietFrom: '22:00', quietTo: '07:00' };
export const LEAD_OPTIONS = [0, 5, 10, 15, 30, 60, 120];

const hhmm = v => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

export function normalizePrefs(raw) {
  const p = { ...PUSH_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    lead: LEAD_OPTIONS.includes(Number(p.lead)) ? Number(p.lead) : PUSH_DEFAULTS.lead,
    atDue: p.atDue !== false,
    morning: p.morning !== false,
    morningTime: hhmm(p.morningTime) || PUSH_DEFAULTS.morningTime,
    quietFrom: hhmm(p.quietFrom) || PUSH_DEFAULTS.quietFrom,
    quietTo: hhmm(p.quietTo) || PUSH_DEFAULTS.quietTo,
  };
}

// validate an incoming PUT body: only known keys, each checked → the normalized object, or null if nothing valid was sent
export function parsePrefsInput(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  if ('lead' in body) { if (!LEAD_OPTIONS.includes(Number(body.lead))) return null; out.lead = Number(body.lead); }
  for (const k of ['atDue', 'morning']) if (k in body) { if (typeof body[k] !== 'boolean') return null; out[k] = body[k]; }
  for (const k of ['morningTime', 'quietFrom', 'quietTo']) if (k in body) { if (!hhmm(body[k])) return null; out[k] = body[k]; }
  return Object.keys(out).length ? out : null;
}
