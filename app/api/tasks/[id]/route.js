// app/api/tasks/[id]/route.js
//
// PATCH — partial update (task_name/priority/category/is_done/archived/
// recurrence/recurrence_time). When recurrence-related fields change,
// this ALSO calls the Worker's internal endpoint to create/update/
// remove the recurring Google Calendar reminder — the Worker is the
// only place that holds anyone's Google OAuth tokens, so this route
// never touches Google's API directly, only asks the Worker to.
// DELETE — remove a task permanently

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const EDITABLE_FIELDS = ['task_name', 'priority', 'category', 'is_done', 'archived', 'recurrence', 'recurrence_time'];
const RECURRENCE_FIELDS = ['recurrence', 'recurrence_time'];

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
    .from('tasks')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  let recurrenceSync = null;
  if (RECURRENCE_FIELDS.some(f => f in updates)) {
    recurrenceSync = await syncRecurrenceViaWorker(session.lineUserId, params.id);
  }

  return NextResponse.json({ task: data, recurrenceSync });
}

export async function DELETE(request, { params }) {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('tasks').delete().eq('id', params.id).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

async function syncRecurrenceViaWorker(userId, taskId) {
  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!workerUrl || !secret) {
    console.error('WORKER_URL/INTERNAL_API_SECRET not configured — cannot sync task routine to Google');
    return { synced: false, error: 'not_configured' };
  }
  try {
    const res = await fetch(`${workerUrl}/internal/task-recurrence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ userId, taskId }),
    });
    return await res.json();
  } catch (e) {
    console.error('syncRecurrenceViaWorker failed:', e);
    return { synced: false, error: e.message };
  }
}
