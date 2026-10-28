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
