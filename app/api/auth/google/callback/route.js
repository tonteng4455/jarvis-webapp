// app/api/auth/google/callback/route.js — step 2: Google sends the browser back here with ?code&state.
//   login: find (or create) the account this Google sign-in belongs to and sign in.
//   link : add this Google sign-in to the account that is signed in now — or, when it already belongs to ANOTHER account, ask to join the two.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { getSession, signShort, verifyShort } from '../../../../../lib/session';
import { googleIdentityFromCode } from '../../../../../lib/googleLogin';
import { identityOf, keyForGoogle, mergeTarget, profileOf } from '../../../../../lib/accounts';
import { redirectSignedIn } from '../../../../../lib/authFlow';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const jar = await cookies();
  const flow = await verifyShort('google', jar.get('google_oauth')?.value);
  const back = flow?.mode === 'link' ? '/dashboard/account' : '/login';
  const fail = e => { const r = NextResponse.redirect(new URL(`${back}?error=${e}`, request.url)); r.cookies.delete('google_oauth'); return r; };

  if (!flow || !code || !state || state !== flow.state) return fail('state_mismatch');
  const who = await googleIdentityFromCode(request, code, flow.nonce).catch(() => null);
  if (!who) return fail('google_failed');
  const supabase = supabaseAdmin();

  try {
    if (flow.mode !== 'link') {
      const { key } = await keyForGoogle(supabase, who);
      const prof = await profileOf(supabase, key);
      const res = await redirectSignedIn(request, '/dashboard/chat', { key, displayName: prof.display_name || who.name || who.email, pictureUrl: prof.picture_url || who.picture });
      res.cookies.delete('google_oauth');
      return res;
    }

    const session = await getSession(jar);
    if (!session || session.lineUserId !== flow.key) return fail('session_changed');
    const existing = await identityOf(supabase, 'google', who.sub);
    let res;
    if (!existing) {
      const { error } = await supabase.from('user_identities').upsert({ provider: 'google', subject: who.sub, user_id: session.lineUserId, label: who.email || who.name || null }, { onConflict: 'provider,subject' });
      if (error) throw new Error(error.message);
      res = NextResponse.redirect(new URL('/dashboard/account?linked=google', request.url));
    } else if (existing.user_id === session.lineUserId) {
      res = NextResponse.redirect(new URL('/dashboard/account?linked=already', request.url));
    } else {
      // this Google sign-in already has its own account: joining the two needs a confirmation (with what each one holds)
      const { from, to } = mergeTarget(session.lineUserId, existing.user_id);
      const token = await signShort('merge', { from, to, by: session.lineUserId, add: { provider: 'google', subject: who.sub, label: who.email || who.name || null } }, 900);
      res = NextResponse.redirect(new URL(`/dashboard/account?merge=${encodeURIComponent(token)}`, request.url));
    }
    res.cookies.delete('google_oauth');
    return res;
  } catch (e) {
    console.error('google callback failed:', e);
    return fail('db');
  }
}
