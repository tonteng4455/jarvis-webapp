// app/api/files/[id]/route.js
//
// DELETE — remove a file (a note's picture goes to the Drive bin instead — see lib/noteImageIndex.js). The file lives in the user's Google Drive,
// which only the bot's Worker has tokens for, so this calls through to
// it via the same service-binding helper the calendar/expense routes
// use — see lib/botWorker.js.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { binImages } from '../../../../lib/noteImageIndex';
import { finalFileName, driveNameFor, cleanDescription } from '../../../../lib/fileNames';

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('user_files').select('id, source, drive_file_id').eq('id', id).eq('user_id', session.lineUserId).maybeSingle();
  if (row?.source === 'note') {                                  // a picture made in a note: Drive's bin (kept 30 days there), off the library
    const r = await binImages(supabase, session.lineUserId, [row.drive_file_id]);
    if (!r.ok) return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
    return NextResponse.json({ deleted: true, bin: true });
  }
  const result = await callBotInternal('/internal/file-delete', { userId: session.lineUserId, fileId: id });
  if (!result.ok) return NextResponse.json({ error: result.error || 'delete_failed' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

// PATCH { name?, description? } — rename a file (the system's name AND the file in Google Drive; the very first name is kept so it can
// still be searched) and / or set its description. Both are searched by the LINE bot and the Files page.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('user_files').select('*').eq('id', id).eq('user_id', session.lineUserId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const patch = {}; let driveOk = true;
  if (typeof body.name === 'string') {
    const newName = finalFileName(row.file_name, body.name);
    if (!newName) return NextResponse.json({ error: 'empty_name' }, { status: 400 });
    if (newName !== row.file_name) {
      if (row.storage === 'drive' && row.drive_file_id) {
        const r = await callBotInternal('/internal/file-rename', { userId: session.lineUserId, driveFileId: row.drive_file_id, name: driveNameFor(row, newName) });
        driveOk = !!r?.ok;                                   // a failed Drive rename does not stop the system's own rename
      }
      patch.file_name = newName;
      if (!row.original_name) patch.original_name = row.file_name;
    }
  }
  if ('description' in body) patch.description = cleanDescription(body.description) || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ file: row, driveOk });

  let { data, error } = await supabase.from('user_files').update(patch).eq('id', id).eq('user_id', session.lineUserId).select('*').single();
  if (error && ('original_name' in patch || 'description' in patch)) {               // before file_rename.sql: only the name can be saved
    if ('description' in patch && !('file_name' in patch)) return NextResponse.json({ error: 'needs_sql' }, { status: 409 });
    ({ data, error } = await supabase.from('user_files').update({ file_name: patch.file_name }).eq('id', id).eq('user_id', session.lineUserId).select('*').single());
  }
  if (error || !data) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ file: { ...data, source: data.source || 'chat', url: data.public_url || null }, driveOk });
}
