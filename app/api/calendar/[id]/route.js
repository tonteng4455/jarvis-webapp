// app/api/calendar/[id]/route.js
//
// PATCH — edit an event's title/date/time/location/description/
// reminder, then ask the Worker to re-sync it to Google Calendar (the
// Worker holds the Google tokens; this route never talks to Google
// directly). DELETE — cancel the event (soft — sets status, matching
// how the bot's own "cancel" works, rather than a hard delete here).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

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

  const syncResult = await syncViaWorker(session.lineUserId, params.id);
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
  const result = await cancelViaWorker(session.lineUserId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error || 'cancel_failed' }, { status: 404 });
  return NextResponse.json({ cancelled: true, event: result.event });
}

async function cancelViaWorker(userId, eventId) {
  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!workerUrl || !secret) {
    console.error('WORKER_URL/INTERNAL_API_SECRET not configured — cannot cancel event');
    return { ok: false, error: 'not_configured' };
  }
  try {
    const res = await fetch(`${workerUrl}/internal/calendar-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ userId, eventId }),
    });
    return await res.json();
  } catch (e) {
    console.error('cancelViaWorker failed:', e);
    return { ok: false, error: e.message };
  }
}

async function syncViaWorker(userId, eventId) {
  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!workerUrl || !secret) {
    console.error('WORKER_URL/INTERNAL_API_SECRET not configured — cannot sync event to Google');
    return { synced: false, error: `not_configured (WORKER_URL=${workerUrl ? 'set' : 'MISSING'}, INTERNAL_API_SECRET=${secret ? 'set' : 'MISSING'})` };
  }
  try {
    const res = await fetch(`${workerUrl}/internal/calendar-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ userId, eventId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The Worker itself rejected the request (401 = secret mismatch
      // between the two sides, 404 = event not found under this
      // userId) — surface the HTTP status since body.error alone
      // ("unauthorized"/"not_found") doesn't say WHICH check failed.
      return { synced: false, error: `worker_returned_${res.status}: ${body.error || 'no detail'}` };
    }
    return body;
  } catch (e) {
    console.error('syncViaWorker failed:', e);
    return { synced: false, error: e.message };
  }
}
