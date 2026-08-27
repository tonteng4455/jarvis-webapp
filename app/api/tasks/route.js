// app/api/tasks/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';


export async function GET() {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, task_name, category, priority, is_done, created_at')
    .eq('user_id', session.lineUserId)
    .order('is_done', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ tasks: data });
}
