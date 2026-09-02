// app/api/notes/route.js
//
// GET  — list notes (Keep-style: pinned first, archived hidden by default)
// POST — create a new note. Free tier is capped at NOTES_LIMIT_FREE
// (matches the SAME limit the bot enforces — see requireNoteQuota in
// jarvis-line-bot.js) — this used to be moot since only Premium could
// reach this route at all; now that the whole dashboard is open to
// everyone, the cap has to be enforced here too, not just bot-side.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const NOTES_LIMIT_FREE = 50; // keep in sync with NOTES_LIMIT_FREE on the bot's Worker

export async function GET(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const showArchived = searchParams.get('archived') === 'true';

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, category, color, pinned, archived, sort_order, created_at, updated_at')
    .eq('user_id', session.lineUserId)
    .eq('archived', showArchived)
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ notes: data });
}

export async function POST(request) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { title, content, category, color } = await request.json();
  if (!title?.trim() && !content?.trim()) {
    return NextResponse.json({ error: 'empty_note' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  if (!isPremium) {
    const { count } = await supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.lineUserId);
    if ((count || 0) >= NOTES_LIMIT_FREE) {
      return NextResponse.json({ error: 'quota_reached', limit: NOTES_LIMIT_FREE }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: session.lineUserId,
      title: title?.trim() || '',
      content: content?.trim() || '',
      category: category || 'general',
      color: color || 'default',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ note: data });
}
