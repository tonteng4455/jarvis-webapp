// app/api/scoped-edit/route.js
//
// GET/PATCH a single note or calendar event via a scoped, time-limited
// token (see lib/scopedToken.js) instead of the normal session cookie
// + Premium check. This is the ENTIRE point of the scoped-editor flow:
// Free users get real editing for the one item they tapped "แก้ไข" on
// in chat, without opening up dashboard access generally — there is no
// "list everything" here, only fetch/update of the exact id encoded in
// the token, for the exact user it was issued to, for 15 minutes.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { verifyScopedToken } from '../../../lib/scopedToken';
import { callBotInternal } from '../../../lib/botWorker';

const TABLE_BY_TYPE = { note: 'notes', calendar: 'calendar_events', expense: 'expenses' };

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  const payload = await verifyScopedToken(token);
  if (!payload) return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 401 });

  const supabase = supabaseAdmin();
  const table = TABLE_BY_TYPE[payload.t];
  const { data, error } = await supabase.from(table).select('*').eq('id', payload.id).eq('user_id', payload.sub).single();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ itemType: payload.t, item: data });
}

export async function PATCH(request) {
  const token = new URL(request.url).searchParams.get('token');
  const payload = await verifyScopedToken(token);
  if (!payload) return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 401 });

  const body = await request.json();
  const supabase = supabaseAdmin();

  if (payload.t === 'note') {
    const updates = {};
    if ('title' in body) updates.title = body.title;
    if ('content' in body) updates.content = body.content;
    const { data, error } = await supabase.from('notes').update(updates).eq('id', payload.id).eq('user_id', payload.sub).select().single();
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  if (payload.t === 'expense') {
    const updates = {};
    for (const key of ['type', 'amount', 'category', 'memo']) {
      if (key in body) updates[key] = body[key];
    }
    const { data, error } = await supabase.from('expenses').update(updates).eq('id', payload.id).eq('user_id', payload.sub).select().single();
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  // calendar
  const updates = {};
  for (const key of ['title', 'start_time', 'end_time', 'location', 'description', 'reminder_minutes']) {
    if (key in body) updates[key] = body[key];
  }
  const { data, error } = await supabase.from('calendar_events').update(updates).eq('id', payload.id).eq('user_id', payload.sub).select().single();
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const syncResult = await callBotInternal('/internal/calendar-sync', { userId: payload.sub, eventId: payload.id });
  return NextResponse.json({ item: data, syncResult });
}
