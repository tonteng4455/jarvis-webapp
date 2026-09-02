// app/api/files/route.js
//
// GET — list this user's files plus their storage usage vs quota.
// Files themselves live in R2 (owned by the bot's Worker) — this route
// only reads the POINTER rows Supabase holds (file_name, size, r2_key,
// etc.) and builds each file's public URL from WORKER_BASE_URL, the
// same convention the bot's own fileServeUrl() uses. No R2 access is
// needed here at all for listing, only for delete (see [id]/route.js).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const FILE_QUOTA_FREE = 1073741824;   // 1 GB — keep in sync with FILE_QUOTA_BYTES default on the bot
const FILE_QUOTA_PREMIUM = 5368709120; // 5 GB

export async function GET() {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('user_files')
    .select('id, file_name, kind, mime_type, size_bytes, r2_key, created_at')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const workerBase = (process.env.WORKER_URL || '').replace(/\/$/, '');
  const files = data.map(f => ({
    ...f,
    url: workerBase ? `${workerBase}/${f.r2_key}` : null,
  }));

  const usedBytes = data.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
  const quotaBytes = isPremium ? FILE_QUOTA_PREMIUM : FILE_QUOTA_FREE;

  return NextResponse.json({ files, usedBytes, quotaBytes, isPremium });
}
