// app/api/dev/mock-db/route.js — MOCK_MODE only (local browser tests): change a row directly, as "somebody else" would (404 everywhere else).
//   POST { table, id, patch }
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(request) {
  if (process.env.MOCK_MODE !== '1' || process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const { table, id, patch } = await request.json().catch(() => ({}));
  if (!['notes', 'tasks', 'calendar_events', 'group_push_optin', 'push_subscriptions'].includes(table)) return NextResponse.json({ error: 'bad_table' }, { status: 400 });
  const { data, error } = await supabaseAdmin().from(table).update(patch || {}).eq('id', id).select().single();
  return NextResponse.json({ data, error: error?.message || null });
}
