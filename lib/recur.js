// lib/recur.js — repeating appointments: the rule (a small RRULE subset), its dates, and a Thai description.
// Pure (no DOM, no network). The LINE bot carries an identical copy of this file (generated from it), so both sides expand the same way.
//
// A repeating appointment is ONE row in calendar_events with `recurrence_rule` (e.g. "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2;UNTIL=20261231")
// and `recur_exdates` (dates taken out). Its first date / time of day is the row's start_time (Bangkok). The dates come from expandDates().
//   FREQ = DAILY | WEEKLY | MONTHLY · INTERVAL · BYDAY (MO…SU, with a number in monthly rules: 2MO = the 2nd Monday, -1FR = the last Friday)
//   BYMONTHDAY (5, -1 = the last day) · UNTIL (a date) or COUNT.

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const DAY_TH = { SU: 'อาทิตย์', MO: 'จันทร์', TU: 'อังคาร', WE: 'พุธ', TH: 'พฤหัสบดี', FR: 'ศุกร์', SA: 'เสาร์' };
const WEEK_OFFSET = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };            // days after Monday
const pad2 = n => String(n).padStart(2, '0');
export const ymdOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const toDays = s => { const [y, m, d] = String(s).split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const fromDays = n => { const d = new Date(n * 86400000); return ymdOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
export const dowOfDate = s => new Date(toDays(s) * 86400000).getUTCDay();
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addDays = (s, n) => fromDays(toDays(s) + n);

export function parseRRule(str) {
  const o = {};
  for (const part of String(str || '').replace(/^RRULE:/i, '').split(';')) { const [k, v] = part.split('='); if (k && v) o[k.trim().toUpperCase()] = v.trim(); }
  const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' }[o.FREQ];
  if (!freq) return null;
  const byday = (o.BYDAY ? o.BYDAY.split(',') : []).map(x => { const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim().toUpperCase()); return m ? { n: m[1] ? parseInt(m[1], 10) : 0, day: m[2] } : null; }).filter(Boolean);
  const bymonthday = (o.BYMONTHDAY ? o.BYMONTHDAY.split(',') : []).map(Number).filter(n => n && Math.abs(n) <= 31);
  const um = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(o.UNTIL || '');
  return { freq, interval: Math.max(1, Math.min(99, parseInt(o.INTERVAL || '1', 10) || 1)), byday, bymonthday, until: um ? `${um[1]}-${um[2]}-${um[3]}` : null, count: o.COUNT ? Math.max(1, Math.min(999, parseInt(o.COUNT, 10) || 1)) : null };
}

export function buildRRule(r) {
  const p = [`FREQ=${{ daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[r.freq]}`];
  if (r.interval > 1) p.push(`INTERVAL=${r.interval}`);
  if (r.byday?.length) p.push(`BYDAY=${r.byday.map(b => `${b.n || ''}${b.day}`).join(',')}`);
  if (r.bymonthday?.length) p.push(`BYMONTHDAY=${r.bymonthday.join(',')}`);
  if (r.until) p.push(`UNTIL=${r.until.replace(/-/g, '')}`);
  else if (r.count) p.push(`COUNT=${r.count}`);
  return p.join(';');
}

// the dates ('YYYY-MM-DD') of the rule that fall in [from, to], the series starting on `start`
export function expandDates(rule, start, from, to, { exdates = [], max = 800 } = {}) {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule;
  if (!r || !start) return [];
  const s = toDays(start), lo = Math.max(toDays(from || start), s), hi = Math.min(toDays(to || start), r.until ? toDays(r.until) : Infinity);
  const skip = new Set(exdates || []);
  const out = []; let made = 0, guard = 0;
  const take = d => {                                    // false = stop
    if (d < s) return true;
    made++;
    if (r.count && made > r.count) return false;
    if (d > hi) return false;
    const date = fromDays(d);
    if (d >= lo && !skip.has(date)) out.push(date);
    return out.length < max;
  };
  if (r.freq === 'daily') {
    for (let d = s; guard++ < 20000; d += r.interval) if (!take(d)) break;
  } else if (r.freq === 'weekly') {
    const days = (r.byday.length ? r.byday.map(b => b.day) : [DOW[dowOfDate(start)]]).map(x => WEEK_OFFSET[x]).sort((a, b) => a - b);
    const monday = s - ((dowOfDate(start) + 6) % 7);
    outer: for (let w = 0; guard++ < 5000; w += r.interval) for (const off of days) { const d = monday + w * 7 + off; if (d < s) continue; if (!take(d)) break outer; }
  } else {
    const [sy, sm, sd] = start.split('-').map(Number);
    outer2: for (let k = 0; guard++ < 2000; k += r.interval) {
      const y = sy + Math.floor((sm - 1 + k) / 12), m = ((sm - 1 + k) % 12) + 1, n = daysIn(y, m), first = toDays(ymdOf(y, m, 1));
      if (first > hi + 31) break;
      let ds = [];
      const nth = r.byday.length ? r.byday : null;
      if (nth) {
        for (const b of nth) {
          const dow = DOW.indexOf(b.day), firstDow = (new Date(first * 86400000).getUTCDay());
          const firstHit = 1 + ((dow - firstDow + 7) % 7);                         // day-of-month of the 1st such weekday
          const hits = []; for (let d = firstHit; d <= n; d += 7) hits.push(d);
          if (!b.n) ds.push(...hits); else if (b.n > 0 && hits[b.n - 1]) ds.push(hits[b.n - 1]); else if (b.n < 0 && hits[hits.length + b.n]) ds.push(hits[hits.length + b.n]);
        }
      } else {
        for (const x of (r.bymonthday.length ? r.bymonthday : [sd])) { const d = x > 0 ? x : n + x + 1; if (d >= 1 && d <= n) ds.push(d); }
      }
      ds = [...new Set(ds)].sort((a, b) => a - b);
      for (const d of ds) if (!take(first + d - 1)) break outer2;
    }
  }
  return out;
}

// the first date on/after `from` that the rule produces, with the rule anchored at `from` (a new series: DTSTART = this date)
export function firstOccurrence(rule, from) {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule;
  if (!r) return null;
  return expandDates({ ...r, count: null, until: null }, from, from, addDays(from, 800), { max: 1 })[0] || null;
}

// a row of calendar_events + a window → its occurrences ({ ...row, start_time, end_time, occ_date, is_series }). Times are Bangkok.
export function expandRow(row, fromDate, toDate, tz = 'Asia/Bangkok') {
  if (!row?.recurrence_rule) return [];
  const off = tz === 'Asia/Bangkok' ? 7 : 0;
  const local = new Date(Date.parse(row.start_time) + off * 3600e3);
  const startDate = ymdOf(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
  const hhmm = `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
  const dur = row.end_time ? Math.max(0, Date.parse(row.end_time) - Date.parse(row.start_time)) : 0;
  const suffix = off === 7 ? '+07:00' : '+00:00';
  const ex = Array.isArray(row.recur_exdates) ? row.recur_exdates : [];
  return expandDates(row.recurrence_rule, startDate, fromDate, toDate, { exdates: ex }).map(d => {
    const start = `${d}T${hhmm}:00${suffix}`;
    return { ...row, start_time: start, end_time: row.end_time ? new Date(Date.parse(start) + dur).toISOString() : null, occ_date: d, is_series: true };
  });
}

const MON_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const dateTh = s => { const [y, m, d] = String(s).split('-').map(Number); return `${d} ${MON_TH[m - 1]} ${y + 543}`; };

export function describeRule(rule) {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule;
  if (!r) return '';
  const days = r.byday.map(b => b.day);
  let t;
  if (r.freq === 'daily') t = r.interval === 1 ? 'ทุกวัน' : `ทุก ${r.interval} วัน`;
  else if (r.freq === 'weekly') {
    const set = new Set(days), has = x => x.every(d => set.has(d));
    let which = '';
    if (days.length === 7) which = '';
    else if (days.length === 5 && has(['MO', 'TU', 'WE', 'TH', 'FR'])) which = 'วันจันทร์-ศุกร์';
    else if (days.length === 2 && has(['SA', 'SU'])) which = 'วันเสาร์-อาทิตย์';
    else if (days.length) which = 'วัน' + ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].filter(d => set.has(d)).map(d => DAY_TH[d]).join(' ');
    t = days.length === 7 ? (r.interval === 1 ? 'ทุกวัน' : `ทุก ${r.interval} สัปดาห์ ทุกวัน`) : r.interval === 1 ? `ทุก${which || 'สัปดาห์'}` : `ทุก ${r.interval} สัปดาห์${which ? ' ' + which : ''}`;
  } else {
    const every = r.interval === 1 ? 'ทุกเดือน' : `ทุก ${r.interval} เดือน`;
    if (r.byday.length) t = `${every} ` + r.byday.map(b => `วัน${DAY_TH[b.day]}${b.n === 0 ? 'ทุกสัปดาห์' : b.n < 0 ? 'สุดท้าย' : `ที่ ${b.n}`}`).join(' ');
    else if (r.bymonthday.length === 1 && r.bymonthday[0] === -1) t = r.interval === 1 ? 'ทุกสิ้นเดือน' : `${every} วันสุดท้ายของเดือน`;
    else t = r.bymonthday.length ? `${every} วันที่ ${r.bymonthday.map(n => (n === -1 ? 'สุดท้าย' : n)).join(', ')}` : every;
  }
  if (r.until) t += ` · ถึง ${dateTh(r.until)}`; else if (r.count) t += ` · ${r.count} ครั้ง`;
  return t;
}
