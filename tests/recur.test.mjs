import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRRule, buildRRule, expandDates, firstOccurrence, expandRow, describeRule } from '../lib/recur.js';

const dates = (rule, start, from, to, o) => expandDates(rule, start, from, to, o);

test('daily: every day, every 3 days, until a date, a number of times', () => {
  assert.deepEqual(dates('FREQ=DAILY', '2026-11-02', '2026-11-02', '2026-11-05'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(dates('FREQ=DAILY;INTERVAL=3', '2026-11-02', '2026-11-01', '2026-11-12'), ['2026-11-02', '2026-11-05', '2026-11-08', '2026-11-11']);
  assert.deepEqual(dates('FREQ=DAILY;UNTIL=20261104', '2026-11-02', '2026-11-01', '2026-12-31'), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepEqual(dates('FREQ=DAILY;COUNT=2', '2026-11-02', '2026-11-01', '2026-12-31'), ['2026-11-02', '2026-11-03']);
});

test('weekly: one weekday, several weekdays, weekdays only, every 2 weeks', () => {
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO', '2026-11-02', '2026-11-01', '2026-11-30'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-11-02', '2026-11-02', '2026-11-08'), ['2026-11-02', '2026-11-04', '2026-11-06']);
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-11-06', '2026-11-06', '2026-11-10'), ['2026-11-06', '2026-11-09', '2026-11-10']);
  assert.deepEqual(dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE', '2026-11-04', '2026-11-01', '2026-12-10'), ['2026-11-04', '2026-11-18', '2026-12-02']);
  assert.deepEqual(dates('FREQ=WEEKLY', '2026-11-04', '2026-11-01', '2026-11-20'), ['2026-11-04', '2026-11-11', '2026-11-18']);       // no BYDAY: the start's weekday
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=SU,SA', '2026-11-01', '2026-11-01', '2026-11-08'), ['2026-11-01', '2026-11-07', '2026-11-08']);
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3', '2026-11-02', '2026-11-01', '2026-12-31'), ['2026-11-02', '2026-11-04', '2026-11-09']);
});

test('monthly: a day of the month, the last day, the nth / last weekday, every 2 months', () => {
  assert.deepEqual(dates('FREQ=MONTHLY;BYMONTHDAY=5', '2026-11-05', '2026-11-01', '2027-02-28'), ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05']);
  assert.deepEqual(dates('FREQ=MONTHLY;BYMONTHDAY=-1', '2026-11-30', '2026-11-01', '2027-02-28'), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  assert.deepEqual(dates('FREQ=MONTHLY;BYMONTHDAY=31', '2026-10-31', '2026-10-01', '2027-01-31'), ['2026-10-31', '2026-12-31', '2027-01-31']);       // months without a 31st are skipped
  assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=2MO', '2026-11-09', '2026-11-01', '2027-01-31'), ['2026-11-09', '2026-12-14', '2027-01-11']);
  assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=-1FR', '2026-11-27', '2026-11-01', '2027-01-31'), ['2026-11-27', '2026-12-25', '2027-01-29']);
  assert.deepEqual(dates('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=5', '2026-11-05', '2026-11-01', '2027-04-30'), ['2026-11-05', '2027-01-05', '2027-03-05']);
  assert.deepEqual(dates('FREQ=MONTHLY', '2026-11-17', '2026-11-01', '2027-01-31'), ['2026-11-17', '2026-12-17', '2027-01-17']);          // no BYMONTHDAY: the start's day
});

test('exdates are taken out, the window is respected, huge windows stay bounded', () => {
  assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO', '2026-11-02', '2026-11-01', '2026-11-30', { exdates: ['2026-11-09'] }), ['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(dates('FREQ=DAILY', '2026-01-01', '2026-11-10', '2026-11-12'), ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.ok(dates('FREQ=DAILY', '2026-01-01', '2026-01-01', '2040-01-01').length <= 800);
});

test('the first occurrence of a new series, and the rule round-trips', () => {
  assert.equal(firstOccurrence('FREQ=WEEKLY;BYDAY=MO', '2026-11-04'), '2026-11-09');
  assert.equal(firstOccurrence('FREQ=WEEKLY;BYDAY=WE', '2026-11-04'), '2026-11-04');
  assert.equal(firstOccurrence('FREQ=MONTHLY;BYMONTHDAY=5', '2026-11-06'), '2026-12-05');
  assert.equal(firstOccurrence('FREQ=DAILY', '2026-11-04'), '2026-11-04');
  for (const s of ['FREQ=DAILY', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', 'FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20261231', 'FREQ=MONTHLY;BYMONTHDAY=5,20;COUNT=4']) assert.equal(buildRRule(parseRRule(s)), s);
  assert.equal(parseRRule('FREQ=YEARLY'), null);
});

test('a row expands into occurrences with the same time of day and length', () => {
  const row = { id: 'x', title: 'ประชุมทีม', start_time: '2026-11-02T09:00:00+07:00', end_time: '2026-11-02T10:30:00+07:00', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', recur_exdates: ['2026-11-09'] };
  const occ = expandRow(row, '2026-11-01', '2026-11-20');
  assert.deepEqual(occ.map(o => o.occ_date), ['2026-11-02', '2026-11-16']);
  assert.equal(occ[1].start_time, '2026-11-16T09:00:00+07:00');
  assert.equal(Date.parse(occ[1].end_time) - Date.parse(occ[1].start_time), 90 * 60000);
  assert.ok(occ.every(o => o.is_series && o.id === 'x'));
  assert.deepEqual(expandRow({ ...row, recurrence_rule: null }, '2026-11-01', '2026-11-20'), []);
});

test('Thai descriptions', () => {
  assert.equal(describeRule('FREQ=DAILY'), 'ทุกวัน');
  assert.equal(describeRule('FREQ=DAILY;INTERVAL=3'), 'ทุก 3 วัน');
  assert.equal(describeRule('FREQ=WEEKLY;BYDAY=MO'), 'ทุกวันจันทร์');
  assert.equal(describeRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), 'ทุกวันจันทร์-ศุกร์');
  assert.equal(describeRule('FREQ=WEEKLY;BYDAY=MO,WE,FR'), 'ทุกวันจันทร์ พุธ ศุกร์');
  assert.equal(describeRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'), 'ทุก 2 สัปดาห์ วันพุธ');
  assert.equal(describeRule('FREQ=MONTHLY;BYMONTHDAY=5'), 'ทุกเดือน วันที่ 5');
  assert.equal(describeRule('FREQ=MONTHLY;BYMONTHDAY=-1'), 'ทุกสิ้นเดือน');
  assert.equal(describeRule('FREQ=MONTHLY;BYDAY=2MO'), 'ทุกเดือน วันจันทร์ที่ 2');
  assert.equal(describeRule('FREQ=MONTHLY;BYDAY=-1FR'), 'ทุกเดือน วันศุกร์สุดท้าย');
  assert.equal(describeRule('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231'), 'ทุกวันจันทร์ · ถึง 31 ธ.ค. 2569');
  assert.equal(describeRule('FREQ=DAILY;COUNT=10'), 'ทุกวัน · 10 ครั้ง');
});
