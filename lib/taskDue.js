// lib/taskDue.js — due date/time of a task. Pure (no React / DOM) so it can be tested.
//
// A task stores `due_at` (timestamptz) and `due_all_day` (boolean). With no time of day the due
// moment is 23:59 of that day and `due_all_day` is true (shown as just the date). Everything is
// read and written in Thailand time (UTC+7, no DST) so the web app and the LINE bot agree.

const TZ_MS = 7 * 3600e3;
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const pad = n => String(n).padStart(2, '0');

// → { y, m, d, h, mi, dow } in Thai time
export function thaiParts(ms) {
  const t = new Date(ms + TZ_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
}
export const thaiDateKey = ms => { const p = thaiParts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const dayNumber = ms => { const p = thaiParts(ms); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000); };

// ("2026-10-20", "17:30" | "") → { due_at, due_all_day } | null
export function buildDue(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const hasTime = /^\d{1,2}:\d{2}$/.test(timeStr || '');
  const time = hasTime ? timeStr.padStart(5, '0') : '23:59';
  const ms = Date.parse(`${dateStr}T${time}:00+07:00`);
  if (Number.isNaN(ms)) return null;
  return { due_at: new Date(ms).toISOString(), due_all_day: !hasTime };
}

// the inputs of the picker ← a task
export function dueInputs(task) {
  if (!task?.due_at) return { date: '', time: '' };
  const ms = Date.parse(task.due_at); if (Number.isNaN(ms)) return { date: '', time: '' };
  const p = thaiParts(ms);
  return { date: thaiDateKey(ms), time: task.due_all_day ? '' : `${pad(p.h)}:${pad(p.mi)}` };
}

// "วันนี้ 17:30" · "พรุ่งนี้" · "พฤ. 22 ต.ค. 09:00"
export function formatDue(task, nowMs = Date.now()) {
  if (!task?.due_at) return '';
  const ms = Date.parse(task.due_at); if (Number.isNaN(ms)) return '';
  const diff = dayNumber(ms) - dayNumber(nowMs);
  const p = thaiParts(ms);
  const time = task.due_all_day ? '' : ` ${pad(p.h)}:${pad(p.mi)}`;
  if (diff === 0) return `วันนี้${time}`;
  if (diff === 1) return `พรุ่งนี้${time}`;
  if (diff === -1) return `เมื่อวาน${time}`;
  const yearPart = thaiParts(nowMs).y === p.y ? '' : ` ${p.y + 543}`;
  return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]}${yearPart}${time}`;
}

// 'overdue' | 'today' | 'soon' (tomorrow) | 'later' | null (no due date / finished)
export function dueState(task, nowMs = Date.now()) {
  if (!task?.due_at || task.is_done) return null;
  const ms = Date.parse(task.due_at); if (Number.isNaN(ms)) return null;
  if (ms < nowMs) return 'overdue';
  const diff = dayNumber(ms) - dayNumber(nowMs);
  return diff === 0 ? 'today' : diff === 1 ? 'soon' : 'later';
}

// "เลยกำหนด 2 วัน" / "เลยกำหนด 3 ชม." for the overdue ones, else formatDue
export function dueLabel(task, nowMs = Date.now()) {
  const st = dueState(task, nowMs);
  if (st !== 'overdue') return formatDue(task, nowMs);
  const ms = Date.parse(task.due_at);
  const days = dayNumber(nowMs) - dayNumber(ms);
  if (days >= 1) return `เลยกำหนด ${days} วัน`;
  const hours = Math.max(1, Math.floor((nowMs - ms) / 3600e3));
  return hours >= 1 && nowMs - ms >= 3600e3 ? `เลยกำหนด ${hours} ชม.` : 'เลยกำหนดแล้ว';
}

// open tasks first; among them the soonest due first, no due date last; then newest first
export function sortTasks(tasks) {
  const key = t => (t.due_at ? Date.parse(t.due_at) : Infinity);
  return [...tasks].sort((a, b) =>
    (Number(!!a.is_done) - Number(!!b.is_done)) ||
    (key(a) - key(b) || 0) ||
    String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// What the "คุณมีงานครบกำหนด" banner shows: open tasks that are overdue or due today.
export function dueSoon(tasks, nowMs = Date.now()) {
  const overdue = [], today = [];
  for (const t of tasks || []) {
    if (t.archived) continue;
    const st = dueState(t, nowMs);
    if (st === 'overdue') overdue.push(t); else if (st === 'today') today.push(t);
  }
  const byDue = (a, b) => Date.parse(a.due_at) - Date.parse(b.due_at);
  return { overdue: overdue.sort(byDue), today: today.sort(byDue) };
}
