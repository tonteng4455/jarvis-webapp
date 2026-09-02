// app/api/calendar/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';


export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, location, description, status, reminder_minutes, google_event_id')
    .eq('user_id', session.lineUserId)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ events: data });
}
