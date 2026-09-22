// app/api/auth/login/route.js
//
// Step 1 of LINE Login: redirect the browser to LINE's authorize screen.
// Uses a SEPARATE LINE Login channel (channel 2 in the agreed
// architecture) — do not reuse the Messaging API channel's credentials
// here, they're different channel types in the LINE Developers Console.

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';


export async function GET(request) {
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');

  const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', process.env.LINE_LOGIN_CHANNEL_ID);
  authorizeUrl.searchParams.set('redirect_uri', process.env.LINE_LOGIN_REDIRECT_URI);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('scope', 'profile openid');

  const res = NextResponse.redirect(authorizeUrl.toString());
  // Short-lived CSRF check cookies — verified in the callback, then discarded.
  res.cookies.set('line_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
