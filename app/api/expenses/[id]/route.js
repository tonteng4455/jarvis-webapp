// app/api/expenses/[id]/route.js
//
// PATCH/DELETE a single expense entry — Premium dashboard only (full
// session check (any logged-in user, capped by their tier's quota),
// Free path). No Google/bot sync involved — expenses never touch
// Google Calendar, so this is simpler than the calendar equivalent.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { learnCategory } from '../../../../lib/lexicon';

const EDITABLE_FIELDS = ['type', 'amount', 'category', 'memo'];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  // Only a real category CHANGE counts as a lesson (editors resend the unchanged category on every save).
  const prevCategory = 'category' in updates
    ? (await supabase.from('expenses').select('category').eq('id', id).eq('user_id', session.lineUserId).maybeSingle()).data?.category
    : undefined;
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  // A corrected category is a lesson for the bot ("this kind of text → that category").
  if (updates.category && data && prevCategory !== undefined && prevCategory !== updates.category) await learnCategory(supabase, session.lineUserId, 'expense', data.memo || '', updates.category);
  return NextResponse.json({ item: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
