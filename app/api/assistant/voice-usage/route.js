// app/api/assistant/voice-usage/route.js
//
// Bridges the voice widget's time-quota check/report to the bot
// Worker's voice_usage tracking. Two actions:
//   POST { action: 'check' }            — call before starting to listen
//   POST { action: 'add', seconds: N }  — call after a turn completes

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action, seconds } = await request.json().catch(() => ({}));
  if (!['check', 'add'].includes(action)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const result = await callBotInternal('/internal/voice-usage', {
    userId: session.lineUserId,
    action,
    seconds,
  });

  if (result?.allowed === undefined) {
    // Fail open on our side too — a broken bridge shouldn't disable
    // the feature, same reasoning as the bot Worker's own catch block.
    return NextResponse.json({ usedSeconds: 0, limitSeconds: 900, allowed: true });
  }
  return NextResponse.json(result);
}
