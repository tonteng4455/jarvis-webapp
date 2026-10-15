// app/api/auth/dev-login/route.js
//
// Test-only login that skips LINE. Exists ONLY when MOCK_MODE=1 AND
// NODE_ENV !== 'production' (i.e. `next dev` with the mock backend) —
// in any production build/deploy it 404s, and it can only ever sign in
// as one of the fixed mock users below (never an arbitrary id).

import { NextResponse } from 'next/server';
import { createSessionToken, sessionCookieOptions } from '../../../../lib/session';

const MOCK_USERS = {
  demo: { lineUserId: 'mock-user', displayName: 'Mock Tester' },
  nodrive: { lineUserId: 'mock-nodrive', displayName: 'Mock (no Drive)' },
};

export async function GET(request) {
  if (process.env.MOCK_MODE !== '1' || process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  const who = new URL(request.url).searchParams.get('user') || 'demo';
  const u = MOCK_USERS[who];
  if (!u) return NextResponse.json({ error: 'unknown_mock_user' }, { status: 400 });
  const token = await createSessionToken({ ...u, pictureUrl: null });
  const res = NextResponse.redirect(new URL('/dashboard/today', request.url));
  res.cookies.set(sessionCookieOptions().name, token, { ...sessionCookieOptions(), secure: false });
  return res;
}
