// app/api/space/route.js — which space the dashboard is showing, which groups can be switched to, and the switch itself.
//   GET  → { space: 'personal' | 'group', group?: {id,name,memberCount}, groups: [{id,name,memberCount}], canUseGroups }
//   POST { space: 'personal' | 'g:<group id>' } → switches (a group only if LINE says the person is in it)
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { SPACE_COOKIE, parseSpace, checkMember, groupInfo, readGroupsCookie } from '../../../lib/space';

const cookieOpts = (httpOnly) => ({ httpOnly, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
export async function GET() {
  const store = await cookies();
  const session = await getSession(store);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const canUseGroups = /^U/.test(session.lineUserId || '') || (process.env.MOCK_MODE === '1' && /^mock-/.test(session.lineUserId || ''));          // a Google-only account has no LINE id to check against
  const known = canUseGroups ? readGroupsCookie(store) : [];
  const checked = await Promise.all(known.map(async g => ({ g, m: await checkMember(g.id, session.lineUserId) })));
  const groups = [];
  for (const { g, m } of checked) if (m.member) { const info = await groupInfo(g.id); groups.push({ id: g.id, name: info.name !== 'กลุ่ม LINE' ? info.name : (g.name || info.name), memberCount: info.memberCount }); }
  const cur = parseSpace(store.get(SPACE_COOKIE)?.value);
  const here = cur ? groups.find(g => g.id === cur) : null;
  const res = NextResponse.json({ space: here ? 'group' : 'personal', group: here || null, groups, canUseGroups, actorId: session.lineUserId });
  if (cur && !here) res.cookies.set(SPACE_COOKIE, '', { ...cookieOpts(true), maxAge: 0 });            // no longer in that group (or not listed): back to personal
  return res;
}

export async function POST(request) {
  const store = await cookies();
  const session = await getSession(store);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.space === 'personal') { const res = NextResponse.json({ ok: true, space: 'personal' }); res.cookies.set(SPACE_COOKIE, '', { ...cookieOpts(true), maxAge: 0 }); return res; }
  const gid = parseSpace(body.space);
  if (!gid) return NextResponse.json({ error: 'bad_space' }, { status: 400 });
  const m = await checkMember(gid, session.lineUserId);
  if (!m.member) return NextResponse.json({ error: m.error ? 'cannot_verify' : 'not_a_member' }, { status: m.error ? 502 : 403 });
  const res = NextResponse.json({ ok: true, space: 'group', groupId: gid });
  res.cookies.set(SPACE_COOKIE, `g:${gid}`, cookieOpts(true));
  return res;
}
