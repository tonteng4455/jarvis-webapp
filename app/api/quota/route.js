// app/api/quota/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';


export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const [{ data: quotaBytes }, { data: user }] = await Promise.all([
    supabase.rpc('effective_quota_bytes', { p_line_user_id: session.lineUserId }),
    supabase.from('users').select('used_storage_bytes, is_premium, premium_until').eq('line_user_id', session.lineUserId).maybeSingle(),
  ]);

  return NextResponse.json({
    usedBytes: user?.used_storage_bytes ?? 0,
    quotaBytes: quotaBytes ?? 1073741824,
    isPremium: user?.is_premium ?? false,
    premiumUntil: user?.premium_until ?? null,
  });
}
