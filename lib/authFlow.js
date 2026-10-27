// lib/authFlow.js — small helpers shared by the sign-in routes (server only).
import { NextResponse } from 'next/server';
import { createSessionToken, sessionCookieOptions } from './session';

const prod = () => process.env.NODE_ENV === 'production';
export const flowCookie = (maxAge = 600) => ({ httpOnly: true, secure: prod(), sameSite: 'lax', path: '/', maxAge });

// redirect (to a path on this site) with a fresh session cookie for `key`
export async function redirectSignedIn(request, to, { key, displayName, pictureUrl }) {
  const token = await createSessionToken({ lineUserId: key, displayName, pictureUrl });
  const res = NextResponse.redirect(new URL(to, request.url));
  res.cookies.set(sessionCookieOptions().name, token, { ...sessionCookieOptions(), secure: prod() });
  return res;
}
