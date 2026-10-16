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
import { callBotInternal } from '../../../../lib/botWorker';

const EDITABLE_FIELDS = ['task_name', 'priority', 'category', 'is_done', 'archived', 'recurrence', 'recurrence_time', 'due_at', 'due_all_day', 'details'];
const RECURRENCE_FIELDS = ['recurrence', 'recurrence_time'];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if ('due_at' in updates) {
    // null clears the due date; anything else must be a real date
    if (updates.due_at === null || updates.due_at === '') { updates.due_at = null; updates.due_all_day = false; }
    else {
      const ms = Date.parse(updates.due_at);
      if (Number.isNaN(ms)) return NextResponse.json({ error: 'bad_due' }, { status: 400 });
      updates.due_at = new Date(ms).toISOString();
      updates.due_all_day = updates.due_all_day === true;
    }
  }
  if ('due_all_day' in updates) updates.due_all_day = updates.due_all_day === true;
  if ('details' in updates) updates.details = typeof updates.details === 'string' && updates.details.trim() ? updates.details.slice(0, 20000) : null;
  if ('task_name' in updates && !String(updates.task_name || '').trim()) return NextResponse.json({ error: 'empty_task' }, { status: 400 });
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: ('due_at' in updates) ? 'due_unsupported' : ('details' in updates) ? 'details_unsupported' : 'db_error' }, { status: 500 });

  let recurrenceSync = null;
  if (RECURRENCE_FIELDS.some(f => f in updates)) {
    recurrenceSync = await callBotInternal('/internal/task-recurrence', { userId: session.lineUserId, taskId: id });
  }

  return NextResponse.json({ task: data, recurrenceSync });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
