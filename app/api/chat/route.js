// app/api/chat/route.js — the chat box of the web app.
// POST { text } (something typed) or { postback: { data, params? } } (a button / quick reply that was tapped)
// → { messages: [LINE message objects] }.
// The web app has no brain of its own (and never calls an AI): the message goes to the bot Worker's /internal/chat, which runs the very
// same handlers as a LINE message — same appointments, notes, expenses, files, conversation state and daily AI quota.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { callBotInternal } from '../../../lib/botWorker';

export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const pb = body.postback && typeof body.postback.data === 'string' ? { data: body.postback.data.slice(0, 1000), ...(body.postback.params && typeof body.postback.params === 'object' ? { params: body.postback.params } : {}) } : null;
  if (!text && !pb) return NextResponse.json({ error: 'empty' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'too_long' }, { status: 400 });
  const r = await callBotInternal('/internal/chat', { userId: session.lineUserId, ...(pb ? { postback: pb } : { text }) });
  if (!r?.ok) return NextResponse.json({ error: r?.error || 'chat_failed' }, { status: 502 });
  return NextResponse.json({ messages: Array.isArray(r.messages) ? r.messages : [] });
}
