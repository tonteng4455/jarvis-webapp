// the service worker's push handlers, run against a tiny fake of the worker scope
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const listeners = {}; const shown = []; const opened = []; const focused = [];
  const clientsList = [];
  const self = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } },
    clients: { matchAll: async () => clientsList, openWindow: async (u) => { opened.push(u); }, claim: async () => {} },
    skipWaiting() {},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, caches: { keys: async () => [], open: async () => ({}), delete: async () => {} }, fetch: async () => {}, URL, Response, console });
  const run = async (type, ev) => { let p; listeners[type]({ ...ev, waitUntil: x => { p = x; } }); await p; };
  return { shown, opened, clientsList, focused, run };
}

test('push: shows the payload as a notification (always, iOS requires it)', async () => {
  const w = load();
  await w.run('push', { data: { json: () => ({ title: '⏰ อีก 20 นาที: ส่งรายงาน', body: 'ครบกำหนด วันนี้ 10:20', tag: 'task-1', url: '/dashboard/tasks' }) } });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, '⏰ อีก 20 นาที: ส่งรายงาน');
  assert.equal(w.shown[0].opts.tag, 'task-1'); assert.equal(w.shown[0].opts.renotify, true);
  assert.equal(w.shown[0].opts.data.url, '/dashboard/tasks'); assert.equal(w.shown[0].opts.icon, '/icon-192.png');
});

test('push with no / broken payload still shows something', async () => {
  const w = load();
  await w.run('push', { data: null });
  await w.run('push', { data: { json: () => { throw new Error('bad'); }, text: () => 'ข้อความดิบ' } });
  assert.equal(w.shown.length, 2); assert.equal(w.shown[0].title, 'Jarvis'); assert.equal(w.shown[1].opts.body, 'ข้อความดิบ');
  assert.equal(w.shown[0].opts.data.url, '/dashboard/today');
});

test('click: focuses an open window and navigates, else opens a new one', async () => {
  const w = load(); let closed = false;
  const ev = { notification: { close: () => { closed = true; }, data: { url: '/dashboard/tasks' } } };
  await w.run('notificationclick', ev);
  assert.ok(closed); assert.deepEqual(w.opened, ['/dashboard/tasks']);
  const nav = []; w.clientsList.push({ focus: async () => { nav.push('focus'); }, navigate: async (u) => { nav.push(u); } });
  await w.run('notificationclick', ev);
  assert.deepEqual(nav, ['focus', '/dashboard/tasks']); assert.equal(w.opened.length, 1);
});
