// app/api/push/test/route.js — "send me a test notification" (the bot Worker does the sending)
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { callBotInternal } from '../../../../lib/botWorker';

export async function POST() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await callBotInternal('/internal/push-test', { userId: session.lineUserId });
  return NextResponse.json({ ok: !!r?.ok, sent: r?.sent || 0, error: r?.ok ? undefined : (r?.error || 'failed') });
}
