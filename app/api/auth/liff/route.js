// app/api/auth/liff/route.js
//
// LIFF's own login (liff.login()) already handles the whole LINE OAuth
// dance internally — the client just calls liff.getIDToken() afterward
// and hands us that token here. We verify it the EXACT same way the
// full OAuth callback does (LINE's /oauth2/v2.1/verify endpoint works
// for any valid id_token issued under this channel, LIFF-obtained or
// not), then mint the SAME session cookie used everywhere else in the
// app — so once inside a LIFF page, everything else (API routes, other
// dashboard pages) just works with zero extra auth code.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { createSessionToken, sessionCookieOptions } from '../../../../lib/session';

export async function POST(request) {
  try {
    const { idToken } = await request.json();
    if (!idToken) return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });

    if (!process.env.LINE_LOGIN_CHANNEL_ID) {
      return NextResponse.json({ error: 'server_misconfigured', detail: 'LINE_LOGIN_CHANNEL_ID is not set' }, { status: 500 });
    }

    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: process.env.LINE_LOGIN_CHANNEL_ID }),
    });
    if (!verifyRes.ok) {
      const detail = await verifyRes.text();
      console.error('LIFF id_token verify failed:', detail);
      return NextResponse.json({ error: 'invalid_id_token', detail }, { status: 401 });
    }
    const verified = await verifyRes.json(); // { sub, name, picture, ... }
    const lineUserId = verified.sub;

    const supabase = supabaseAdmin();
    const { error } = await supabase
      .from('users')
      .upsert(
        { line_user_id: lineUserId, display_name: verified.name || null, picture_url: verified.picture || null, updated_at: new Date().toISOString() },
        { onConflict: 'line_user_id' }
      );
    if (error) {
      console.error('users upsert failed (LIFF auth):', error);
      return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    }

    const sessionToken = await createSessionToken({ lineUserId, displayName: verified.name, pictureUrl: verified.picture });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookieOptions().name, sessionToken, sessionCookieOptions());
    return res;
  } catch (e) {
    // Anything unexpected (e.g. SESSION_SECRET missing/too short inside
    // createSessionToken, which throws rather than returning an error)
    // would otherwise surface as an opaque, unhelpful 500 with the
    // reason visible only in server logs neither of us can see from
    // here — catching it and returning the message directly makes the
    // actual cause visible on the LIFF page itself.
    console.error('LIFF auth route crashed:', e);
    return NextResponse.json({ error: 'unexpected_error', detail: e.message }, { status: 500 });
  }
}
