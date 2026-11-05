// lib/space.js — who may open a group space (membership comes from the bot Worker / LINE; here the mock bot answers)
process.env.SESSION_SECRET = 'testtesttesttesttesttesttesttest12';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createSessionToken } = await import('../lib/session.js');
const space = await import('../lib/space.js');
// a fake bot Worker: LINE's answers for four groups
const GROUPS = { Cmockteam0001: { name: 'ทีมก่อสร้าง', members: ['mock-user', 'mock-other'] }, Cmocknotme003: { name: 'x', members: ['mock-other'] }, Cmockdown0004: { name: 'down', members: ['mock-user'], down: true } };
space.setBotCaller(async (path, p) => {
  const g = GROUPS[p.groupId];
  if (path === '/internal/group-member') return !g ? { ok: true, member: false } : g.down ? { ok: false, error: 'line_502' } : { ok: true, member: g.members.includes(p.userId), displayName: 'n' };
  return g ? { ok: true, name: g.name, memberCount: g.members.length } : { ok: false };
});

const jar = (obj) => { const m = new Map(Object.entries(obj)); return { get: k => m.has(k) ? { value: m.get(k) } : undefined, delete: k => m.delete(k), _m: m }; };
const login = async (id, name = 'x') => ({ jarvis_session: await createSessionToken({ lineUserId: id, displayName: name, pictureUrl: null }) });

test('parseSpace / isGroupId only accept LINE group (C…) and room (R…) ids', () => {
  assert.equal(space.parseSpace('g:Cmockteam0001'), 'Cmockteam0001');
  assert.equal(space.parseSpace('g:Rroom00001'), 'Rroom00001');
  for (const bad of ['', null, 'personal', 'g:Uperson1234', 'g:C', 'g:C bad id', 'Cmockteam0001', 'g:../etc']) assert.equal(space.parseSpace(bad), null, String(bad));
  assert.ok(space.isGroupId('Cmockteam0001') && !space.isGroupId('Uabc12345'));
});

test('a member gets the group as the owner (actorId = the real person); lineUserId is the group id', async () => {
  space.forgetSpaceCaches();
  const cj = jar({ ...await login('mock-user', 'Tester'), jarvis_space: 'g:Cmockteam0001' });
  const r = await space.getSpaceSession(cj);
  assert.equal(r.session.lineUserId, 'Cmockteam0001');
  assert.equal(r.session.actorId, 'mock-user');
  assert.equal(r.session.space, 'group');
  assert.equal(r.space.id, 'Cmockteam0001');
});

test('no space cookie → the normal personal session, untouched', async () => {
  const r = await space.getSpaceSession(jar(await login('mock-user')));
  assert.equal(r.session.lineUserId, 'mock-user'); assert.equal(r.session.space, undefined); assert.equal(r.space, null);
});

test('not signed in → no session', async () => {
  const r = await space.getSpaceSession(jar({ jarvis_space: 'g:Cmockteam0001' }));
  assert.equal(r.session, null);
});

test('somebody who is NOT in the group never gets its data: the cookie is dropped and the PERSONAL session comes back', async () => {
  space.forgetSpaceCaches();
  const cj = jar({ ...await login('mock-user'), jarvis_space: 'g:Cmocknotme003' });
  const r = await space.getSpaceSession(cj);
  assert.equal(r.session.lineUserId, 'mock-user'); assert.equal(r.kicked, 'Cmocknotme003');
  assert.equal(cj._m.has('jarvis_space'), false);
});

test('LINE failing is never treated as "member"', async () => {
  space.forgetSpaceCaches();
  const cj = jar({ ...await login('mock-user'), jarvis_space: 'g:Cmockdown0004' });
  const r = await space.getSpaceSession(cj);
  assert.equal(r.session.lineUserId, 'mock-user'); assert.equal(r.session.space, undefined);
  const m = await space.checkMember('Cmockdown0004', 'mock-user');
  assert.equal(m.member, false); assert.ok(m.error);
});

test('an unknown group id is not a member; a made-up id is refused before any call', async () => {
  space.forgetSpaceCaches();
  assert.equal((await space.checkMember('Cdoesnotexist1', 'mock-user')).member, false);
  assert.equal((await space.checkMember('not-a-group', 'mock-user')).member, false);
  assert.equal((await space.checkMember('Cmockteam0001', '')).member, false);
});

test('answers are cached (yes 5 min, no 30 s) so every API call is not a LINE call', async () => {
  space.forgetSpaceCaches();
  const t0 = 1_000_000;
  assert.equal((await space.checkMember('Cmockteam0001', 'mock-user', t0)).member, true);
  // the mock bot would now say "not a member" for this id; the cached "yes" still holds within 5 minutes …
  const g = GROUPS.Cmockteam0001; const keep = [...g.members]; g.members.length = 0;
  assert.equal((await space.checkMember('Cmockteam0001', 'mock-user', t0 + 4 * 60e3)).member, true);
  // … and is asked again after it
  assert.equal((await space.checkMember('Cmockteam0001', 'mock-user', t0 + 6 * 60e3)).member, false);
  g.members.push(...keep);
  assert.equal((await space.checkMember('Cmockteam0001', 'mock-user', t0 + 6 * 60e3 + 10e3)).member, false);          // the "no" is cached for 30 s
  assert.equal((await space.checkMember('Cmockteam0001', 'mock-user', t0 + 6 * 60e3 + 40e3)).member, true);
});

test('groups-opened-on-this-device cookie: round trip, junk is ignored, at most 8', () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ id: 'Cgroup' + String(i).padStart(4, '0'), name: 'กลุ่ม ' + i }));
  const v = space.groupsCookieValue(list);
  const back = space.readGroupsCookie({ get: () => ({ value: v }) });
  assert.equal(back.length, 8); assert.equal(back[0].name, 'กลุ่ม 0');
  assert.deepEqual(space.readGroupsCookie({ get: () => ({ value: '%7Bnot json' }) }), []);
  assert.deepEqual(space.readGroupsCookie({ get: () => ({ value: encodeURIComponent(JSON.stringify([{ id: 'Uperson0001', name: 'x' }, { id: 'Cok00000001', name: 'ok' }])) }) }).map(g => g.id), ['Cok00000001']);
});

test('insertRow stamps created_by in a group space and retries without it when the column is missing', async () => {
  const calls = [];
  const sb = (failOnStamp) => ({ from: () => ({ insert: (row) => ({ select: () => ({ single: async () => { calls.push(row); return failOnStamp && row.created_by ? { data: null, error: { message: "column created_by of relation notes does not exist" } } : { data: { id: 1, ...row }, error: null }; } }) }) }) });
  const grp = { space: 'group', actorId: 'U1', lineUserId: 'C1' };
  let r = await space.insertRow(sb(false), 'notes', { title: 'a' }, grp);
  assert.equal(r.data.created_by, 'U1');
  calls.length = 0; r = await space.insertRow(sb(true), 'notes', { title: 'b' }, grp);
  assert.equal(r.error, null); assert.equal(calls.length, 2); assert.equal('created_by' in calls[1], false);
  calls.length = 0; r = await space.insertRow(sb(true), 'notes', { title: 'c' }, { lineUserId: 'U1' });
  assert.equal('created_by' in calls[0], false);                              // a personal row never carries it
});
