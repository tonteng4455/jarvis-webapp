// app/api/expenses/[id]/route.js
//
// PATCH/DELETE a single expense entry — Premium dashboard only (full
// session + isPremium check, unlike /api/scoped-edit's token-based
// Free path). No Google/bot sync involved — expenses never touch
// Google Calendar, so this is simpler than the calendar equivalent.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const EDITABLE_FIELDS = ['type', 'amount', 'category', 'memo'];

export async function PATCH(request, { params }) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request, { params }) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('expenses').delete().eq('id', params.id).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
