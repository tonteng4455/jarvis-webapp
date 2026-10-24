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
import { sanitizeNoteImages } from '../../../lib/noteImages';

const NOTES_LIMIT_FREE = 50; // keep in sync with NOTES_LIMIT_FREE on the bot's Worker

// fingerprint of a list of notes — the same value from the full list and from the light ?stamp=1 call
function notesStamp(rows) {
  const s = rows.map(r => `${r.id}|${r.updated_at}|${r.sort_order}|${r.pinned}|${r.color}|${r.category}`).sort().join(';');
  return `${rows.length}:${hashString(s)}`;
}

// small, stable string hash (FNV-1a) — only used to compare "same / different" between two polls
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export async function GET(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const showArchived = searchParams.get('archived') === 'true';

  const supabase = supabaseAdmin();

  // ?stamp=1 — "has anything changed?" for the open Notes page, which used to re-download every note every 8 s.
  // Returns a short fingerprint built from the tiny columns only (no note text, no images).
  if (searchParams.get('stamp') === '1') {
    const { data: rows, error: stampErr } = await supabase
      .from('notes')
      .select('id, updated_at, sort_order, pinned, color, category')
      .eq('user_id', session.lineUserId)
      .eq('archived', showArchived)
      .limit(500);
    if (stampErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    return NextResponse.json({ stamp: notesStamp(rows) });
  }

  // ?recent=N — only the N most recent notes (pinned first), for Today's "latest notes" card.
  const recent = Math.min(20, Math.max(0, parseInt(searchParams.get('recent') || '0', 10) || 0));
  if (recent > 0) {
    const { data: rows, error: recentErr } = await supabase
      .from('notes')
      .select('id, title, content, category, color, images, pinned, archived, sort_order, created_at, updated_at')
      .eq('user_id', session.lineUserId)
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(recent);
    if (recentErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });
    return NextResponse.json({ notes: rows, partial: true });
  }

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, category, color, images, pinned, archived, sort_order, created_at, updated_at')
    .eq('user_id', session.lineUserId)
    .eq('archived', showArchived)
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ notes: data, stamp: notesStamp(data) });
}

export async function POST(request) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { title, content, category, color, images, pinned } = await request.json();
  const cleanImages = sanitizeNoteImages(images);
  if (!title?.trim() && !content?.trim() && cleanImages.length === 0) {
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

  // New notes always land at the very top of the list — one less than
  // whatever the current lowest sort_order is (GET orders sort_order
  // ASC, nulls last) — until the user drags something else above it or
  // moves this one elsewhere themselves. Mirrors the bot's own
  // getTopSortOrder() in jarvis-line-bot.js so a note jotted via LINE
  // and one created here behave identically.
  const { data: topRow } = await supabase
    .from('notes')
    .select('sort_order')
    .eq('user_id', session.lineUserId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = typeof topRow?.sort_order === 'number' ? topRow.sort_order - 1 : 0;

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: session.lineUserId,
      title: title?.trim() || '',
      content: content?.trim() || '',
      category: category || 'general',
      color: color || 'default',
      pinned: pinned === true,
      images: cleanImages,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ note: data });
}
