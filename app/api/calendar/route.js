// app/api/calendar/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'edge';

export async function GET() {
  const { session, isPremium } = await getPremiumSession(cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, location, status, reminder_minutes, google_event_id')
    .eq('user_id', session.lineUserId)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ events: data });
}
