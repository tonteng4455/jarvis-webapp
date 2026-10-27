// app/api/auth/link-line/route.js — a person signed in with Google adds their LINE: sends them through LINE Login, and the LINE callback
// (which checks the cookie set here) joins the two accounts after a confirmation.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getSession, signShort } from '../../../../lib/session';
import { flowCookie } from '../../../../lib/authFlow';

export async function GET(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.redirect(new URL('/login', request.url));
  const state = randomBytes(16).toString('hex'), nonce = randomBytes(16).toString('hex');
  const mock = process.env.MOCK_MODE === '1' && process.env.NODE_ENV !== 'production';
  let target;
  if (mock) target = new URL(`/api/auth/callback?code=${encodeURIComponent('mock-line:' + (new URL(request.url).searchParams.get('as') || 'Umock1'))}&state=${state}`, request.url).toString();
  else {
    const u = new URL('https://access.line.me/oauth2/v2.1/authorize');
    u.searchParams.set('response_type', 'code'); u.searchParams.set('client_id', process.env.LINE_LOGIN_CHANNEL_ID);
    u.searchParams.set('redirect_uri', process.env.LINE_LOGIN_REDIRECT_URI); u.searchParams.set('state', state); u.searchParams.set('nonce', nonce); u.searchParams.set('scope', 'profile openid');
    target = u.toString();
  }
  const res = NextResponse.redirect(target);
  res.cookies.set('line_oauth_state', state, flowCookie());
  res.cookies.set('line_link', await signShort('line-link', { key: session.lineUserId, state }), flowCookie());
  return res;
}
