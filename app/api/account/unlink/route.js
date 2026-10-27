// app/api/account/unlink/route.js — stop signing in with one Google account (the data stays with this account).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { identitiesOf, isLineKey } from '../../../../lib/accounts';

export async function POST(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { subject } = await request.json().catch(() => ({}));
  if (!subject) return NextResponse.json({ error: 'missing_subject' }, { status: 400 });
  const supabase = supabaseAdmin();
  const ids = (await identitiesOf(supabase, session.lineUserId)).filter(i => i.provider === 'google');
  if (!ids.some(i => i.subject === String(subject))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!isLineKey(session.lineUserId) && ids.length < 2) return NextResponse.json({ error: 'last_login' }, { status: 409 });   // would lock the person out
  const { error } = await supabase.from('user_identities').delete().eq('provider', 'google').eq('subject', String(subject)).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
