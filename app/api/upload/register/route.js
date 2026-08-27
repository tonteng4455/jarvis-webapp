// app/api/upload/register/route.js
//
// Step 2 of a web upload: after the browser's PUT to the presigned URL
// succeeds, it calls this to actually record the file. Inserting into
// user_files is what fires the sync_user_storage_usage trigger (see
// phase1_schema.sql) that keeps users.used_storage_bytes accurate — the
// LINE bot's Worker does the equivalent insert directly after its own
// R2 upload, so both paths converge on the same table/trigger.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'edge';

export async function POST(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { r2Key, lineMessageId, fileName, fileSize, contentType, kind } = await request.json();
  if (!r2Key || !lineMessageId || !fileName || !fileSize) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  // Defence in depth: the key must actually belong to this user's own
  // prefix — never trust a client-supplied key blindly.
  if (!r2Key.startsWith(`files/${session.lineUserId}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('user_files')
    .insert({
      user_id: session.lineUserId,
      line_message_id: lineMessageId,
      kind: kind || 'file',
      mime_type: contentType || 'application/octet-stream',
      file_name: fileName,
      size_bytes: fileSize,
      r2_key: r2Key,
    })
    .select()
    .single();

  if (error) {
    console.error('user_files insert failed:', error);
    return NextResponse.json({ error: 'db_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ file: data });
}
