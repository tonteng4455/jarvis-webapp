// app/api/assistant/speak/route.js
//
// Bridges to Chirp 3 HD speech synthesis, with the monthly $-cost
// quota enforced server-side (bot Worker, tts_usage table). Returns
// { allowed: true, audioContent: <base64 mp3> } when synthesis
// succeeded and was within quota, or { allowed: false } when the
// quota's used up or synthesis failed for any reason — the widget's
// job is to fall back to the browser's own free SpeechSynthesis
// whenever allowed is false, never to show an error for that.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { text } = await request.json().catch(() => ({}));
  if (!text?.trim()) return NextResponse.json({ error: 'missing_text' }, { status: 400 });

  const result = await callBotInternal('/internal/voice-synthesize', {
    userId: session.lineUserId,
    text: text.trim(),
  });

  // Fail toward "not allowed" (→ browser fallback) rather than erroring
  // the whole request — same reasoning as the bot Worker's own catch.
  return NextResponse.json(result?.allowed !== undefined ? result : { allowed: false });
}
