// lib/fileNames.js — a file's new name (the same rules as the LINE bot's finalFileName / driveNameFor).

// what was typed → the new name: characters Drive does not allow out, the old extension kept (typed once, never doubled)
export function finalFileName(oldName, typed) {
  let t = String(typed || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!t) return null;
  const ext = (/\.[A-Za-z0-9]{1,5}$/.exec(oldName || '') || [''])[0];
  if (ext && !t.toLowerCase().endsWith(ext.toLowerCase())) t += ext;
  return t;
}

// Drive keeps the date the file arrived in front of its name (the bot adds it); a note's picture has no such prefix
export function driveNameFor(row, newName) {
  if (row.source === 'note') return newName + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[row.mime_type] || '');
  const d = row.created_at ? new Date(new Date(row.created_at).getTime() + 7 * 3600e3) : null;
  return d ? `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}_${newName}` : newName;
}

export const cleanDescription = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
