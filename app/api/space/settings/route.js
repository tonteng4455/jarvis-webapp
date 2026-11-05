// app/api/space/settings/route.js — the ⚙️ panel of a group space (any member of the group may use it).
//   GET                      → { settings: { connected, email, driveFolderUrl, files, quoteText }, push: { optIn, devices } }
//   PATCH { files?, quoteText?, pushOptIn? }
//   POST  { action: 'connect' | 'disconnect', replace? }  → connect gives { url } for the Google sign-in (signed for this group by the bot)
// Only inside a group space; the member check has already been done (with LINE) by getSpaceSession.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSpaceSession } from '../../../../lib/space';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../../lib/botWorker';

async function groupSession() {
  const { session } = await getSpaceSession(await cookies());
  if (!session) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (session.space !== 'group') return { res: NextResponse.json({ error: 'not_in_group_space' }, { status: 400 }) };
  return { session };
}
async function pushState(session) {
  const supabase = supabaseAdmin();
  const [{ data: opt, error: optErr }, { data: subs }] = await Promise.all([
    supabase.from('group_push_optin').select('user_id').eq('group_id', session.groupId).eq('user_id', session.actorId).maybeSingle(),
    supabase.from('push_subscriptions').select('id').eq('user_id', session.actorId),
  ]);
  return { optIn: !!opt, devices: (subs || []).length, available: !optErr };
}

export async function GET() {
  const { session, res } = await groupSession(); if (res) return res;
  const r = await callBotInternal('/internal/group-settings', { groupId: session.groupId, action: 'get' });
  if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
  const { ok, ...settings } = r;
  return NextResponse.json({ settings, push: await pushState(session) });
}

export async function PATCH(request) {
  const { session, res } = await groupSession(); if (res) return res;
  const b = await request.json().catch(() => ({}));
  if (typeof b.pushOptIn === 'boolean') {
    const supabase = supabaseAdmin();
    const q = b.pushOptIn
      ? await supabase.from('group_push_optin').upsert({ group_id: session.groupId, user_id: session.actorId }, { onConflict: 'group_id,user_id' })
      : await supabase.from('group_push_optin').delete().eq('group_id', session.groupId).eq('user_id', session.actorId);
    if (q.error) return NextResponse.json({ error: 'push_unsupported' }, { status: 500 });          // group_trash.sql not run yet
  }
  if (typeof b.files === 'boolean' || typeof b.quoteText === 'boolean') {
    const r = await callBotInternal('/internal/group-settings', { groupId: session.groupId, action: 'set', ...(typeof b.files === 'boolean' ? { files: b.files } : {}), ...(typeof b.quoteText === 'boolean' ? { quoteText: b.quoteText } : {}) });
    if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, push: await pushState(session) });
}

export async function POST(request) {
  const { session, res } = await groupSession(); if (res) return res;
  const b = await request.json().catch(() => ({}));
  if (b.action === 'connect') {
    const r = await callBotInternal('/internal/group-settings', { groupId: session.groupId, action: 'connect', replace: b.replace === true });
    if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
    return NextResponse.json(r.alreadyConnected ? { alreadyConnected: true } : { url: r.url });
  }
  if (b.action === 'disconnect') {
    const r = await callBotInternal('/internal/group-settings', { groupId: session.groupId, action: 'disconnect' });
    if (!r?.ok) return NextResponse.json({ error: 'bot_unreachable' }, { status: 502 });
    const { ok, ...settings } = r;
    return NextResponse.json({ settings });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
