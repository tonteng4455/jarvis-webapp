// app/api/notes/images/route.js
//
// POST (multipart/form-data, field "file") — upload one photo for a
// note. The bytes go straight to the user's own Google Drive through
// the bot Worker (it holds the Google tokens) — nothing is stored in
// Supabase. Returns { image: { drive_file_id, name } }; the caller
// puts that reference into the note's `images` array.
//
// The browser downsizes photos before sending, so this stays well
// under the limits; the server re-checks type and size anyway.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp|gif)$/i;

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (!ALLOWED.test(file.type || '')) return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const result = await callBotInternal('/internal/note-image-upload', {
    userId: session.lineUserId,
    base64: toBase64(await file.arrayBuffer()),
    mimeType: file.type,
    fileName: file.name || 'note_image.jpg',
  });

  if (!result?.ok || !result.driveFileId) {
    const notConnected = String(result?.error || '').includes('google_not_connected');
    return NextResponse.json(
      { error: notConnected ? 'google_not_connected' : 'upload_failed' },
      { status: notConnected ? 409 : 502 }
    );
  }
  return NextResponse.json({ image: { drive_file_id: result.driveFileId, name: result.name || file.name || '' } });
}
