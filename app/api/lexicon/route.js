// app/api/lexicon/route.js
// GET  — everything this person has taught Jarvis (or Jarvis learned from their corrections)
// POST — teach something from the web: { kind, scope?, trigger, value }
// Same table and rules as the LINE bot ("จำไว้ว่า …"); no AI here.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { sanitizeLexEntry, LEX_MAX_PER_USER } from '../../../lib/lexicon';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabaseAdmin().from('user_lexicon')
    .select('id, kind, scope, trigger, value, source, created_at').eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false }).limit(300);
  // Table not created yet → an empty list (the page explains), not an error screen.
  if (error) return NextResponse.json({ items: [], setup_needed: true });
  return NextResponse.json({ items: data, max: LEX_MAX_PER_USER });
}

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const entry = sanitizeLexEntry(await request.json().catch(() => ({})));
  if (!entry) return NextResponse.json({ error: 'invalid_entry' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: existing, error: listErr } = await supabase.from('user_lexicon').select('id, kind, scope, trigger').eq('user_id', session.lineUserId).limit(LEX_MAX_PER_USER + 1);
  if (listErr) return NextResponse.json({ error: 'setup_needed' }, { status: 503 });
  const same = existing.find(e => e.kind === entry.kind && e.scope === entry.scope && e.trigger === entry.trigger);
  if (!same && existing.length >= LEX_MAX_PER_USER) return NextResponse.json({ error: 'full', max: LEX_MAX_PER_USER }, { status: 409 });

  const q = same
    ? supabase.from('user_lexicon').update({ value: entry.value, source: 'taught' }).eq('id', same.id).eq('user_id', session.lineUserId)
    : supabase.from('user_lexicon').insert({ user_id: session.lineUserId, ...entry, source: 'taught' });
  const { data, error } = await q.select('id, kind, scope, trigger, value, source, created_at').single();
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ item: data });
}
