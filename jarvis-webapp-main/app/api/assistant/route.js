// app/api/assistant/route.js
//
// Text-in/text-out bridge for the voice assistant widget. The browser
// does speech-to-text AND text-to-speech itself (Web Speech API — free,
// client-side) — this route's only job is handing the transcript to
// the bot Worker's routeVoiceText() (same task-execution chain LINE
// uses: matchExplicitCommand → aiResolveIntent → handleChitchat) and
// returning plain text back for SpeechSynthesis to speak. No new AI
// wiring here at all — this is a thin bridge, not a second brain.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { callBotInternal } from '../../../lib/botWorker';

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { text, reset } = await request.json().catch(() => ({}));
  if (!reset && !text?.trim()) return NextResponse.json({ error: 'missing_text' }, { status: 400 });

  const result = await callBotInternal('/internal/assistant-message', {
    userId: session.lineUserId,
    text: text?.trim(),
    reset: !!reset,
  });

  if (result?.reply === undefined && !result?.reset) {
    return NextResponse.json({ error: result?.error || 'assistant_unavailable' }, { status: 502 });
  }
  return NextResponse.json(result);
}
