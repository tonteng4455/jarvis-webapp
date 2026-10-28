// app/api/notes/images/[id]/route.js
//
// GET    — a note's photo / drawing. These files are PRIVATE in the owner's Google Drive (no "anyone with the link"), so they are
//          shown through here: only the signed-in owner can load them (the bot Worker fetches them with the owner's own Google
//          token). Content never changes for a given id (an edited drawing is saved as a new file), so browsers may cache it.
// DELETE — move one of the person's note pictures to the Drive bin (recoverable there for 30 days) and take it off the image library.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../../lib/premium';
import { callBotInternalRaw } from '../../../../../lib/botWorker';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { binImages } from '../../../../../lib/noteImageIndex';

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

export async function GET(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return new Response('unauthorized', { status: 401 });
  if (!ID_RE.test(id)) return new Response('bad id', { status: 400 });

  // a per-person copy kept at the edge, so reopening a note does not call Google every time (checked AFTER sign-in)
  let cache = null; const cacheKey = `https://private-note-image.invalid/${encodeURIComponent(session.lineUserId)}/${id}`;
  try { cache = globalThis.caches?.default || null; } catch { cache = null; }
  const toBrowser = (body, type) => new Response(body, { status: 200, headers: { 'content-type': type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  if (cache) { try { const hit = await cache.match(cacheKey); if (hit) return toBrowser(hit.body, hit.headers.get('content-type') || 'image/png'); } catch { /* ignore */ } }

  const res = await callBotInternalRaw('/internal/note-image-download', { userId: session.lineUserId, driveFileId: id });
  if (!res) return new Response('unavailable', { status: 502 });
  if (!res.ok) { res.body?.cancel?.(); return new Response(res.status === 404 ? 'not found' : res.status === 409 ? 'google not connected' : 'error', { status: res.status === 404 || res.status === 409 ? res.status : 502 }); }

  const type = res.headers.get('content-type') || 'image/png';
  const bytes = await res.arrayBuffer();
  // The edge copy sits under a per-person key on a made-up host nobody can request, so it may be marked cacheable (the Cache API
  // refuses "private"); the browser always gets the "private" version.
  if (cache) { try { await cache.put(cacheKey, new Response(bytes, { status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } })); } catch { /* ignore */ } }
  return toBrowser(bytes, type);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const r = await binImages(supabaseAdmin(), session.lineUserId, [id]);
  return NextResponse.json({ ok: !!r.ok, deleted: r.deleted || 0 });
}
