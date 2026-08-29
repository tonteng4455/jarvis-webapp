// app/api/calendar/[id]/route.js
//
// PATCH — edit an event's title/date/time/location/description/
// reminder, then ask the Worker to re-sync it to Google Calendar (the
// Worker holds the Google tokens; this route never talks to Google
// directly — see lib/botWorker.js for HOW that call is made). DELETE —
// cancel the event (soft — sets status, matching how the bot's own
// "cancel" works, rather than a hard delete here).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../../lib/botWorker';

const EDITABLE_FIELDS = ['title', 'start_time', 'end_time', 'location', 'description', 'reminder_minutes'];

export async function PATCH(request, { params }) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const syncResult = await callBotInternal('/internal/calendar-sync', { userId: session.lineUserId, eventId: params.id });
  return NextResponse.json({ event: data, syncResult });
}

export async function DELETE(request, { params }) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  // Delegates the actual DB update AND the Google-side removal to the
  // Worker (see performCalendarCancel there) — keeps "cancel" behaving
  // identically whether it's done from the bot or from here, instead
  // of half-duplicating that logic in two places.
  const result = await callBotInternal('/internal/calendar-cancel', { userId: session.lineUserId, eventId: params.id });
  if (!result.ok) return NextResponse.json({ error: result.error || 'cancel_failed' }, { status: 404 });
  return NextResponse.json({ cancelled: true, event: result.event });
}
