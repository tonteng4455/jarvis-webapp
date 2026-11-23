// app/api/notes/[id]/route.js
//
// PATCH — partial update (title/content/category/color/pinned/archived/parent_id). parent_id moves the note under another note (null = top level);
//         archiving a note archives the notes under it too.
// DELETE — remove a note permanently. ?children=lift (default: its sub-notes move up one level) | delete (they go with it)
//
// Every query is scoped to BOTH id AND user_id — never trust the id
// alone, or one user could edit/delete another user's note by guessing
// an id.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSpaceSession as getPremiumSession, attachCreators, trashRow } from '../../../../lib/space';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { sanitizeNoteImages, replacedIds } from '../../../../lib/noteImages';
import { registerNoteImages, releaseOtherImages, releaseNote, binImages } from '../../../../lib/noteImageIndex';
import { learnCategory } from '../../../../lib/lexicon';
import { loadTreeRows } from '../../../../lib/noteTreeDb';
import { indexNotes, descendantIds, wouldCycle } from '../../../../lib/noteTree';

const inChunks = async (ids, fn) => { for (let i = 0; i < ids.length; i += 100) await fn(ids.slice(i, i + 100)); };

const EDITABLE_FIELDS = ['title', 'content', 'category', 'color', 'images', 'pinned', 'archived', 'sort_order', 'parent_id'];
// Only these count as "actually editing the note" — pin/archive/reorder
// are structural UI state, not content, so they shouldn't bump
// updated_at (that would wrongly make a reordered note look "recently
// edited" and mess up the fallback sort order for un-reordered notes).
const CONTENT_FIELDS = ['title', 'content', 'category', 'color', 'images'];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  const replaced = 'images' in updates ? replacedIds(updates.images) : [];
  if ('images' in updates) updates.images = sanitizeNoteImages(updates.images);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }
  if (CONTENT_FIELDS.some(k => k in updates)) {
    updates.updated_at = new Date().toISOString();
  }

  const supabase = supabaseAdmin();
  // moving under another note: it must be this owner's, and never the note itself or one of its own sub-notes (that would be a loop)
  if ('parent_id' in updates) {
    const pid = updates.parent_id || null;
    updates.parent_id = pid;
    const { rows, ready } = await loadTreeRows(supabase, session.lineUserId);
    if (!ready) return NextResponse.json({ error: 'tree_not_ready' }, { status: 409 });
    const { byId } = indexNotes(rows);
    if (pid && !byId.has(pid)) return NextResponse.json({ error: 'bad_parent' }, { status: 400 });
    if (pid && wouldCycle(id, pid, byId)) return NextResponse.json({ error: 'cycle' }, { status: 400 });
  }
  // Group spaces: two people editing the same note. The editor sends the `updated_at` it opened; if somebody ELSE saved a content change
  // since then, nothing is overwritten — the client gets 409 and asks (keep mine / take theirs / save mine as a new note).
  // (needs notes.updated_by from group_trash.sql; without that column there is nothing to compare, so saves go through as before)
  const baseStamp = body.base_updated_at ? Date.parse(body.base_updated_at) : NaN;
  if (session.space === 'group' && updates.updated_at) {
    if (!Number.isNaN(baseStamp) && body.force !== true) {
      const { data: cur } = await supabase.from('notes').select('id, title, content, updated_at, updated_by').eq('id', id).eq('user_id', session.lineUserId).maybeSingle();
      if (cur && cur.updated_by && cur.updated_by !== session.actorId && Date.parse(cur.updated_at) > baseStamp + 1000) {
        const { data: who } = await supabase.from('users').select('display_name').eq('line_user_id', cur.updated_by).maybeSingle();
        return NextResponse.json({ error: 'conflict', by: who?.display_name || 'สมาชิกคนอื่น', current: { title: cur.title, content: cur.content, updated_at: cur.updated_at } }, { status: 409 });
      }
    }
    updates.updated_by = session.actorId;
  }
  // Only a real category CHANGE counts as a lesson (editors resend the unchanged category on every save).
  const prevCategory = 'category' in updates
    ? (await supabase.from('notes').select('category').eq('id', id).eq('user_id', session.lineUserId).maybeSingle()).data?.category
    : undefined;
  let { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.lineUserId)
    .select()
    .single();
  if (error && updates.updated_by && /updated_by/.test(error.message || '')) {          // group_trash.sql not run yet: save without the stamp
    const { updated_by, ...rest } = updates;
    ({ data, error } = await supabase.from('notes').update(rest).eq('id', id).eq('user_id', session.lineUserId).select().single());
  }

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  if ('archived' in updates && data) {                                  // a page and everything under it are filed away (or brought back) together
    try {
      const { rows } = await loadTreeRows(supabase, session.lineUserId);
      const below = descendantIds(id, indexNotes(rows).kids);
      await inChunks(below, ids => supabase.from('notes').update({ archived: updates.archived === true }).in('id', ids).eq('user_id', session.lineUserId));
    } catch (e) { console.error('archive sub-notes:', e?.message); }
  }
  if ('images' in updates && data) {                                  // the image library follows the note (best-effort: never fails the save)
    const uid = session.lineUserId;
    try {
      await registerNoteImages(supabase, uid, data);
      await releaseOtherImages(supabase, uid, data.id, (data.images || []).map(i => i.drive_file_id));
      if (replaced.length) await binImages(supabase, uid, replaced);            // an older version of a drawing that was saved again
    } catch (e) { console.error('image library:', e?.message); }
  }
  if ('category' in updates && data && prevCategory !== undefined && prevCategory !== updates.category) await learnCategory(supabase, session.lineUserId, 'note', data.title || String(data.content || '').split('\n')[0], updates.category);
  return NextResponse.json({ note: data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const owner = session.lineUserId;
  const withKids = new URL(request.url).searchParams.get('children') === 'delete';
  // sub-notes: by default they move up one level (never lost by accident); "delete" takes them with it
  let below = [];
  try {
    const { rows } = await loadTreeRows(supabase, owner);
    const { byId, kids } = indexNotes(rows);
    const mine = byId.get(id);
    if (mine && (kids.get(id) || []).length) {
      if (withKids) below = descendantIds(id, kids);
      else await supabase.from('notes').update({ parent_id: mine.parent_id || null }).eq('parent_id', id).eq('user_id', owner);
    }
  } catch (e) { console.error('delete sub-notes:', e?.message); }
  for (const nid of [...below, id]) {
    await trashRow(supabase, 'notes', nid, session);                             // a group's deleted note stays restorable for 30 days
    await releaseNote(supabase, owner, nid).catch(() => {});                     // its pictures stay in the library (delete them there)
  }
  await inChunks(below, ids => supabase.from('notes').delete().in('id', ids).eq('user_id', owner));
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', owner);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ deleted: true, with_children: below.length });
}
