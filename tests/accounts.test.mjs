import test from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleKey, isLineKey, mergeTarget, GOOGLE_PREFIX } from '../lib/accounts.js';

test('keys: a Google-only person has a google: key, anything else is a LINE key', () => {
  assert.equal(isGoogleKey(GOOGLE_PREFIX + '123'), true);
  assert.equal(isLineKey('U1234567890abcdef1234567890abcdef'), true);
  assert.equal(isLineKey(GOOGLE_PREFIX + '123'), false);
  assert.equal(isLineKey(''), false);
  assert.equal(isLineKey(null), false);
});

test('joining two accounts: the LINE key always survives (the bot needs it)', () => {
  assert.deepEqual(mergeTarget('Uline', 'google:1'), { to: 'Uline', from: 'google:1' });
  assert.deepEqual(mergeTarget('google:1', 'Uline'), { to: 'Uline', from: 'google:1' });
});

test('joining two accounts of the same kind: the one signed in now survives', () => {
  assert.deepEqual(mergeTarget('google:1', 'google:2'), { to: 'google:1', from: 'google:2' });
  assert.deepEqual(mergeTarget('Ua', 'Ub'), { to: 'Ua', from: 'Ub' });
});
