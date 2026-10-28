// lib/noteImages.js
//
// Notes keep only REFERENCES to images (Google Drive file ids) in the
// `notes.images` jsonb column — never the bytes (Supabase holds no
// image data). This normalises whatever the client sends so a bad
// payload can't put junk or an unbounded list into the column.

export const MAX_NOTE_IMAGES = 50;      // a safety net, not a target: each picture costs a request to show and some memory to export

export function sanitizeNoteImages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const id = typeof item?.drive_file_id === 'string' ? item.drive_file_id.trim() : '';
    if (!/^[A-Za-z0-9_-]{10,100}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ drive_file_id: id, name: String(item?.name || '').slice(0, 120), ...(item?.kind === 'sketch' ? { kind: 'sketch' } : {}) });   // kind 'sketch' = a hand-drawn picture the editor can reopen
    if (out.length >= MAX_NOTE_IMAGES) break;
  }
  return out;
}

// A re-saved drawing says which older files it replaces: { drive_file_id: <new>, replaces: [<old>, …] }. The server moves the old one to the
// Drive bin when the note is saved — no timer in the browser, so closing the page can never leave it behind. Not stored in the note.
export function replacedIds(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    for (const old of [].concat(item?.replaces || [])) {
      const id = typeof old === 'string' ? old.trim() : '';
      if (/^[A-Za-z0-9_-]{10,100}$/.test(id) && id !== item?.drive_file_id && !out.includes(id)) out.push(id);
    }
  }
  return out.slice(0, 20);
}
