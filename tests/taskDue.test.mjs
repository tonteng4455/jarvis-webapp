import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDue, dueInputs, formatDue, dueState, dueLabel, sortTasks, dueSoon, thaiDateKey } from '../lib/taskDue.js';

const at = s => Date.parse(s);                     // helper: ISO with +07:00
const NOW = at('2026-10-16T10:00:00+07:00');

test('buildDue: date only = end of that day, all-day; with time = that moment', () => {
  const a = buildDue('2026-10-20', '');
  assert.equal(a.due_all_day, true); assert.equal(a.due_at, '2026-10-20T16:59:00.000Z');   // 23:59 Thai time
  const b = buildDue('2026-10-20', '17:30');
  assert.equal(b.due_all_day, false); assert.equal(b.due_at, '2026-10-20T10:30:00.000Z');
  assert.equal(buildDue('', '10:00'), null); assert.equal(buildDue('20/10/2026', ''), null);
  assert.equal(buildDue('2026-10-20', '9:05').due_at, '2026-10-20T02:05:00.000Z');
});

test('dueInputs is the inverse of buildDue', () => {
  for (const [d, t] of [['2026-10-20', '17:30'], ['2026-01-02', ''], ['2026-12-31', '00:05']]) {
    const due = buildDue(d, t);
    assert.deepEqual(dueInputs(due), { date: d, time: t });
  }
  assert.deepEqual(dueInputs({}), { date: '', time: '' });
});

test('dates are judged in Thai time, not UTC', () => {
  // 00:30 Thai time on the 17th is still the 16th in UTC
  assert.equal(thaiDateKey(at('2026-10-17T00:30:00+07:00')), '2026-10-17');
  assert.equal(formatDue(buildDue('2026-10-17', '00:30'), at('2026-10-16T23:50:00+07:00')), 'พรุ่งนี้ 00:30');
});

test('formatDue / dueState / dueLabel', () => {
  const t = (d, tm, extra = {}) => ({ ...buildDue(d, tm), ...extra });
  assert.equal(formatDue(t('2026-10-16', '17:00'), NOW), 'วันนี้ 17:00');
  assert.equal(formatDue(t('2026-10-17', ''), NOW), 'พรุ่งนี้');
  assert.equal(formatDue(t('2026-10-22', '09:00'), NOW), 'พฤ. 22 ต.ค. 09:00');
  assert.equal(formatDue(t('2027-01-05', ''), NOW), 'อ. 5 ม.ค. 2570');
  assert.equal(formatDue({}, NOW), '');
  assert.equal(dueState(t('2026-10-16', '17:00'), NOW), 'today');
  assert.equal(dueState(t('2026-10-16', '09:00'), NOW), 'overdue');
  assert.equal(dueState(t('2026-10-16', ''), NOW), 'today');            // all-day = until the end of the day
  assert.equal(dueState(t('2026-10-17', ''), NOW), 'soon');
  assert.equal(dueState(t('2026-10-25', ''), NOW), 'later');
  assert.equal(dueState(t('2026-10-10', '', { is_done: true }), NOW), null);
  assert.equal(dueState({ task_name: 'x' }, NOW), null);
  assert.equal(dueLabel(t('2026-10-14', ''), NOW), 'เลยกำหนด 2 วัน');
  assert.equal(dueLabel(t('2026-10-16', '06:00'), NOW), 'เลยกำหนด 4 ชม.');
  assert.equal(dueLabel(t('2026-10-16', '09:50'), NOW), 'เลยกำหนดแล้ว');
});

test('sortTasks: open first, soonest due first, undated last', () => {
  const mk = (n, due, extra = {}) => ({ task_name: n, created_at: '2026-10-01T00:00:00Z', ...(due ? buildDue(due, '') : {}), ...extra });
  const s = sortTasks([mk('none'), mk('late', '2026-10-30'), mk('done', '2026-10-01', { is_done: true }), mk('soon', '2026-10-17')]);
  assert.deepEqual(s.map(x => x.task_name), ['soon', 'late', 'none', 'done']);
});

test('dueSoon: overdue and due-today only, never archived/done', () => {
  const mk = (n, d, tm, extra = {}) => ({ task_name: n, ...buildDue(d, tm), ...extra });
  const r = dueSoon([mk('a', '2026-10-15', ''), mk('b', '2026-10-16', '17:00'), mk('c', '2026-10-17', ''), mk('d', '2026-10-15', '', { is_done: true }), mk('e', '2026-10-15', '', { archived: true })], NOW);
  assert.deepEqual(r.overdue.map(x => x.task_name), ['a']);
  assert.deepEqual(r.today.map(x => x.task_name), ['b']);
});
