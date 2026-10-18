// lib/noteMarkdown.js — notes → Markdown (.md) text. Pure functions; used by the notes page's
// "ดาวน์โหลด .md". Our list markers map straight onto GitHub-flavoured Markdown:
//   "[ ] x" → "- [ ] x" · "[x] x" → "- [x] x" · "- x" → "- x" · "1. x" → "1. x" (2 spaces of indent per level).
import { parseListLine } from './noteBlocks.js';

export function contentToMarkdown(content) {
  return String(content || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    const item = parseListLine(line);
    if (!item) return line.replace(/\s+$/, '');
    const pad = '  '.repeat(item.indent || 0);
    if (item.type === 'check') return `${pad}- [${item.checked ? 'x' : ' '}] ${item.text}`.trimEnd();
    if (item.type === 'bullet') return `${pad}- ${item.text}`.trimEnd();
    const n = /(\d{1,3})/.exec(line)?.[1] || '1';
    return `${pad}${n}. ${item.text}`.trimEnd();
  }).join('\n');
}

const driveView = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

export function noteToMarkdown(note) {
  const parts = [];
  const title = String(note?.title || '').trim();
  if (title) parts.push(`# ${title}`);
  const body = contentToMarkdown(note?.content).replace(/^\n+|\n+$/g, '');
  if (body) parts.push(body);
  const imgs = (Array.isArray(note?.images) ? note.images : []).filter(i => i?.drive_file_id);
  if (imgs.length) parts.push(imgs.map(i => `📷 [${(i.name || 'รูปภาพ').replace(/[\[\]]/g, '')}](${driveView(i.drive_file_id)})`).join('  \n'));
  return parts.join('\n\n') + '\n';
}

// A file name that is safe on Windows / macOS / Android; Thai is kept as is.
export function safeFileName(s, fallback = 'โน้ต') {
  const t = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  return t || fallback;
}

// One file per note, names made unique ("ชื่อ.md", "ชื่อ (2).md").
export function notesToMarkdownFiles(notes) {
  const used = new Map();
  return notes.map(n => {
    const firstLine = String(n.content || '').split('\n').map(l => l.trim()).find(Boolean) || '';
    const base = safeFileName(n.title || firstLine.replace(/^([-*•]|\[[ xX]?\]|\d+[.)])\s*/, ''));
    const k = used.get(base) || 0; used.set(base, k + 1);
    return { name: `${k ? `${base} (${k + 1})` : base}.md`, text: noteToMarkdown(n) };
  });
}

// Everything in one file, separated by horizontal rules.
export function notesToCombinedMarkdown(notes) {
  return notes.map(n => noteToMarkdown(n).trimEnd()).join('\n\n---\n\n') + '\n';
}
