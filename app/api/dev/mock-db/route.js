// app/api/dev/mock-db/route.js — MOCK_MODE only (local browser tests): change a row directly, as "somebody else" would (404 everywhere else).
//   POST { table, id, patch }
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(request) {
  if (process.env.MOCK_MODE !== '1' || process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const { table, id, patch } = await request.json().catch(() => ({}));
  if (table === '__mock_group') { (globalThis.__mockGroupCfg ||= {})[id] = { connected: false, email: null, files: true, quoteText: false, ...((globalThis.__mockGroupCfg || {})[id] || {}), ...(patch || {}) }; return NextResponse.json({ ok: true }); }       // the mock bot's group settings (tests)
  if (table === '__mock_google_expired') { const set = (globalThis.__mockGoogleExpired ||= new Set()); if (patch?.expired) set.add(id); else set.delete(id); return NextResponse.json({ ok: true }); }
  if (!['notes', 'tasks', 'calendar_events', 'group_push_optin', 'push_subscriptions'].includes(table)) return NextResponse.json({ error: 'bad_table' }, { status: 400 });
  const { data, error } = await supabaseAdmin().from(table).update(patch || {}).eq('id', id).select().single();
  return NextResponse.json({ data, error: error?.message || null });
}
