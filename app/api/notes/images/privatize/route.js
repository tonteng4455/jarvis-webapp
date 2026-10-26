// app/api/notes/images/privatize/route.js
//
// POST { offset } — one-time clean-up: note photos uploaded before this change carry an "anyone with the link" permission in
// Google Drive. This removes it, a batch at a time (the page calls it repeatedly until `done`), so every note image becomes
// private to its owner. Photos that LINE shows in chat (the ones in the file list) keep their link — LINE needs it.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../../lib/premium';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../../../lib/botWorker';

const BATCH = 30;
const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const offset = Math.max(0, parseInt(body.offset, 10) || 0);

  const supabase = supabaseAdmin();
  const [{ data: notes, error }, { data: files }] = await Promise.all([
    supabase.from('notes').select('images').eq('user_id', session.lineUserId),
    supabase.from('user_files').select('drive_file_id').eq('user_id', session.lineUserId),
  ]);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const shownInLine = new Set((files || []).map(f => f.drive_file_id).filter(Boolean));
  const ids = [...new Set((notes || []).flatMap(n => (Array.isArray(n.images) ? n.images : []).map(i => i?.drive_file_id)).filter(id => typeof id === 'string' && ID_RE.test(id) && !shownInLine.has(id)))].sort();
  const slice = ids.slice(offset, offset + BATCH);
  if (slice.length === 0) return NextResponse.json({ done: true, total: ids.length, next: offset });

  const r = await callBotInternal('/internal/note-images-privatize', { userId: session.lineUserId, driveFileIds: slice });
  if (!r?.ok) return NextResponse.json({ error: r?.error || 'bot_error', connectUrl: r?.connectUrl }, { status: r?.error === 'google_not_connected' ? 409 : 502 });
  const next = offset + slice.length;
  return NextResponse.json({ done: next >= ids.length, total: ids.length, next, failed: r.failed || 0 });
}
