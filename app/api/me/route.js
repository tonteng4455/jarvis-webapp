// app/api/me/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'edge';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const [{ data: quotaBytes }, { data: user }] = await Promise.all([
    supabase.rpc('effective_quota_bytes', { p_line_user_id: session.lineUserId }),
    supabase.from('users').select('*').eq('line_user_id', session.lineUserId).maybeSingle(),
  ]);

  return NextResponse.json({
    lineUserId: session.lineUserId,
    displayName: user?.display_name ?? session.displayName,
    pictureUrl: user?.picture_url ?? session.pictureUrl,
    phoneNumber: user?.phone_number ?? null,
    isPremium: user?.is_premium ?? false,
    premiumUntil: user?.premium_until ?? null,
    usedBytes: user?.used_storage_bytes ?? 0,
    quotaBytes: quotaBytes ?? 1073741824,
  });
}
