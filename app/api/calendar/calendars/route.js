// app/api/calendar/calendars/route.js — the Google calendars of the connected account (own + shared ones such as a work
// calendar shared into the personal account), plus the two settings the web app controls:
//   GET → { connected, calendars: [{ id, name, color, primary, writable }], targetCalendarId, displayCalendarIds }
//   PUT { targetCalendarId?, displayCalendarIds? } → where NEW appointments go / which calendars the views show
// The Worker (which holds the Google tokens) does the work and validates every id; this route only passes the userId.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await callBotInternal('/internal/calendar-calendars', { userId: session.lineUserId });
  if (!r?.ok) return NextResponse.json({ error: 'worker_unavailable' }, { status: 502 });
  return NextResponse.json({ connected: !!r.connected, calendars: r.calendars || [], targetCalendarId: r.targetCalendarId || null, displayCalendarIds: r.displayCalendarIds || [] });
}

export async function PUT(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const payload = { userId: session.lineUserId };
  if (typeof body.targetCalendarId === 'string') payload.targetCalendarId = body.targetCalendarId.slice(0, 300);
  if (Array.isArray(body.displayCalendarIds)) payload.displayCalendarIds = body.displayCalendarIds.filter(x => typeof x === 'string').slice(0, 50).map(x => x.slice(0, 300));
  const r = await callBotInternal('/internal/calendar-settings', payload);
  if (!r?.ok) return NextResponse.json({ error: r?.error || 'failed' }, { status: r?.error ? 400 : 502 });
  return NextResponse.json({ targetCalendarId: r.targetCalendarId, displayCalendarIds: r.displayCalendarIds });
}
