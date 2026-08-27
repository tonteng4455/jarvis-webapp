// app/api/files/route.js
//
// Session-scoped file list/delete — the web equivalent of the bot's
// "📁 ไฟล์" menu. Reads/writes the SAME user_files table the Worker
// uses, so a file uploaded via LINE shows up here and vice versa.
//
// "Open" links are Premium-only and generated fresh on every request as
// short-lived presigned R2 URLs — NOT a static public bucket URL (that
// approach didn't actually resolve reliably and has been removed
// everywhere, including the bot's file list). Free users still get the
// full file list (name/size/date) and can delete, matching what the
// bot itself shows — they just don't get a working open link, which is
// the intended nudge toward Premium.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { r2Bucket, presignGetUrl } from '../../../lib/r2';
import { AwsClient } from 'aws4fetch';


export async function GET() {
  const { session, isPremium } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('user_files')
    .select('id, kind, mime_type, file_name, size_bytes, r2_key, created_at')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  const files = await Promise.all(data.map(async f => {
    if (!isPremium) return { ...f, url: null };
    try {
      const url = await presignGetUrl({ bucket: r2Bucket(), key: f.r2_key });
      return { ...f, url };
    } catch (e) {
      console.error('presignGetUrl failed for', f.r2_key, e);
      return { ...f, url: null };
    }
  }));

  return NextResponse.json({ files, isPremium });
}

export async function DELETE(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: row } = await supabase
    .from('user_files').select('r2_key').eq('id', id).eq('user_id', session.lineUserId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Delete the R2 object directly via the S3 API (same credentials as
  // the presigned-upload helper — see lib/r2.js).
  try {
    const client = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      service: 's3', region: 'auto',
    });
    const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    await client.fetch(`${endpoint}/${r2Bucket()}/${row.r2_key}`, { method: 'DELETE' });
  } catch (e) {
    console.error('R2 delete failed:', e); // still remove the DB row below — don't leave an orphaned pointer
  }

  const { error } = await supabase.from('user_files').delete().eq('id', id).eq('user_id', session.lineUserId);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
