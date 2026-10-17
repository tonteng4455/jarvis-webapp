// app/api/push/config/route.js — the public VAPID key the browser needs to subscribe (null = not configured yet)
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
