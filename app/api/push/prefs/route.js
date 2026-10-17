// app/api/push/prefs/route.js — reminder preferences (users.push_prefs) + how many devices are subscribed
//   GET → { prefs, devices }    PUT { …some prefs… } → { prefs }

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { normalizePrefs, parsePrefsInput } from '../../../../lib/pushPrefs';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = supabaseAdmin();
  const { data: user } = await supabase.from('users').select('push_prefs').eq('line_user_id', session.lineUserId).maybeSingle();   // column missing → null → defaults
  const { data: subs } = await supabase.from('push_subscriptions').select('id').eq('user_id', session.lineUserId);
  return NextResponse.json({ prefs: normalizePrefs(user?.push_prefs), devices: (subs || []).length });
}

export async function PUT(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const input = parsePrefsInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'bad_prefs' }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data: user } = await supabase.from('users').select('push_prefs').eq('line_user_id', session.lineUserId).maybeSingle();
  const prefs = normalizePrefs({ ...normalizePrefs(user?.push_prefs), ...input });
  const { error } = await supabase.from('users').update({ push_prefs: prefs }).eq('line_user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'push_unsupported' }, { status: 500 });
  return NextResponse.json({ prefs });
}
