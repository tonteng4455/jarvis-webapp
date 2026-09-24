// app/api/assistant/preferences/route.js
//
// GET  — returns the saved voice name/lang + personality style +
//        assistant name/gender (webapp-only persona, see the bot's
//        applyVoicePersona for why this never touches LINE).
// POST — saves whichever fields are provided.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await callBotInternal('/internal/voice-preferences', {
    userId: session.lineUserId,
    action: 'get',
  });
  return NextResponse.json(result?.voiceName !== undefined
    ? result
    : { voiceName: null, voiceLang: null, personality: '', assistantName: null, assistantGender: null, autoGreet: true, greetingMessage: null, endingParticle: null });
}

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { voiceName, voiceLang, personality, assistantName, assistantGender, autoGreet, greetingMessage, endingParticle } = await request.json().catch(() => ({}));
  const result = await callBotInternal('/internal/voice-preferences', {
    userId: session.lineUserId,
    action: 'set',
    voiceName, voiceLang, personality, assistantName, assistantGender, autoGreet, greetingMessage, endingParticle,
  });
  return NextResponse.json(
    result?.ok ? result : { error: result?.error || 'save_failed', detail: result?.detail },
    { status: result?.ok ? 200 : 502 }
  );
}
