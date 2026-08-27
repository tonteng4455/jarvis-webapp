// app/api/auth/logout/route.js
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '../../../../lib/session';


export async function POST(request) {
  const res = NextResponse.redirect(new URL('/login', request.url));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
