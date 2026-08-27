// app/api/admin/revoke-premium/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'edge';

export async function POST(request) {
  const { adminSecret, lineUserId } = await request.json();
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!lineUserId) return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .update({ is_premium: false, premium_until: null, storage_quota_bytes: 1073741824, updated_at: new Date().toISOString() })
    .eq('line_user_id', lineUserId)
    .select()
    .single();

  if (error) {
    console.error('admin revoke-premium failed:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ user: data });
}
