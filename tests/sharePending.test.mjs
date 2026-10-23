// node --test tests/ — shared text parked on the device (lib/sharePending.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanShare, shareToText, stashShare, readShare, clearShare } from '../lib/sharePending.js';

const store = {}; globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

test('cleanShare: trims, caps, and returns null for nothing', () => {
  assert.equal(cleanShare({}), null);
  assert.equal(cleanShare({ title: '  ', text: '', url: null }), null);
  assert.deepEqual(cleanShare({ title: ' a ', text: ' b\u0000c ', url: 'https://x.y' }), { title: 'a', text: 'bc', url: 'https://x.y' });
  assert.equal(cleanShare({ text: 'x'.repeat(30000) }).text.length, 20000);
  assert.equal(cleanShare({ text: 'a\r\nb\rc' }).text, 'a\nb\nc');   // a form POST sends CRLF
});

test('shareToText: text first, title only when it adds something, link only when not already inside', () => {
  assert.equal(shareToText({ text: 'ประชุมพรุ่งนี้ 10 โมง' }), 'ประชุมพรุ่งนี้ 10 โมง');
  assert.equal(shareToText({ title: 'หัวข้อ', text: 'เนื้อหา' }), 'หัวข้อ\n\nเนื้อหา');
  assert.equal(shareToText({ title: 'เนื้อหา', text: 'เนื้อหา ยาว' }), 'เนื้อหา ยาว');
  assert.equal(shareToText({ text: 'ดู https://a.b/c', url: 'https://a.b/c' }), 'ดู https://a.b/c');
  assert.equal(shareToText({ text: 'ดูนี่', url: 'https://a.b/c' }), 'ดูนี่\n\nhttps://a.b/c');
  assert.equal(shareToText({ title: 'แค่หัวข้อ' }), 'แค่หัวข้อ');
});

test('stash / read / clear, with a 6 hour expiry', () => {
  assert.equal(readShare(), null);
  assert.equal(stashShare({ text: 'hello' }, 1000), true);
  assert.deepEqual(readShare(1000 + 3600e3), { title: '', text: 'hello', url: '' });
  assert.equal(readShare(1000 + 7 * 3600e3), null);          // expired → also removed
  assert.equal(readShare(1000 + 3600e3), null);
  assert.equal(stashShare({}), false);
  stashShare({ text: 'x' }); clearShare(); assert.equal(readShare(), null);
  store['jarvis-share'] = '{not json'; assert.equal(readShare(), null);
});
