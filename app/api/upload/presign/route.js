// app/api/upload/presign/route.js
//
// Step 1 of a web upload: the browser asks us for a presigned R2 PUT URL.
// We check the user's CURRENT quota/usage from `users` FIRST and refuse
// before ever handing out a URL — this is the "strict server-side quota
// check before generating presigned upload URLs" from the spec.
//
// Note: this is a check-then-act, same caveat as the LINE bot's own
// quota check — fine for expected traffic levels, but two uploads
// racing at the exact same instant could both pass the check before
// either's size is counted. Acceptable for Phase 1; flagged in the
// handoff notes if this ever needs to be made atomic.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { presignPutUrl, r2Bucket } from '../../../../lib/r2';

export const runtime = 'edge';

export async function POST(request) {
  const session = await getSession(cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { fileName, fileSize, contentType, kind } = await request.json();
  if (!fileName || !fileSize || fileSize <= 0) {
    return NextResponse.json({ error: 'fileName and fileSize are required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // effective_quota_bytes() and users.used_storage_bytes are both
  // maintained server-side (see phase1_schema.sql) — this is the same
  // source of truth the LINE bot's Worker reads, so limits stay in sync
  // across LINE and the web app.
  const [{ data: quotaData, error: quotaErr }, { data: userRow, error: userErr }] = await Promise.all([
    supabase.rpc('effective_quota_bytes', { p_line_user_id: session.lineUserId }),
    supabase.from('users').select('used_storage_bytes').eq('line_user_id', session.lineUserId).maybeSingle(),
  ]);
  if (quotaErr || userErr) {
    console.error('quota lookup failed:', quotaErr || userErr);
    return NextResponse.json({ error: 'quota_lookup_failed' }, { status: 500 });
  }

  const quotaBytes = quotaData ?? 1073741824;
  const usedBytes = userRow?.used_storage_bytes ?? 0;

  if (usedBytes + fileSize > quotaBytes) {
    return NextResponse.json(
      {
        error: 'quota_exceeded',
        message: `พื้นที่จัดเก็บของคุณเต็มแล้วครับ (${(usedBytes / 1048576).toFixed(1)}MB / ${(quotaBytes / 1048576).toFixed(0)}MB) กรุณาลบไฟล์เก่าหรืออัปเกรดเป็น Premium`,
        usedBytes, quotaBytes,
      },
      { status: 413 }
    );
  }

  const lineMessageId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const r2Key = `files/${session.lineUserId}/${lineMessageId}`;

  const uploadUrl = await presignPutUrl({ bucket: r2Bucket(), key: r2Key, contentType });

  return NextResponse.json({
    uploadUrl,
    r2Key,
    lineMessageId,
    // The client PUTs the file bytes to uploadUrl directly, then calls
    // /api/upload/register with these same fields to create the DB row.
  });
}
