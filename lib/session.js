// lib/session.js
//
// Our own lightweight session, independent of Supabase Auth. After LINE
// Login succeeds, we mint a short JWT containing just the LINE user id
// and store it in an httpOnly cookie. Every API route that needs "who is
// calling" reads this cookie and verifies it — it never trusts a client-
// supplied line_user_id directly (that would let anyone impersonate
// anyone else's files/notes/etc).

import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'jarvis_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars long');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken({ lineUserId, displayName, pictureUrl }) {
  return await new SignJWT({ sub: lineUserId, name: displayName, picture: pictureUrl })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { lineUserId: payload.sub, displayName: payload.name, pictureUrl: payload.picture };
  } catch {
    return null;
  }
}

// Reads + verifies the session from a Next.js Request/cookies() call site.
// Usage in an API route (App Router):
//   import { cookies } from 'next/headers';
//   const session = await getSession(cookies());
//   if (!session) return new Response('Unauthorized', { status: 401 });
export async function getSession(cookieStore) {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
