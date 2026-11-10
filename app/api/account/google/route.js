// app/api/account/google/route.js — the Google Calendar + Drive connection of THIS person (not the "sign in with Google" link, which is /api/account/unlink).
//   GET           → { connected, email, driveFolderUrl, connectUrl }
//   POST { action: 'disconnect' } → revokes our access at Google and forgets it (what is already in their Google stays)
// Always the real signed-in person (never a group space: a group's Google is managed in the group's ⚙️ tab).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { callBotInternal } from '../../../../lib/botWorker';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await callBotInternal('/internal/google-status', { userId: session.lineUserId, detail: true }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
  return NextResponse.json({ connected: !!r.connected, expired: !!r.expired, email: r.email || null, driveFolderUrl: r.driveFolderUrl || null, connectUrl: r.connectUrl || null });
}

export async function POST(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  if (b.action !== 'disconnect') return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  const r = await callBotInternal('/internal/google-disconnect', { userId: session.lineUserId }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
  return NextResponse.json({ ok: true, had: !!r.had });
}
