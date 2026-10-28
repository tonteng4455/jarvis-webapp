// app/api/files/route.js
//
// GET — list this user's files. Storage is Google Drive only (the
// user's own account, see the bot's uploadToDrive/Bot_file folder);
// each row already carries its own public_url from upload time.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { backfillLibrary } from '../../../lib/noteImageIndex';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  await backfillLibrary(supabase, session.lineUserId).catch(e => console.error('image library backfill:', e?.message));      // pictures made before the library existed
  const base = 'id, file_name, kind, mime_type, size_bytes, storage, public_url, drive_file_id, created_at';
  let { data, error } = await supabase
    .from('user_files')
    .select(base + ', source, note_id')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {                                                   // before note_images.sql has been run there are no source / note_id columns
    ({ data, error } = await supabase.from('user_files').select(base).eq('user_id', session.lineUserId).order('created_at', { ascending: false }).limit(500));
  }

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  // the title of the note each library picture is in now
  const noteIds = [...new Set(data.map(f => f.note_id).filter(Boolean))];
  const titles = {};
  if (noteIds.length) { const { data: ns } = await supabase.from('notes').select('id, title, content').eq('user_id', session.lineUserId).in('id', noteIds); for (const n of ns || []) titles[n.id] = (n.title || '').trim() || String(n.content || '').split('\n')[0].slice(0, 40) || 'โน้ตไม่มีชื่อ'; }
  const files = data.map(f => ({ ...f, source: f.source || 'chat', url: f.public_url || null, note_title: f.note_id ? titles[f.note_id] || null : null }));

  return NextResponse.json({ files });
}
