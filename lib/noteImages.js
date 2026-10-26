// lib/noteImages.js
//
// Notes keep only REFERENCES to images (Google Drive file ids) in the
// `notes.images` jsonb column — never the bytes (Supabase holds no
// image data). This normalises whatever the client sends so a bad
// payload can't put junk or an unbounded list into the column.

export const MAX_NOTE_IMAGES = 10;

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
