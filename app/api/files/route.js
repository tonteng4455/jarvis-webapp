// app/api/files/route.js
//
// GET — list this user's files. Storage is now Google Drive (the
// user's own account, see the bot's uploadToDrive/Bot_file folder) —
// R2 is only for files uploaded before that change existed. Each
// file's `url` is built differently depending on which backend it
// actually lives in (see `storage` on the row): Drive files already
// carry their own public_url from upload time; only legacy R2 rows
// still need building from WORKER_BASE_URL + r2_key.

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
    .select('id, file_name, kind, mime_type, size_bytes, storage, r2_key, public_url, created_at')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const workerBase = (process.env.WORKER_URL || '').replace(/\/$/, '');
  const files = data.map(f => ({
    ...f,
    url: f.storage === 'drive'
      ? (f.public_url || null)
      : (workerBase && f.r2_key ? `${workerBase}/${f.r2_key}` : null),
  }));

  return NextResponse.json({ files });
}
