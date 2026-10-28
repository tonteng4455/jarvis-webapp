// lib/noteImageIndex.js — the image library (server only).
//
// A note keeps only references to its pictures (notes.images). Every such picture ALSO has a row in user_files (source 'note'), which is
// what the Files page and the LINE bot search. note_id says which note it is in now; null = it is only in the library (it was taken out
// of its note, or the note was deleted) — it stays until the person deletes it. Deleting = Drive's bin (recoverable for 30 days).

import { callBotInternal } from './botWorker';

export const noteKey = driveId => `note:${driveId}`;
const mimeOf = name => (/\.jpe?g$/i.test(name || '') ? 'image/jpeg' : /\.webp$/i.test(name || '') ? 'image/webp' : 'image/png');
export const kindWord = img => (img?.kind === 'sketch' ? 'ภาพวาด' : 'รูปถ่าย');
export const labelFor = (img, noteTitle) => `${kindWord(img)} · ${String(noteTitle || '').trim().slice(0, 40) || 'โน้ตไม่มีชื่อ'}`;

// make sure every picture of this note has a row, pointing at the note
export async function registerNoteImages(supabase, userId, note) {
  const imgs = Array.isArray(note?.images) ? note.images : [];
  if (!imgs.length) return;
  const keys = imgs.map(i => noteKey(i.drive_file_id));
  const { data: have } = await supabase.from('user_files').select('id, line_message_id, note_id').eq('user_id', userId).in('line_message_id', keys);
  const byKey = new Map((have || []).map(r => [r.line_message_id, r]));
  const fresh = [];
  for (const img of imgs) {
    const row = byKey.get(noteKey(img.drive_file_id));
    if (row) { if (row.note_id !== note.id) await supabase.from('user_files').update({ note_id: note.id }).eq('id', row.id).eq('user_id', userId); continue; }
    fresh.push({ user_id: userId, line_message_id: noteKey(img.drive_file_id), kind: 'image', mime_type: mimeOf(img.name), file_name: labelFor(img, note.title), size_bytes: 0, storage: 'drive', drive_file_id: img.drive_file_id, public_url: null, source: 'note', note_id: note.id });
  }
  if (fresh.length) await supabase.from('user_files').insert(fresh);
}

// pictures that left this note (and are not in it any more) stay in the library, without a note
export async function releaseOtherImages(supabase, userId, noteId, keepIds) {
  const { data } = await supabase.from('user_files').select('id, drive_file_id').eq('user_id', userId).eq('note_id', noteId);
  const gone = (data || []).filter(r => !keepIds.includes(r.drive_file_id)).map(r => r.id);
  for (const id of gone) await supabase.from('user_files').update({ note_id: null }).eq('id', id).eq('user_id', userId);
}
export async function releaseNote(supabase, userId, noteId) {
  await supabase.from('user_files').update({ note_id: null }).eq('user_id', userId).eq('note_id', noteId);
}

// to the Drive bin + off the library (the bot does the Drive part with the person's own token)
export async function binImages(supabase, userId, driveIds) {
  const ids = [...new Set(driveIds)].filter(Boolean);
  if (!ids.length) return { deleted: 0, ok: true };
  const r = await callBotInternal('/internal/note-image-delete', { userId, driveFileIds: ids });
  const deleted = r?.deleted || 0, ok = !!r?.ok && deleted >= ids.length;       // a file already gone from Drive counts as deleted
  if (ok) await supabase.from('user_files').delete().eq('user_id', userId).in('drive_file_id', ids).eq('source', 'note');
  return { deleted, ok };
}

// pictures that were made before the library existed: one pass over this person's notes
export async function backfillLibrary(supabase, userId) {
  const { data: notes } = await supabase.from('notes').select('id, title, images').eq('user_id', userId).limit(2000);
  for (const n of (notes || []).filter(n => Array.isArray(n.images) && n.images.length)) await registerNoteImages(supabase, userId, n);
}
