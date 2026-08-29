// app/api/admin/users/route.js
//
// Powers the user table in /admin. Same shared-password gate as
// set-premium — see the note in that file about why a single shared
// secret is acceptable here (Boq is the only admin).

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';


export async function GET(request) {
  const adminSecret = request.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();

  const supabase = supabaseAdmin();
  let query = supabase
    .from('users')
    .select('line_user_id, display_name, picture_url, phone_number, is_premium, premium_until, storage_quota_bytes, used_storage_bytes, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (search) {
    // Match on userId, display name, or phone — whichever the admin has on hand.
    query = query.or(`line_user_id.ilike.%${search}%,display_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('admin users list failed:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}
