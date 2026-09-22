// app/api/calendar/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../lib/botWorker';

// Mirrors reconcileWithGoogle() in the bot Worker exactly — a row is
// only ever hidden (never deleted, always reversible) if the calendar
// it was synced to was actually checked this round; otherwise there's
// no evidence either way, so it stays visible rather than risking a
// false hide. See the bot's jarvis-line-bot.js for the full rationale.
function reconcileWithGoogle(localRows, googleEventIds, checkedCalendarIds, targetCalendarId) {
  const remoteIds = new Set(googleEventIds);
  const checkedSet = new Set(checkedCalendarIds);
  return localRows.filter(r => {
    if (!r.google_event_id) return true;
    const cal = r.calendar_id || targetCalendarId;
    if (!cal || !checkedSet.has(cal)) return true;
    return remoteIds.has(r.google_event_id);
  });
}

export async function GET(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ?past=true switches to the "ผ่านมาแล้ว" (archive) view — same
  // toggle pattern as /api/notes?archived=. Without this split, every
  // event ever created (up to 500, oldest-first) showed in one long
  // list forever, burying anything actually upcoming at the bottom —
  // and there was no way to see just what's already happened either.
  const { searchParams } = new URL(request.url);
  const past = searchParams.get('past') === 'true';
  const nowIso = new Date().toISOString();

  const supabase = supabaseAdmin();
  let query = supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, location, description, status, reminder_minutes, google_event_id, calendar_id')
    .eq('user_id', session.lineUserId)
    .neq('status', 'cancelled');

  query = past
    ? query.lt('start_time', nowIso).order('start_time', { ascending: false })
    : query.gte('start_time', nowIso).order('start_time', { ascending: true });

  const { data, error } = await query.limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  // Same fix as the bot's own calendar views: a row deleted directly
  // in Google Calendar (not through the bot/webapp) never disappears
  // here on its own — one-way sync (bot→Google) has no way to hear
  // about a Google-side delete. Reconciling on every load hides it
  // instead (never actually deletes the row — reversible). Only
  // applied to the upcoming view; see the bot Worker's handler for why
  // the archive view is skipped.
  let events = data;
  if (!past) {
    const reconcile = await callBotInternal('/internal/calendar-reconcile', { userId: session.lineUserId });
    if (reconcile?.googleEventIds) {
      events = reconcileWithGoogle(data, reconcile.googleEventIds, reconcile.checkedCalendarIds || [], reconcile.targetCalendarId || null);
    }
    // If the reconcile call itself failed (Worker unreachable, secret
    // misconfigured, etc.) events just falls back to the unfiltered
    // list — same as before this feature existed, not a hard failure.
  }

  return NextResponse.json({ events });
}
