// app/api/trash/route.js — the 30-day trash of a GROUP space (see lib/space.js trashRow, and the bot's trashGroupRows).
//   GET                      → { items: [{ id, kind, label, deleted_at, days_left, deleted_by_name }] }
//   POST   { id }            → put it back (same id, for a note / task / appointment)
//   DELETE ?id=…  or ?all=1  → remove for good
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSpaceSession, trashLabel, TRASH_DAYS } from '../../../lib/space';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { callBotInternal } from '../../../lib/botWorker';
import { registerNoteImages } from '../../../lib/noteImageIndex';

const KIND = { notes: 'note', tasks: 'task', calendar_events: 'event' };
async function groupSession() {
  const { session } = await getSpaceSession(await cookies());
  if (!session) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (session.space !== 'group') return { res: NextResponse.json({ error: 'not_in_group_space' }, { status: 400 }) };
  return { session };
}
const cutoff = () => new Date(Date.now() - TRASH_DAYS * 86400e3).toISOString();

export async function GET() {
  const { session, res } = await groupSession(); if (res) return res;
  const supabase = supabaseAdmin();
  await supabase.from('group_trash').delete().eq('group_id', session.groupId).lt('deleted_at', cutoff());          // anything older than 30 days goes
  const { data, error } = await supabase.from('group_trash').select('id, table_name, row_data, deleted_by, deleted_at').eq('group_id', session.groupId).order('deleted_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ items: [], unavailable: true });                    // group_trash.sql not run yet
  const ids = [...new Set((data || []).map(r => r.deleted_by).filter(Boolean))];
  const names = new Map();
  if (ids.length) { const { data: people } = await supabase.from('users').select('line_user_id, display_name').in('line_user_id', ids); for (const p of people || []) names.set(p.line_user_id, p.display_name); }
  return NextResponse.json({ items: (data || []).map(r => ({
    id: r.id, kind: KIND[r.table_name] || 'note', label: trashLabel(r.table_name, r.row_data || {}), deleted_at: r.deleted_at,
    days_left: Math.max(0, Math.ceil((Date.parse(r.deleted_at) + TRASH_DAYS * 86400e3 - Date.now()) / 86400e3)),
    deleted_by_name: r.deleted_by ? (r.deleted_by === session.actorId ? 'คุณ' : names.get(r.deleted_by) || 'สมาชิกกลุ่ม') : null,
    when: r.row_data?.start_time || null,
  })) });
}

export async function POST(request) {
  const { session, res } = await groupSession(); if (res) return res;
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data: t } = await supabase.from('group_trash').select('*').eq('id', id).eq('group_id', session.groupId).maybeSingle();
  if (!t || Date.parse(t.deleted_at) < Date.now() - TRASH_DAYS * 86400e3) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const row = { ...(t.row_data || {}), user_id: session.groupId };
  if (t.table_name === 'calendar_events') { delete row.google_event_id; }              // the Google copy was removed with it: a new one is made below
  if (t.table_name === 'tasks') { delete row.google_event_id; delete row.remind_state; }
  if (t.table_name === 'calendar_events') row.status = row.status === 'cancelled' ? 'scheduled' : row.status;
  let ins = await supabase.from(t.table_name).insert(row).select().single();
  const dup = ins.error && /duplicate|already exists|23505/i.test(`${ins.error.code} ${ins.error.message}`);
  // an appointment that was only "cancelled" (the bot and the web app do that, the row stays) comes back by flipping its status
  if (dup && t.table_name === 'calendar_events') ins = await supabase.from('calendar_events').update({ status: 'scheduled', google_event_id: null }).eq('id', row.id).eq('user_id', session.groupId).select().single();
  else if (dup) ins = { data: null, error: null };                                 // already back (restored twice)
  if (ins.error) return NextResponse.json({ error: 'restore_failed' }, { status: 500 });
  await supabase.from('group_trash').delete().eq('id', id);
  if (ins.data) {
    if (t.table_name === 'calendar_events') await callBotInternal('/internal/calendar-sync', { userId: session.groupId, eventId: ins.data.id }).catch(() => {});
    if (t.table_name === 'notes' && (ins.data.images || []).length) await registerNoteImages(supabase, session.groupId, ins.data).catch(() => {});
  }
  return NextResponse.json({ restored: true, kind: KIND[t.table_name] });
}

export async function DELETE(request) {
  const { session, res } = await groupSession(); if (res) return res;
  const url = new URL(request.url); const supabase = supabaseAdmin();
  if (url.searchParams.get('all') === '1') await supabase.from('group_trash').delete().eq('group_id', session.groupId);
  else if (url.searchParams.get('id')) await supabase.from('group_trash').delete().eq('id', url.searchParams.get('id')).eq('group_id', session.groupId);
  else return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
