// app/api/files/route.js
//
// GET — list this user's files. Storage is Google Drive only (the
// user's own account, see the bot's uploadToDrive/Bot_file folder);
// each row already carries its own public_url from upload time.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('user_files')
    .select('id, file_name, kind, mime_type, size_bytes, storage, public_url, drive_file_id, created_at')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const files = data.map(f => ({ ...f, url: f.public_url || null }));

  return NextResponse.json({ files });
}
