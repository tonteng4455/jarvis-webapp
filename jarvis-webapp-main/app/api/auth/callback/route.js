// app/api/auth/callback/route.js
//
// Step 2 of LINE Login. LINE redirects back here with ?code=...&state=...
// We: (1) check state matches what we set in /api/auth/login, (2) exchange
// the code for tokens, (3) verify the id_token via LINE's verify endpoint
// (simpler than fetching LINE's JWKS and checking the signature
// ourselves — one extra network call, but far less code to get wrong),
// (4) upsert a row in `users`, (5) mint our own session cookie.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { createSessionToken, sessionCookieOptions } from '../../../../lib/session';


export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.cookies.get('line_oauth_state')?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/login?error=state_mismatch', request.url));
  }

  // --- Exchange authorization code for tokens ---
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINE_LOGIN_REDIRECT_URI,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET,
    }),
  });
  if (!tokenRes.ok) {
    console.error('LINE token exchange failed:', await tokenRes.text());
    return NextResponse.redirect(new URL('/login?error=token_exchange', request.url));
  }
  const tokenData = await tokenRes.json(); // { access_token, id_token, ... }

  // --- Verify id_token signature + audience via LINE's verify endpoint ---
  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokenData.id_token, client_id: process.env.LINE_LOGIN_CHANNEL_ID }),
  });
  if (!verifyRes.ok) {
    console.error('LINE id_token verify failed:', await verifyRes.text());
    return NextResponse.redirect(new URL('/login?error=id_token_invalid', request.url));
  }
  const verified = await verifyRes.json(); // { sub, name, picture, ... }
  const lineUserId = verified.sub;

  // --- Upsert the user row (does not touch is_premium/quota fields —
  //     those are only ever changed by the admin console) ---
  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('users')
    .upsert(
      { line_user_id: lineUserId, display_name: verified.name || null, picture_url: verified.picture || null, updated_at: new Date().toISOString() },
      { onConflict: 'line_user_id' }
    );
  if (error) {
    console.error('users upsert failed:', error);
    return NextResponse.redirect(new URL('/login?error=db', request.url));
  }

  // --- Mint our session, redirect into the app ---
  const sessionToken = await createSessionToken({ lineUserId, displayName: verified.name, pictureUrl: verified.picture });
  const res = NextResponse.redirect(new URL('/dashboard', request.url));
  res.cookies.set(sessionCookieOptions().name, sessionToken, sessionCookieOptions());
  res.cookies.delete('line_oauth_state');
  return res;
}
