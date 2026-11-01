import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStart, startPath, startFromCookieString, START_COOKIE } from '../lib/startPage.js';

test('the start page is the chat unless the person chose "today"', () => {
  assert.equal(normalizeStart(undefined), 'chat');
  assert.equal(normalizeStart('whatever'), 'chat');
  assert.equal(normalizeStart('today'), 'today');
  assert.equal(startPath('today'), '/dashboard/today');
  assert.equal(startPath('chat'), '/dashboard/chat');
  assert.equal(startPath(undefined), '/dashboard/chat');
});

test('it is read out of a Cookie header (other cookies around it, nothing set, junk)', () => {
  assert.equal(startFromCookieString(`a=1; ${START_COOKIE}=today; b=2`), 'today');
  assert.equal(startFromCookieString(`${START_COOKIE}=today`), 'today');
  assert.equal(startFromCookieString(`x${START_COOKIE}=today`), 'chat');           // another cookie's name that merely ends the same
  assert.equal(startFromCookieString('a=1; b=2'), 'chat');
  assert.equal(startFromCookieString(''), 'chat');
  assert.equal(startFromCookieString(null), 'chat');
  assert.equal(startFromCookieString(`${START_COOKIE}=%E0%A4%A`), 'chat');
});
