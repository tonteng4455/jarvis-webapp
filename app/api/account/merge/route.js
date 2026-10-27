// app/api/account/merge/route.js — joining two accounts into one, after the person has seen what each holds and confirmed.
//   GET  ?t=<token>  → what each side holds (for the confirmation)
//   POST { token }   → do it; the session moves to the surviving account
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, verifyShort, sessionCookieOptions, createSessionToken } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { COUNTED, countsFor, mergeAccounts, profileOf, isLineKey } from '../../../../lib/accounts';

async function readToken(token) {
  const session = await getSession(await cookies());
  if (!session) return { error: 'unauthorized', status: 401 };
  const t = await verifyShort('merge', token);
  if (!t || t.by !== session.lineUserId) return { error: 'expired', status: 410 };           // not for this person, or too old
  return { session, t };
}

export async function GET(request) {
  const r = await readToken(new URL(request.url).searchParams.get('t'));
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  const supabase = supabaseAdmin();
  const [fromC, toC, fromP, toP] = await Promise.all([countsFor(supabase, r.t.from), countsFor(supabase, r.t.to), profileOf(supabase, r.t.from), profileOf(supabase, r.t.to)]);
  const side = (key, counts, prof) => ({ type: isLineKey(key) ? 'line' : 'google', name: prof.display_name || '', counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  return NextResponse.json({ from: side(r.t.from, fromC, fromP), to: side(r.t.to, toC, toP), labels: Object.fromEntries(COUNTED), keepsCurrent: r.t.to === r.session.lineUserId });
}

export async function POST(request) {
  const { token } = await request.json().catch(() => ({}));
  const r = await readToken(token);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  const supabase = supabaseAdmin();
  try {
    await mergeAccounts(supabase, r.t.from, r.t.to);
    if (r.t.add) {                                        // the Google sign-in that started this now belongs to the surviving account
      const { error } = await supabase.from('user_identities').upsert({ provider: r.t.add.provider, subject: r.t.add.subject, user_id: r.t.to, label: r.t.add.label || null }, { onConflict: 'provider,subject' });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    console.error('merge failed:', e);
    return NextResponse.json({ error: 'merge_failed' }, { status: 500 });
  }
  const prof = await profileOf(supabase, r.t.to);
  const res = NextResponse.json({ ok: true });
  const prod = process.env.NODE_ENV === 'production';
  res.cookies.set(sessionCookieOptions().name, await createSessionToken({ lineUserId: r.t.to, displayName: prof.display_name || r.session.displayName, pictureUrl: prof.picture_url || r.session.pictureUrl }), { ...sessionCookieOptions(), secure: prod });
  return res;
}
