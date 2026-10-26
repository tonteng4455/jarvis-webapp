// lib/noteMarkdown.js — notes → Markdown (.md) text. Pure functions; used by the notes page's
// "ดาวน์โหลด .md". Our list markers map straight onto GitHub-flavoured Markdown:
//   "[ ] x" → "- [ ] x" · "[x] x" → "- [x] x" · "- x" → "- x" · "1. x" → "1. x" (2 spaces of indent per level).
import { parseListLine, stripImageMarkers } from './noteBlocks.js';

export function contentToMarkdown(content) {
  const lines = stripImageMarkers(String(content || '').replace(/\r\n?/g, '\n')).split('\n');
  const out = [];
  let prevKind = 'blank';                                   // 'blank' | 'list' | 'text'
  lines.forEach((line, i) => {
    const item = parseListLine(line);
    if (!item) {
      const t = line.replace(/\s+$/, '');
      if (!t.trim()) { out.push(''); prevKind = 'blank'; return; }
      const isRule = /^\s*([-*_])(\s*\1){2,}\s*$/.test(t);       // "---" right under text would turn that text into a heading
      if (prevKind === 'list' || (isRule && prevKind === 'text')) out.push('');   // else a plain line right after a bullet would render as part of it
      // a line break inside a paragraph is only kept by Markdown with two trailing spaces
      const nextIsText = !isRule && i + 1 < lines.length && lines[i + 1].trim() && !parseListLine(lines[i + 1]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i + 1]);
      out.push(nextIsText ? t + '  ' : t); prevKind = 'text'; return;
    }
    if (prevKind === 'text') out.push('');                  // a list must start after a blank line to be recognised
    const pad = '  '.repeat(item.indent || 0);
    if (item.type === 'check') out.push(`${pad}- [${item.checked ? 'x' : ' '}] ${item.text}`.trimEnd());
    else if (item.type === 'bullet') out.push(`${pad}- ${item.text}`.trimEnd());
    else out.push(`${item.indent ? '   '.repeat(item.indent) : ''}${/(\d{1,3})/.exec(line)?.[1] || '1'}. ${item.text}`.trimEnd());
    prevKind = 'list';
  });
  return out.join('\n');
}

const driveView = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

export function noteToMarkdown(note) {
  const parts = [];
  const title = String(note?.title || '').trim();
  if (title) parts.push(`# ${title}`);
  const body = contentToMarkdown(note?.content).replace(/^\n+|\n+$/g, '');
  if (body) parts.push(body);
  const imgs = (Array.isArray(note?.images) ? note.images : []).filter(i => i?.drive_file_id);
  if (imgs.length) parts.push(imgs.map(i => `${i.kind === 'sketch' ? '✏️' : '📷'} [${(i.kind === 'sketch' ? 'ลายมือ/ภาพวาด' : (i.name || 'รูปภาพ')).replace(/[\[\]]/g, '')}](${driveView(i.drive_file_id)})`).join('  \n'));
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
    const base = safeFileName(n.title || firstLine.replace(/^(?:[-*•]\s+\[[ xX]?\]|\[[ xX]?\]|[-*•]|\d+[.)])\s*/, ''));
    const k = used.get(base) || 0; used.set(base, k + 1);
    return { name: `${k ? `${base} (${k + 1})` : base}.md`, text: noteToMarkdown(n) };
  });
}

// Everything in one file, separated by horizontal rules.
export function notesToCombinedMarkdown(notes) {
  return notes.map(n => noteToMarkdown(n).trimEnd()).join('\n\n---\n\n') + '\n';
}
