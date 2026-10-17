// app/api/setup-status/route.js — what the "finish setting up" checklist on the Today page needs
// from the server: is Google Calendar connected (+ where to connect) and has a card colour been chosen.
// Push status is per-device, so the browser works that out itself.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../lib/botWorker';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [google, { data: user }] = await Promise.all([
    callBotInternal('/internal/google-status', { userId: session.lineUserId }).catch(() => null),
    supabaseAdmin().from('users').select('card_theme').eq('line_user_id', session.lineUserId).maybeSingle(),
  ]);
  return NextResponse.json({
    // null = unknown (older bot version / worker unreachable) → the checklist simply leaves that step out
    google: google?.ok ? { connected: !!google.connected, connectUrl: google.connectUrl || null } : null,
    cardTheme: user?.card_theme ?? null,
  });
}
