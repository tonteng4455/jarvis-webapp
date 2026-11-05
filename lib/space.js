// lib/space.js — "spaces": the dashboard shows either the person's own data or a LINE GROUP's data.
//
// A group's notes / tasks / appointments / files are stored exactly like a person's, with the group id as the owner (that is how the bot keeps
// them). So a group space is just "use the group id as the owner" — getSpaceSession() returns the normal session with `lineUserId` swapped for
// the group id, and every route that reads session.lineUserId then works on the group without further change.
//
// Who may open a group: only people LINE says are IN that group. We ask the bot Worker (/internal/group-member → LINE's
// "get group member profile"); the answer is cached briefly in memory (5 min for yes, 30 s for no). LINE failing is NEVER treated as "yes".
// A person who signed in with Google only (no LINE id) has no way to be checked, so groups stay closed to them.

import { getSession } from './session.js';

// the bot Worker is reached through lib/botWorker (loaded on first use); tests plug a fake in with setBotCaller()
let botCaller = null;
export function setBotCaller(fn) { botCaller = fn; }
async function bot(path, payload) {
  if (botCaller) return await botCaller(path, payload);
  const { callBotInternal } = await import('./botWorker');
  return await callBotInternal(path, payload);
}

export const SPACE_COOKIE = 'jarvis_space';        // httpOnly: "g:<group id>" selects a group space, absent = the person's own
export const GROUPS_COOKIE = 'jarvis_groups';      // a convenience list [{id,name}] of groups opened on this device (always re-verified before use)
export const isGroupId = (id) => /^[CR][0-9A-Za-z]{4,}$/.test(String(id || ''));
export const parseSpace = (v) => { const m = /^g:([CR][0-9A-Za-z]{4,})$/.exec(String(v || '')); return m ? m[1] : null; };

const memberCache = new Map();      // `${gid}|${uid}` → { member, name, at }
const infoCache = new Map();        // gid → { info, at }
const YES_MS = 5 * 60e3, NO_MS = 30e3, INFO_MS = 10 * 60e3;

// → { member: boolean, displayName?, error? }   (error = we could not tell → treated as not a member, and not cached)
export async function checkMember(gid, uid, now = Date.now()) {
  if (!isGroupId(gid) || !uid) return { member: false };
  const key = `${gid}|${uid}`; const hit = memberCache.get(key);
  if (hit && now - hit.at < (hit.member ? YES_MS : NO_MS)) return { member: hit.member, displayName: hit.name };
  const r = await bot('/internal/group-member', { groupId: gid, userId: uid }).catch(() => null);
  if (!r || r.ok !== true) return { member: false, error: r?.error || 'unreachable' };
  memberCache.set(key, { member: !!r.member, name: r.displayName || null, at: now });
  return { member: !!r.member, displayName: r.displayName || null };
}
export async function groupInfo(gid, now = Date.now()) {
  const hit = infoCache.get(gid); if (hit && now - hit.at < INFO_MS) return hit.info;
  const r = await bot('/internal/group-info', { groupId: gid }).catch(() => null);
  const info = r?.ok ? { id: gid, name: r.name || 'กลุ่ม LINE', memberCount: r.memberCount ?? null, pictureUrl: r.pictureUrl || null } : { id: gid, name: 'กลุ่ม LINE', memberCount: null, pictureUrl: null };
  if (r?.ok) infoCache.set(gid, { info, at: now });
  return info;
}
export function forgetSpaceCaches() { memberCache.clear(); infoCache.clear(); }          // tests

// Same shape as getPremiumSession (so the routes barely change): { session, isPremium, space }
//  · personal: the signed-in person           · group: the same person, but lineUserId = the group id (actorId = the real person)
// If the cookie names a group the person is no longer in, it is removed and the PERSONAL session is returned.
export async function getSpaceSession(cookieStore) {
  const session = await getSession(cookieStore);
  if (!session) return { session: null, isPremium: false, space: null };
  const gid = parseSpace(cookieStore.get(SPACE_COOKIE)?.value);
  if (!gid) return { session, isPremium: true, space: null };
  const m = await checkMember(gid, session.lineUserId);
  if (!m.member) { try { cookieStore.delete(SPACE_COOKIE); } catch { /* read-only store: the next /api/space call fixes the cookie */ } return { session, isPremium: true, space: null, kicked: gid }; }
  return { session: { ...session, lineUserId: gid, actorId: session.lineUserId, actorName: session.displayName, space: 'group', groupId: gid }, isPremium: true, space: { type: 'group', id: gid } };
}

// "added by": stamp a new row of a group space with the real person's LINE id. Columns come from group_created_by.sql — until it has been
// run the insert is retried without it, so nothing breaks.
export async function insertRow(supabase, table, row, session, columns = '*') {
  const stamped = session?.space === 'group' && session.actorId ? { ...row, created_by: session.actorId } : row;
  let res = await supabase.from(table).insert(stamped).select(columns).single();
  if (res.error && stamped !== row && /created_by/.test(res.error.message || '')) res = await supabase.from(table).insert(row).select(columns).single();
  return res;
}
// rows → rows + created_by_name (group spaces only; one extra light query, ignored when the column / names are not there)
export async function attachCreators(supabase, table, rows, session) {
  if (session?.space !== 'group' || !rows?.length) return rows;
  try {
    const ids = rows.map(r => r.id).filter(Boolean);
    const { data: by } = await supabase.from(table).select('id, created_by').in('id', ids);
    const who = new Map((by || []).map(r => [r.id, r.created_by]).filter(([, c]) => c));
    if (!who.size) return rows;
    const { data: people } = await supabase.from('users').select('line_user_id, display_name').in('line_user_id', [...new Set(who.values())]);
    const name = new Map((people || []).map(p => [p.line_user_id, p.display_name]));
    return rows.map(r => who.has(r.id) ? { ...r, created_by_name: name.get(who.get(r.id)) || 'สมาชิกกลุ่ม', created_by_me: who.get(r.id) === session.actorId } : r);
  } catch { return rows; }
}

// the convenience list of groups opened on this device
export function readGroupsCookie(cookieStore) {
  try { const v = JSON.parse(decodeURIComponent(cookieStore.get(GROUPS_COOKIE)?.value || '[]')); return Array.isArray(v) ? v.filter(g => g && parseSpace('g:' + g.id)).slice(0, 8) : []; } catch { return []; }
}
export function groupsCookieValue(list) { return encodeURIComponent(JSON.stringify(list.slice(0, 8).map(g => ({ id: g.id, name: String(g.name || '').slice(0, 40) })))); }
