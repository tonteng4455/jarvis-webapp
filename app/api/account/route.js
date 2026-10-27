// app/api/account/route.js — how this person can sign in (for the Account page).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { identitiesOf, isLineKey, profileOf } from '../../../lib/accounts';
import { googleConfigured, mockGoogle } from '../../../lib/googleLogin';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = supabaseAdmin();
  const [ids, prof] = await Promise.all([identitiesOf(supabase, session.lineUserId), profileOf(supabase, session.lineUserId)]);
  const google = ids.filter(i => i.provider === 'google').map(i => ({ subject: i.subject, label: i.label || 'บัญชี Google' }));
  const hasLine = isLineKey(session.lineUserId);
  return NextResponse.json({
    name: prof.display_name || session.displayName || '',
    line: hasLine,                                       // the LINE sign-in (and the bot) is part of this account
    google,
    canUnlinkGoogle: hasLine || google.length > 1,       // at least one way to sign in must stay
    googleReady: googleConfigured() || mockGoogle(),
  });
}
