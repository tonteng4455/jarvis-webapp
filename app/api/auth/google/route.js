// app/api/auth/google/route.js — step 1 of "Sign in with Google" (and of linking Google to the signed-in account: ?mode=link).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getSession, signShort } from '../../../../lib/session';
import { googleConfigured, googleAuthorizeUrl, mockGoogle } from '../../../../lib/googleLogin';
import { flowCookie } from '../../../../lib/authFlow';

export async function GET(request) {
  const url = new URL(request.url);
  const link = url.searchParams.get('mode') === 'link';
  let key = null;
  if (link) {
    const session = await getSession(await cookies());
    if (!session) return NextResponse.redirect(new URL('/login', request.url));
    key = session.lineUserId;
  }
  if (!googleConfigured() && !mockGoogle()) return NextResponse.redirect(new URL(link ? '/dashboard/account?error=google_not_configured' : '/login?error=google_not_configured', request.url));

  const state = randomBytes(16).toString('hex'), nonce = randomBytes(16).toString('hex');
  const target = mockGoogle() && !googleConfigured()
    ? new URL(`/api/auth/google/callback?code=${encodeURIComponent('mock:' + (url.searchParams.get('as') || 'g1') + ':' + (url.searchParams.get('name') || 'Mock Google'))}&state=${state}`, request.url).toString()
    : googleAuthorizeUrl(request, state, nonce);
  const res = NextResponse.redirect(target);
  res.cookies.set('google_oauth', await signShort('google', { state, nonce, mode: link ? 'link' : 'login', key }), flowCookie());
  return res;
}
