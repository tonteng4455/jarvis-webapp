// node --test tests/   — notes → Markdown + the tiny zip writer
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentToMarkdown, noteToMarkdown, notesToMarkdownFiles, notesToCombinedMarkdown, safeFileName } from '../lib/noteMarkdown.js';
import { createZip } from '../lib/zip.js';

test('list markers become GitHub-flavoured Markdown', () => {
  assert.equal(contentToMarkdown('[ ] นม\n[x] ไข่\n- จุด\n  - ย่อย\n1. หนึ่ง\n2. สอง\nข้อความธรรมดา\n'),
    '- [ ] นม\n- [x] ไข่\n- จุด\n  - ย่อย\n1. หนึ่ง\n2. สอง\n\nข้อความธรรมดา\n');   // blank line: a plain line must not become part of the last bullet
  assert.equal(contentToMarkdown('-5 องศา\n---'), '-5 องศา\n\n---');   // not a list; a rule under text must not turn the text into a heading
});

test('Markdown fidelity: hard line breaks, list/paragraph separation, nested numbers', () => {
  assert.equal(contentToMarkdown('บรรทัด 1\nบรรทัด 2\n\nย่อหน้าใหม่\n- ก\nสรุป'), 'บรรทัด 1  \nบรรทัด 2\n\nย่อหน้าใหม่\n\n- ก\n\nสรุป');
  assert.equal(contentToMarkdown('1. หนึ่ง\n  1. ย่อย\n  2. ย่อย 2\n2. สอง'), '1. หนึ่ง\n   1. ย่อย\n   2. ย่อย 2\n2. สอง');   // CommonMark needs 3 spaces under "1. "
});

test('file names for untitled notes whose first line is a checklist item', () => {
  assert.deepEqual(notesToMarkdownFiles([{ title: '', content: '- [ ] ก\nx' }, { title: '', content: '[x] ข' }, { title: '', content: '1. ค' }]).map(f => f.name), ['ก.md', 'ข.md', 'ค.md']);
});

test('a note → title heading, body, image links', () => {
  const md = noteToMarkdown({ title: 'ซื้อของ', content: '[ ] นม\n[x] ไข่', images: [{ drive_file_id: 'abcdefghij123', name: 'ใบเสร็จ.jpg' }] });
  assert.equal(md, '# ซื้อของ\n\n- [ ] นม\n- [x] ไข่\n\n📷 [ใบเสร็จ.jpg](https://drive.google.com/file/d/abcdefghij123/view)\n');
  assert.equal(noteToMarkdown({ title: '', content: 'แค่ข้อความ' }), 'แค่ข้อความ\n');
});

test('file names: safe, Thai kept, duplicates numbered, untitled notes use their first line', () => {
  assert.equal(safeFileName('a/b:c*?"<>|d'), 'a b c d');
  assert.equal(safeFileName('   '), 'โน้ต');
  const files = notesToMarkdownFiles([{ title: 'งาน', content: 'x' }, { title: 'งาน', content: 'y' }, { title: '', content: '- ซื้อไข่\n- นม' }]);
  assert.deepEqual(files.map(f => f.name), ['งาน.md', 'งาน (2).md', 'ซื้อไข่.md']);
});

test('combined file separates notes with a rule', () => {
  assert.equal(notesToCombinedMarkdown([{ title: 'A', content: 'a' }, { title: 'B', content: 'b' }]), '# A\n\na\n\n---\n\n# B\n\nb\n');
});

test('zip: real unzip can read it back, Thai names and bytes intact', () => {
  const enc = new TextEncoder();
  const files = [{ name: 'งาน.md', data: enc.encode('# สวัสดี\n') }, { name: 'b.md', data: enc.encode('x'.repeat(5000)) }];
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 't.zip'), createZip(files));
  let ok = true;
  try { execFileSync('python3', ['-I', '-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;z.extractall(sys.argv[2])`, join(dir, 't.zip'), join(dir, 'out')]); } catch (e) { ok = false; console.log(String(e.stderr || e)); }
  assert.ok(ok, 'python zipfile could not read the archive');
  assert.equal(readFileSync(join(dir, 'out', 'งาน.md'), 'utf8'), '# สวัสดี\n');
  assert.equal(readFileSync(join(dir, 'out', 'b.md'), 'utf8').length, 5000);
});
