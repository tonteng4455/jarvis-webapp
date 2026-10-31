// app/api/calendar/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../lib/botWorker';
import { SERIES_SELECT, BASE_SELECT, expandSeries, ruleFromForm, localDate, externalFromToday } from '../../../lib/calendarSeries';

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
  // ?from=ISO&to=ISO — every event in a window (the month view), past
  // and future together, ordered by time. Takes precedence over ?past.
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const ranged = !!(from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to)));

  const supabase = supabaseAdmin();
  const limitParam = parseInt(searchParams.get('limit') || '', 10);
  const limitN = Number.isFinite(limitParam) ? Math.min(500, Math.max(1, limitParam)) : 500;
  // withSeries: false when event_recurrence.sql has not been run yet — then this is exactly the list from before repeating appointments
  const build = withSeries => {
    let q = supabase.from('calendar_events').select(withSeries ? SERIES_SELECT : BASE_SELECT).eq('user_id', session.lineUserId).neq('status', 'cancelled');
    if (withSeries) q = q.is('recurrence_rule', null);
    if (ranged) q = q.gte('start_time', from).lt('start_time', to).order('start_time', { ascending: true });
    else q = past ? q.lt('start_time', nowIso).order('start_time', { ascending: false }) : q.gte('start_time', nowIso).order('start_time', { ascending: true });
    return q.limit(limitN);
  };
  let withSeries = true;
  let { data, error } = await build(true);
  if (error) { withSeries = false; ({ data, error } = await build(false)); }
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  // repeating appointments: one row each, shown once per date inside the window (never hidden by the Google reconcile below)
  let seriesRows = [], seriesEvents = [];
  if (withSeries) {
    const r = await supabase.from('calendar_events').select(SERIES_SELECT).eq('user_id', session.lineUserId).neq('status', 'cancelled').not('recurrence_rule', 'is', null).order('start_time', { ascending: true }).limit(100);
    seriesRows = r.error ? [] : r.data || [];
    const lo = ranged ? from : past ? new Date(Date.now() - 365 * 86400e3).toISOString() : nowIso;
    const hi = ranged ? to : past ? nowIso : new Date(Date.now() + 120 * 86400e3).toISOString();
    seriesEvents = expandSeries(seriesRows, lo, hi);
  }

  // Same fix as the bot's own calendar views: a row deleted directly
  // in Google Calendar (not through the bot/webapp) never disappears
  // here on its own — one-way sync (bot→Google) has no way to hear
  // about a Google-side delete. Reconciling on every load hides it
  // instead (never actually deletes the row — reversible). Only
  // applied to the upcoming view; see the bot Worker's handler for why
  // the archive view is skipped.
  let events = data;
  if (!past || ranged) {
    // For a ranged (month) view only the not-yet-started events are
    // reconciled — same rule as the archive view: past rows are never
    // hidden by it.
    const toCheck = ranged ? data.filter(e => e.start_time >= nowIso) : data;
    const reconcile = await callBotInternal('/internal/calendar-reconcile', { userId: session.lineUserId });
    if (reconcile?.googleEventIds) {
      const kept = reconcileWithGoogle(toCheck, reconcile.googleEventIds, reconcile.checkedCalendarIds || [], reconcile.targetCalendarId || null);
      events = ranged ? data.filter(e => e.start_time < nowIso || kept.includes(e)) : kept;
    }

    // If the reconcile call itself failed (Worker unreachable, secret
    // misconfigured, etc.) events just falls back to the unfiltered
    // list — same as before this feature existed, not a hard failure.
  }

  if (seriesEvents.length) {
    events = [...events, ...seriesEvents].sort((a, b) => (past && !ranged ? String(b.start_time).localeCompare(String(a.start_time)) : String(a.start_time).localeCompare(String(b.start_time))));
    if (events.length > limitN) events = events.slice(0, limitN);
  }

  // ?include=google: events that exist ONLY in Google Calendar (made in the Google app, or by someone who shares the
  // calendar) for the calendars chosen for display — shown read-only, merged by time with the ones saved here.
  if (searchParams.get('include') === 'google' && !past) {
    const rangeFrom = ranged ? from : nowIso;
    const rangeTo = ranged ? to : new Date(Date.now() + 90 * 86400e3).toISOString();
    const g = await Promise.race([
      callBotInternal('/internal/calendar-google-events', { userId: session.lineUserId, from: rangeFrom, to: rangeTo }).catch(() => null),
      new Promise(r => setTimeout(() => r(null), 7000)),
    ]);
    if (g?.ok && Array.isArray(g.events)) {
      const have = new Set([...events, ...seriesRows].map(e => e.google_event_id).filter(Boolean));
      const extra = externalFromToday(g.events, nowIso, ranged).filter(e => !have.has(e.google_event_id) && !(e.recurring_event_id && have.has(e.recurring_event_id))).map(e => ({
        id: `g:${e.calendar_id}:${e.google_event_id}`, title: e.title, start_time: e.start_time, end_time: e.end_time, location: e.location,
        description: null, status: 'scheduled', reminder_minutes: null, google_event_id: e.google_event_id, calendar_id: e.calendar_id,
        external: true, all_day: !!e.all_day, htmlLink: e.htmlLink || null,
      }));
      events = [...events, ...extra].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
  }

  return NextResponse.json({ events });
}

// POST — create an event from the web: insert the row, then ask the
// bot Worker to sync it to Google Calendar (same call PATCH uses; the
// Worker creates the Google event when the row has no google_event_id).
export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const start = Date.parse(body.start_time);
  if (!title || Number.isNaN(start)) return NextResponse.json({ error: 'title_and_start_time_required' }, { status: 400 });
  const endParsed = body.end_time ? Date.parse(body.end_time) : NaN;
  const end = !Number.isNaN(endParsed) && endParsed >= start ? endParsed : start + 60 * 60 * 1000;
  const reminder = Number.isInteger(body.reminder_minutes) ? body.reminder_minutes : null;
  // a repeating appointment: the first row is its first date (on/after the date chosen); the rule does the rest
  let startMs = start, endMs = end, recur = null;
  if (body.repeat && body.repeat.freq) {
    const startDate = localDate(new Date(start).toISOString());
    const r = ruleFromForm(body.repeat, startDate);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    const hhmm = new Date(start + 7 * 3600e3).toISOString().slice(11, 16);
    startMs = Date.parse(`${r.first}T${hhmm}:00+07:00`);
    endMs = startMs + (end - start);
    recur = r.rule;
  }
  let calendarId = null;
  if (typeof body.calendar_id === 'string' && body.calendar_id.trim()) {
    const cals = await callBotInternal('/internal/calendar-calendars', { userId: session.lineUserId }).catch(() => null);
    const c = cals?.ok && cals.connected ? (cals.calendars || []).find(x => x.id === body.calendar_id) : null;
    if (!c || !c.writable) return NextResponse.json({ error: 'calendar_not_writable' }, { status: 400 });
    calendarId = c.id;
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: session.lineUserId,
      title: title.slice(0, 200),
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      location: body.location ? String(body.location).slice(0, 300) : null,
      description: body.description ? String(body.description).slice(0, 8000) : null,
      reminder_minutes: reminder,
      ...(calendarId ? { calendar_id: calendarId } : {}),
      ...(recur ? { recurrence_rule: recur, recur_exdates: [] } : {}),
      status: 'scheduled', // same value the LINE bot writes for a created event
    })
    .select()
    .single();

  if (error) {
    console.error('calendar insert failed:', error);
    if (recur) return NextResponse.json({ error: 'recurrence_not_ready', detail: 'run event_recurrence.sql in Supabase first' }, { status: 409 });
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }

  const syncResult = await callBotInternal('/internal/calendar-sync', { userId: session.lineUserId, eventId: data.id });
  return NextResponse.json({ event: data, syncResult });
}
