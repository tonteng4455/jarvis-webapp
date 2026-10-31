// lib/calendarSeries.js — repeating appointments on the web side.
// A repeating appointment is ONE calendar_events row with a recurrence_rule (see event_recurrence.sql and lib/recur.js);
// the lists show one entry per date, expanded here at read time. Nothing here talks to Google: edits and cancels of a
// series go through the bot Worker (/internal/calendar-series-op), which owns the Google side.

import { expandRow, describeRule, parseRRule, buildRRule, firstOccurrence } from './recur.js';

export const SERIES_SELECT = 'id, title, start_time, end_time, location, description, status, reminder_minutes, google_event_id, calendar_id, recurrence_rule, recur_exdates, series_id';
export const BASE_SELECT = 'id, title, start_time, end_time, location, description, status, reminder_minutes, google_event_id, calendar_id';

const TZ_OFFSET_H = 7;   // Asia/Bangkok, like the bot
export const localDate = iso => new Date(Date.parse(iso) + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
export const addDaysIso = (iso, n) => new Date(Date.parse(iso) + n * 86400e3).toISOString();

// every date of the series rows that falls in [fromIso, toIso) — one entry per date, each with a unique `key`
export function expandSeries(rows, fromIso, toIso, { max = 400 } = {}) {
  const lo = Date.parse(fromIso), hi = Date.parse(toIso);
  const f = localDate(fromIso), t = localDate(new Date(hi - 1).toISOString());
  const out = [];
  for (const r of rows || []) {
    for (const o of expandRow(r, f, t)) {
      const ms = Date.parse(o.start_time);
      if (ms >= lo && ms < hi) out.push({ ...o, key: `${r.id}@${o.occ_date}`, series_text: describeRule(r.recurrence_rule) });
    }
  }
  return out.sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, max);
}

// the repeat chosen in the form → { rule } for the row, or { error }. Shape: { freq, interval, days: ['MO',..], monthMode: 'day'|'nth'|'last', until, count }
export function ruleFromForm(rep, startDate) {
  if (!rep || !rep.freq) return { rule: null };
  if (!['daily', 'weekly', 'monthly'].includes(rep.freq)) return { error: 'bad_repeat' };
  const interval = Math.max(1, Math.min(99, parseInt(rep.interval, 10) || 1));
  const r = { freq: rep.freq, interval, byday: [], bymonthday: [], until: null, count: null };
  const dow = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${startDate}T00:00:00Z`).getUTCDay()];
  const day = +startDate.slice(8, 10);
  if (rep.freq === 'weekly') {
    const days = [...new Set((rep.days || []).filter(d => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].includes(d)))];
    r.byday = (days.length ? days : [dow]).map(d => ({ n: 0, day: d }));
  } else if (rep.freq === 'monthly') {
    if (rep.monthMode === 'last') r.bymonthday = [-1];
    else if (rep.monthMode === 'nth') r.byday = [{ n: day > 28 ? -1 : Math.ceil(day / 7), day: dow }];
    else r.bymonthday = [day];
  }
  if (rep.until) { if (!/^\d{4}-\d{2}-\d{2}$/.test(rep.until) || rep.until < startDate) return { error: 'until_before_start' }; r.until = rep.until; }
  else if (rep.count) { const c = parseInt(rep.count, 10); if (!(c >= 1 && c <= 999)) return { error: 'bad_count' }; r.count = c; }
  const text = buildRRule(r);
  const first = firstOccurrence(text, startDate);
  if (!first) return { error: 'no_occurrence' };
  return { rule: text, first, text: describeRule(text) };
}

// Google-only events for the "upcoming" list: Google also sends events that merely OVERLAP the window (an all-day / multi-day one
// that began weeks ago). The list is "from today on", so those are dropped; a ranged (month) view keeps everything it asked for.
export const externalFromToday = (events, nowIso, ranged) => (ranged ? events : events.filter(e => localDate(e.start_time) >= localDate(nowIso)));

export { parseRRule };
