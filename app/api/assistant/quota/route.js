// app/api/assistant/quota/route.js
//
// GET — raw quota numbers (AI call count, voice daily seconds, Chirp 3
// HD monthly characters) for display on the settings page. Previously
// the only way to check any of this was asking through the voice
// assistant itself, or LINE (which only has the AI-count dimension).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await callBotInternal('/internal/quota-status', { userId: session.lineUserId });
  if (!result?.ai) return NextResponse.json({ error: 'failed' }, { status: 502 });
  return NextResponse.json(result);
}
