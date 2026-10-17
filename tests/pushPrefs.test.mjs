import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrefs, parsePrefsInput, PUSH_DEFAULTS } from '../lib/pushPrefs.js';

test('defaults when nothing is stored', () => {
  assert.deepEqual(normalizePrefs(null), PUSH_DEFAULTS);
  assert.deepEqual(normalizePrefs({}), PUSH_DEFAULTS);
});
test('bad stored values fall back per field', () => {
  const p = normalizePrefs({ lead: 7, morningTime: '25:00', quietFrom: 'abc', atDue: false, morning: 'yes' });
  assert.equal(p.lead, 30); assert.equal(p.morningTime, '08:00'); assert.equal(p.quietFrom, '22:00');
  assert.equal(p.atDue, false); assert.equal(p.morning, true);
});
test('PUT input: only valid known keys, otherwise rejected', () => {
  assert.deepEqual(parsePrefsInput({ lead: 10 }), { lead: 10 });
  assert.deepEqual(parsePrefsInput({ morning: false, morningTime: '07:30', evil: 1 }), { morning: false, morningTime: '07:30' });
  assert.equal(parsePrefsInput({ lead: 11 }), null);
  assert.equal(parsePrefsInput({ morningTime: '8am' }), null);
  assert.equal(parsePrefsInput({ atDue: 'true' }), null);
  assert.equal(parsePrefsInput({}), null);
  assert.equal(parsePrefsInput(null), null);
});
