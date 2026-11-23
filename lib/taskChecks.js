// lib/taskChecks.js — the checkboxes inside a task's details ("[ ] item" / "[x] item ✓2026-11-23 08:10"): progress, tick times,
// and the two rules that tie them to the task itself:
//   · ticking the LAST open sub-item completes the task; un-ticking one of a finished task re-opens it   (checkEvent)
//   · completing the task ticks every sub-item that was still open, with the same moment               (completeAllChecks)
// Progress counts only the top level (items that are not indented); completing ticks every level. Pure — no DOM, no database.
import { parseContent, serializeBlocks } from './noteBlocks.js';

const BKK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// "2026-11-23 08:10" — the moment as Bangkok time, the form stored in the text
export function stampNow(date = new Date()) {
  const p = Object.fromEntries(BKK.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const checks = details => parseContent(details || '').filter(b => b.type === 'check');

// → { done, total, pct } for the top-level checkboxes (total 0 = this task has no sub-items)
export function checkCounts(details) {
  const top = checks(details).filter(b => b.indent === 0);
  const done = top.filter(b => b.checked).length;
  return { done, total: top.length, pct: top.length ? Math.round((done / top.length) * 100) : 0 };
}

// what a change of the details means for the task: 'complete' (the last open sub-item was just ticked), 'reopen' (a ticked one was
// un-ticked) or null. Only a tick / un-tick counts: adding, removing or retyping items never changes whether the task is done.
export function checkEvent(before, after) {
  const a = checkCounts(before), b = checkCounts(after);
  if (!b.total || a.total !== b.total) return null;
  if (b.done === b.total && b.done > a.done) return 'complete';
  if (b.done < a.done) return 'reopen';
  return null;
}

// the details with every open checkbox (at any level) ticked and stamped → text, or null when there was nothing open
export function completeAllChecks(details, stamp = stampNow()) {
  const blocks = parseContent(details || '');
  let any = false;
  const out = blocks.map(b => { if (b.type === 'check' && !b.checked) { any = true; return { ...b, checked: true, doneAt: stamp }; } return b; });
  return any ? serializeBlocks(out) : null;
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// "2026-11-23 08:10" → "23 พ.ย. 08:10" (the year is added when it is not this year: "23 พ.ย. 2569 08:10")
export function formatStamp(stamp, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(stamp || ''));
  if (!m) return '';
  const thisYear = stampNow(now).slice(0, 4);
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]}${m[1] === thisYear ? '' : ` ${Number(m[1]) + 543}`} ${m[4]}:${m[5]}`;
}
// a timestamp from the database (ISO) → the same form
export const formatMoment = (iso, now = new Date()) => (iso && !Number.isNaN(Date.parse(iso)) ? formatStamp(stampNow(new Date(iso)), now) : '');
