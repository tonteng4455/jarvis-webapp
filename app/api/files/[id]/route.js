// app/api/files/[id]/route.js
//
// DELETE — remove a file. The file lives in the user's Google Drive,
// which only the bot's Worker has tokens for, so this calls through to
// it via the same service-binding helper the calendar/expense routes
// use — see lib/botWorker.js.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await callBotInternal('/internal/file-delete', { userId: session.lineUserId, fileId: id });
  if (!result.ok) return NextResponse.json({ error: result.error || 'delete_failed' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
