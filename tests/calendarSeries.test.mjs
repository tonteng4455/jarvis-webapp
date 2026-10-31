import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSeries, ruleFromForm, localDate } from '../lib/calendarSeries.js';

const row = (extra = {}) => ({ id: 'r1', title: 'ประชุมทีม', start_time: '2026-11-02T09:00:00+07:00', end_time: '2026-11-02T10:00:00+07:00', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', recur_exdates: [], ...extra });

test('expandSeries: one entry per date, each with a unique key and the rule in words', () => {
  const out = expandSeries([row()], '2026-11-01T00:00:00+07:00', '2026-12-01T00:00:00+07:00');
  assert.deepEqual(out.map(o => o.occ_date), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.equal(new Set(out.map(o => o.key)).size, 5);
  assert.ok(out.every(o => o.id === 'r1' && o.is_series && o.series_text === 'ทุกวันจันทร์'));
  assert.ok(out.every(o => /T09:00:00\+07:00$/.test(o.start_time)));
});

test('expandSeries: skipped dates are left out, the window end is exclusive, and times are checked against the window', () => {
  const out = expandSeries([row({ recur_exdates: ['2026-11-09'] })], '2026-11-02T09:00:00+07:00', '2026-11-16T09:00:00+07:00');
  assert.deepEqual(out.map(o => o.occ_date), ['2026-11-02']);
  assert.equal(expandSeries([row()], '2026-11-02T09:00:01+07:00', '2026-11-09T09:00:00+07:00').length, 0);
});

test('expandSeries: merges several series in time order', () => {
  const b = row({ id: 'r2', title: 'วิ่ง', start_time: '2026-11-02T07:00:00+07:00', end_time: '2026-11-02T08:00:00+07:00', recurrence_rule: 'FREQ=DAILY' });
  const out = expandSeries([row(), b], '2026-11-02T00:00:00+07:00', '2026-11-04T00:00:00+07:00');
  assert.deepEqual(out.map(o => `${o.occ_date} ${o.title}`), ['2026-11-02 วิ่ง', '2026-11-02 ประชุมทีม', '2026-11-03 วิ่ง']);
});

test('localDate is the Bangkok date', () => {
  assert.equal(localDate('2026-11-01T18:00:00Z'), '2026-11-02');
  assert.equal(localDate('2026-11-01T16:59:00Z'), '2026-11-01');
});

test('ruleFromForm: the form becomes a rule and the first date on/after the day chosen', () => {
  assert.deepEqual(ruleFromForm(null, '2026-11-02'), { rule: null });
  let r = ruleFromForm({ freq: 'weekly', interval: 1, days: ['MO', 'WE'] }, '2026-11-03');
  assert.equal(r.rule, 'FREQ=WEEKLY;BYDAY=MO,WE');
  assert.equal(r.first, '2026-11-04');
  r = ruleFromForm({ freq: 'weekly', interval: 2 }, '2026-11-02');
  assert.equal(r.rule, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO');                                    // no day chosen → the weekday of the start
  r = ruleFromForm({ freq: 'daily', interval: 3, count: 5 }, '2026-11-02');
  assert.equal(r.rule, 'FREQ=DAILY;INTERVAL=3;COUNT=5');
  r = ruleFromForm({ freq: 'monthly', interval: 1, monthMode: 'day' }, '2026-11-05');
  assert.equal(r.rule, 'FREQ=MONTHLY;BYMONTHDAY=5');
  r = ruleFromForm({ freq: 'monthly', interval: 1, monthMode: 'last' }, '2026-11-05');
  assert.equal(r.rule, 'FREQ=MONTHLY;BYMONTHDAY=-1');
  r = ruleFromForm({ freq: 'monthly', interval: 1, monthMode: 'nth' }, '2026-11-11');           // the 2nd Wednesday
  assert.equal(r.rule, 'FREQ=MONTHLY;BYDAY=2WE');
  r = ruleFromForm({ freq: 'monthly', interval: 1, monthMode: 'nth' }, '2026-11-25');           // the 4th Wednesday
  assert.equal(r.rule, 'FREQ=MONTHLY;BYDAY=4WE');
  r = ruleFromForm({ freq: 'monthly', interval: 1, monthMode: 'nth' }, '2026-12-30');           // a 5th weekday of a month → "the last"
  assert.equal(r.rule, 'FREQ=MONTHLY;BYDAY=-1WE');
  r = ruleFromForm({ freq: 'daily', interval: 1, until: '2026-12-31' }, '2026-11-02');
  assert.equal(r.rule, 'FREQ=DAILY;UNTIL=20261231');
  assert.equal(r.text, 'ทุกวัน · ถึง 31 ธ.ค. 2569');
});

test('ruleFromForm: bad input is refused', () => {
  assert.equal(ruleFromForm({ freq: 'yearly' }, '2026-11-02').error, 'bad_repeat');
  assert.equal(ruleFromForm({ freq: 'daily', until: '2026-10-01' }, '2026-11-02').error, 'until_before_start');
  assert.equal(ruleFromForm({ freq: 'daily', count: 0 }, '2026-11-02').error, undefined);        // 0 / empty count means "no count"
  assert.equal(ruleFromForm({ freq: 'daily', count: 5000 }, '2026-11-02').error, 'bad_count');
  assert.equal(ruleFromForm({ freq: 'daily', interval: 500 }, '2026-11-02').rule, 'FREQ=DAILY;INTERVAL=99');
});
