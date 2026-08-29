// app/api/tasks/route.js
//
// GET  — list tasks (archived hidden by default, same pattern as notes)
// POST — create a new task

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const showArchived = searchParams.get('archived') === 'true';

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, task_name, category, priority, is_done, archived, recurrence, recurrence_time, google_event_id, created_at')
    .eq('user_id', session.lineUserId)
    .eq('archived', showArchived)
    .order('is_done', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

export async function POST(request) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const { task_name, priority, category } = await request.json();
  if (!task_name?.trim()) return NextResponse.json({ error: 'empty_task' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: session.lineUserId,
      task_name: task_name.trim(),
      priority: priority || 'medium',
      category: category || 'general',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ task: data });
}
