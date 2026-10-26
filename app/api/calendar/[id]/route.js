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
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const moveTo = typeof body.calendar_id === 'string' && body.calendar_id ? body.calendar_id : null;
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if (typeof updates.description === 'string') updates.description = updates.description.slice(0, 8000);   // keep in sync with the bot (Google takes ~8,000 characters)
  if (Object.keys(updates).length === 0 && !moveTo) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  let data;
  if (Object.keys(updates).length) {
    const r = await supabase.from('calendar_events').update(updates).eq('id', id).eq('user_id', session.lineUserId).select().single();
    if (r.error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    data = r.data;
  } else {
    const r = await supabase.from('calendar_events').select('*').eq('id', id).eq('user_id', session.lineUserId).maybeSingle();
    if (!r.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    data = r.data;
  }

  // Moving to another calendar: the Worker creates it on the new calendar first and only then removes it from the old one.
  // It re-reads the row we just saved, so the edit and the move arrive together; no separate sync is needed then.
  if (moveTo) {
    const m = await callBotInternal('/internal/calendar-move', { userId: session.lineUserId, eventId: id, calendarId: moveTo });
    if (m?.ok && m.moved) return NextResponse.json({ event: m.event || data, syncResult: { synced: true }, moved: true });
    if (m?.ok) { const syncResult = await callBotInternal('/internal/calendar-sync', { userId: session.lineUserId, eventId: id }); return NextResponse.json({ event: data, syncResult, moved: false }); }   // already there: just sync the edit
    // the move failed (e.g. no right to write there): the edit is saved, the event stays where it was — and we say so
    const syncResult = await callBotInternal('/internal/calendar-sync', { userId: session.lineUserId, eventId: id });
    return NextResponse.json({ event: data, syncResult, moveError: m?.error || 'move_failed' });
  }

  const syncResult = await callBotInternal('/internal/calendar-sync', { userId: session.lineUserId, eventId: id });
  return NextResponse.json({ event: data, syncResult });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Delegates the actual DB update AND the Google-side removal to the
  // Worker (see performCalendarCancel there) — keeps "cancel" behaving
  // identically whether it's done from the bot or from here, instead
  // of half-duplicating that logic in two places.
  const result = await callBotInternal('/internal/calendar-cancel', { userId: session.lineUserId, eventId: id });
  if (!result.ok) return NextResponse.json({ error: result.error || 'cancel_failed' }, { status: 404 });
  return NextResponse.json({ cancelled: true, event: result.event });
}
