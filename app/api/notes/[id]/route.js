// app/api/notes/[id]/route.js
//
// PATCH — partial update (title/content/category/color/pinned/archived)
// DELETE — remove a note permanently
//
// Every query is scoped to BOTH id AND user_id — never trust the id
// alone, or one user could edit/delete another user's note by guessing
// an id.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { sanitizeNoteImages } from '../../../../lib/noteImages';
import { learnCategory } from '../../../../lib/lexicon';

const EDITABLE_FIELDS = ['title', 'content', 'category', 'color', 'images', 'pinned', 'archived', 'sort_order'];
// Only these count as "actually editing the note" — pin/archive/reorder
// are structural UI state, not content, so they shouldn't bump
// updated_at (that would wrongly make a reordered note look "recently
// edited" and mess up the fallback sort order for un-reordered notes).
const CONTENT_FIELDS = ['title', 'content', 'category', 'color', 'images'];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if ('images' in updates) updates.images = sanitizeNoteImages(updates.images);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }
  if (CONTENT_FIELDS.some(k => k in updates)) {
    updates.updated_at = new Date().toISOString();
  }

  const supabase = supabaseAdmin();
  // Only a real category CHANGE counts as a lesson (editors resend the unchanged category on every save).
  const prevCategory = 'category' in updates
    ? (await supabase.from('notes').select('category').eq('id', id).eq('user_id', session.lineUserId).maybeSingle()).data?.category
    : undefined;
  const { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  if ('category' in updates && data && prevCategory !== undefined && prevCategory !== updates.category) await learnCategory(supabase, session.lineUserId, 'note', data.title || String(data.content || '').split('\n')[0], updates.category);
  return NextResponse.json({ note: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', session.lineUserId);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
