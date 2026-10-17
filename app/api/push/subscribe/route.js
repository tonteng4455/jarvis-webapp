// app/api/push/subscribe/route.js — remember / forget this browser's push subscription
//   POST   { subscription: { endpoint, keys: { p256dh, auth } }, userAgent }
//   DELETE { endpoint }

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const MAX_PER_USER = 8;     // phones + computers; the oldest is dropped beyond that

export async function POST(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { subscription, userAgent } = await request.json().catch(() => ({}));
  const endpoint = subscription?.endpoint, p256dh = subscription?.keys?.p256dh, auth = subscription?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) {
    return NextResponse.json({ error: 'bad_subscription' }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  // the same browser re-subscribing must replace its row (also when another account used it before)
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: session.lineUserId, endpoint, p256dh, auth, user_agent: String(userAgent || '').slice(0, 300),
  });
  if (error) return NextResponse.json({ error: 'push_unsupported' }, { status: 500 });   // table missing: run push_notifications.sql
  const { data } = await supabase.from('push_subscriptions').select('id, created_at').eq('user_id', session.lineUserId).order('created_at', { ascending: false });
  for (const old of (data || []).slice(MAX_PER_USER)) await supabase.from('push_subscriptions').delete().eq('id', old.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { endpoint } = await request.json().catch(() => ({}));
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await supabaseAdmin().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', session.lineUserId);
  return NextResponse.json({ ok: true });
}
