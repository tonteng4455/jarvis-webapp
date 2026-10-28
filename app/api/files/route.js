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
import { callBotInternal } from '../../../lib/botWorker';

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

// POST (multipart/form-data, field "file") — upload one file from the web app. The bytes go to the person's own Google Drive (folder
// "Bot_file") through the bot Worker, public by link like a file sent to the chat; a row in user_files makes it show up here, in the chat's
// file list and in the bot's file search. Up to 8 MB per file (the browser sends one file per request).
const MAX_BYTES = 8 * 1024 * 1024;
const kindOf = mime => (/^image\//i.test(mime) ? 'image' : /^video\//i.test(mime) ? 'video' : /^audio\//i.test(mime) ? 'audio' : 'file');
const MIME_BY_EXT = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'empty_file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const name = String(file.name || 'file').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) || 'file';
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(name) || [])[1]?.toLowerCase();
  const mime = (/^[\w.+-]+\/[\w.+-]+$/.test(file.type || '') && file.type !== 'application/octet-stream' ? file.type : MIME_BY_EXT[ext]) || 'application/octet-stream';

  const result = await callBotInternal('/internal/file-upload', { userId: session.lineUserId, base64: toBase64(await file.arrayBuffer()), mimeType: mime, fileName: name });
  if (!result?.ok || !result.driveFileId) {
    const notConnected = String(result?.error || '').includes('google_not_connected');
    return NextResponse.json({ error: notConnected ? 'google_not_connected' : String(result?.error || '').includes('too_large') ? 'too_large' : 'upload_failed', ...(notConnected && result.connectUrl ? { connectUrl: result.connectUrl } : {}) }, { status: notConnected ? 409 : 502 });
  }

  const supabase = supabaseAdmin();
  const row = { user_id: session.lineUserId, line_message_id: `web:${globalThis.crypto.randomUUID()}`, kind: kindOf(mime), mime_type: mime, file_name: name, size_bytes: file.size, storage: 'drive', drive_file_id: result.driveFileId, public_url: result.publicUrl || null };
  let { data, error } = await supabase.from('user_files').insert({ ...row, source: 'web' }).select('id, file_name, kind, mime_type, size_bytes, storage, public_url, drive_file_id, created_at, source, note_id').single();
  if (error) ({ data, error } = await supabase.from('user_files').insert(row).select('id, file_name, kind, mime_type, size_bytes, storage, public_url, drive_file_id, created_at').single());    // before note_images.sql
  if (error || !data) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ file: { ...data, source: data.source || 'chat', url: data.public_url || null, note_title: null } });
}
