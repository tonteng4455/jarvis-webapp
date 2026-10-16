// node --test tests/   — the note-body logic (no browser needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContent, serializeBlocks, numbering, setText, enterInText, enterInList, backspaceAtStart, appendRow, indentBlock, toggleCheck, pasteInto, rowInfo, previewText } from '../lib/noteBlocks.js';

const types = blocks => blocks.map(b => `${b.type}${b.indent ? '@' + b.indent : ''}${b.checked ? '✓' : ''}:${JSON.stringify(b.text)}`);
const idOf = (blocks, n) => blocks[n].id;

test('plain text stays one block and round-trips exactly', () => {
  const t = 'ศร.\n\nพล.ป. ถนน (2+1)\nบรรทัดที่สาม';
  const b = parseContent(t);
  assert.equal(b.length, 1); assert.equal(b[0].type, 'text');
  assert.equal(serializeBlocks(b), t);
});

test('markers parse into bullet / checkbox / numbered, with indent', () => {
  const b = parseContent('หัวข้อ\n- นม\n  - นมจืด\n[ ] ไข่\n[x] ขนมปัง\n1. หนึ่ง\n2. สอง');
  assert.deepEqual(types(b), ['text:"หัวข้อ"', 'bullet:"นม"', 'bullet@1:"นมจืด"', 'check:"ไข่"', 'check✓:"ขนมปัง"', 'num:"หนึ่ง"', 'num:"สอง"']);
});

test('"-5 องศา", "---" and "1999 คือปี" are NOT lists', () => {
  for (const t of ['-5 องศา', '---', '1999 คือปี', '*bold*']) assert.equal(parseContent(t)[0].type, 'text', t);
});

test('GitHub style "- [ ] task" is a checkbox', () => {
  assert.deepEqual(types(parseContent('- [x] เสร็จ\n- [ ] ยัง')), ['check✓:"เสร็จ"', 'check:"ยัง"']);
});

test('numbers are renumbered, per level, and restart after text', () => {
  const b = parseContent('1. a\n1. b\n  1. c\n  1. d\n1. e\nข้อความ\n5. f');
  assert.deepEqual(numbering(b), [1, 2, 1, 2, 3, 0, 1]);
  assert.equal(serializeBlocks(b), '1. a\n2. b\n  1. c\n  2. d\n3. e\nข้อความ\n1. f');
});

test('typing "- " at the start of a line turns it into a bullet and focuses its text', () => {
  const b = parseContent('');
  const r = setText(b, idOf(b, 0), '- ', 2);
  assert.deepEqual(types(r.blocks), ['bullet:""']);
  assert.equal(r.focus.id, r.blocks[0].id); assert.equal(r.focus.pos, 0);
});

test('typing "[] " → checkbox, "[x] " → ticked, "1. " → numbered', () => {
  for (const [typed, want] of [['[] ', 'check:""'], ['[ ] ', 'check:""'], ['[x] ', 'check✓:""'], ['1. ', 'num:""'], ['2) ', 'num:""']]) {
    const b = parseContent(''); assert.deepEqual(types(setText(b, idOf(b, 0), typed, typed.length).blocks), [want], typed);
  }
});

test('"- " typed in the middle of a paragraph splits it: text / bullet / text', () => {
  const b = parseContent('บรรทัดแรก\nบรรทัดสาม');
  const v = 'บรรทัดแรก\n- \nบรรทัดสาม';
  const r = setText(b, idOf(b, 0), v, 'บรรทัดแรก\n- '.length);
  assert.deepEqual(types(r.blocks), ['text:"บรรทัดแรก"', 'bullet:""', 'text:"บรรทัดสาม"']);
});

test('a dash NOT at the start of the line is left alone', () => {
  const b = parseContent(''); const r = setText(b, idOf(b, 0), 'a - ', 4);
  assert.deepEqual(types(r.blocks), ['text:"a - "']);
});

test('Enter on "-ข้อความ" (no space) makes a bullet and continues the list', () => {
  const b = parseContent('');
  const r = enterInText(b, idOf(b, 0), '-ซื้อนม', '-ซื้อนม'.length);
  assert.deepEqual(types(r.blocks), ['bullet:"ซื้อนม"', 'bullet:""']);
  assert.equal(r.focus.id, r.blocks[1].id);
});

test('Enter on "[]ข้อความ" makes a checkbox and continues', () => {
  const b = parseContent('');            // the person is typing in a plain text block
  assert.deepEqual(types(enterInText(b, idOf(b, 0), '[]ซื้อไข่', '[]ซื้อไข่'.length).blocks), ['check:"ซื้อไข่"', 'check:""']);
});

test('Enter on ordinary text / "-5" is native (null)', () => {
  const b = parseContent('hello'); assert.equal(enterInText(b, idOf(b, 0), 'hello', 5), null);
  const c = parseContent('-5 องศา'); assert.equal(enterInText(c, idOf(c, 0), '-5 องศา', '-5 องศา'.length), null);
});

test('Enter in a list row: new row of the same kind (unticked), splitting at the caret', () => {
  const b = parseContent('[x] ซื้อนมสด');
  const r = enterInList(b, idOf(b, 0), 'ซื้อนม'.length);
  assert.deepEqual(types(r.blocks), ['check✓:"ซื้อนม"', 'check:"สด"']);
  assert.equal(r.focus.pos, 0);
});

test('Enter on an EMPTY row outdents first, then leaves the list', () => {
  let b = parseContent('- a\n  - ');
  let r = enterInList(b, idOf(b, 1), 0);
  assert.deepEqual(types(r.blocks), ['bullet:"a"', 'bullet:""']);
  r = enterInList(r.blocks, idOf(r.blocks, 1), 0);
  assert.deepEqual(types(r.blocks), ['bullet:"a"', 'text:""']);
});

test('leaving a list merges into the paragraph that follows it', () => {
  const b = parseContent('- a\n- \nหลังรายการ');
  const r = enterInList(b, idOf(b, 1), 0);
  assert.deepEqual(types(r.blocks), ['bullet:"a"', 'text:"\\nหลังรายการ"']);
  assert.equal(r.focus.pos, 0);
});

test('Backspace on an EMPTY row removes it and lands at the end of the row above', () => {
  const b = parseContent('- abc\n- ');
  const r = backspaceAtStart(b, idOf(b, 1));
  assert.deepEqual(types(r.blocks), ['bullet:"abc"']);
  assert.equal(r.focus.id, r.blocks[0].id); assert.equal(r.focus.pos, 3);
});

test('Backspace on a row with text: outdent, then join the row above', () => {
  let b = parseContent('- a\n  - b');
  let r = backspaceAtStart(b, idOf(b, 1));
  assert.deepEqual(types(r.blocks), ['bullet:"a"', 'bullet:"b"']);
  r = backspaceAtStart(r.blocks, idOf(r.blocks, 1));
  assert.deepEqual(types(r.blocks), ['bullet:"ab"']);
  assert.equal(r.focus.pos, 1);
});

test('Backspace on the first row of a list (nothing above) turns it into plain text', () => {
  const b = parseContent('หัวข้อ\n- abc');
  const r = backspaceAtStart(b, idOf(b, 1));
  assert.deepEqual(types(r.blocks), ['text:"หัวข้อ\\nabc"']);
  assert.equal(r.focus.pos, 'หัวข้อ\n'.length);
  const c = parseContent('- x'); assert.deepEqual(types(backspaceAtStart(c, idOf(c, 0)).blocks), ['text:"x"']);
});

test('Backspace at the start of a paragraph joins its first line onto the list row above', () => {
  const b = parseContent('- นม\nบรรทัดหนึ่ง\nบรรทัดสอง');
  const r = backspaceAtStart(b, idOf(b, 1));
  assert.deepEqual(types(r.blocks), ['bullet:"นมบรรทัดหนึ่ง"', 'text:"บรรทัดสอง"']);
});

test('appendRow: after a list adds a row of the same kind; after text just focuses its end', () => {
  const b = parseContent('[x] a');
  const r = appendRow(b);
  assert.deepEqual(types(r.blocks), ['check✓:"a"', 'check:""']);
  assert.equal(appendRow(r.blocks).blocks.length, 2);           // already an empty row → no extra rows
  const t = parseContent('hello'); assert.deepEqual(appendRow(t).focus, { id: t[0].id, pos: 5 });
});

test('Backspace at the start of the very first block does nothing', () => {
  const b = parseContent('hello'); assert.equal(backspaceAtStart(b, idOf(b, 0)), null);
});

test('indent needs a list row above, at most one level deeper; outdent stops at 0', () => {
  let b = parseContent('- a\n- b\n- c');
  assert.equal(indentBlock(b, idOf(b, 0), 1), null);                       // first row can't indent
  let r = indentBlock(b, idOf(b, 1), 1); assert.equal(r.blocks[1].indent, 1);
  assert.equal(indentBlock(r.blocks, idOf(r.blocks, 2), 1).blocks[2].indent, 1);
  assert.equal(indentBlock(r.blocks, idOf(r.blocks, 1), 1), null);         // 2 levels under "a"? no: needs prev.indent+1
  assert.equal(indentBlock(r.blocks, idOf(r.blocks, 1), -1).blocks[1].indent, 0);
  assert.equal(indentBlock(b, idOf(b, 1), -1), null);
  assert.deepEqual(rowInfo(b, idOf(b, 1)), { list: true, type: 'bullet', canOutdent: false, canIndent: true });
  assert.equal(rowInfo(parseContent('x'), 'nope').list, false);
});

test('ticking a checkbox toggles [ ] ↔ [x] in the saved text', () => {
  const b = parseContent('[ ] a\n[ ] b');
  const r = toggleCheck(b, idOf(b, 1));
  assert.equal(serializeBlocks(r.blocks), '[ ] a\n[x] b');
  assert.equal(serializeBlocks(toggleCheck(r.blocks, idOf(r.blocks, 1)).blocks), '[ ] a\n[ ] b');
  assert.equal(toggleCheck(parseContent('- a'), 'x'), null);
});

test('pasting a multi-line list creates real rows', () => {
  const b = parseContent('');
  const r = pasteInto(b, idOf(b, 0), 0, 0, '- นม\n- ไข่\n[ ] ขนมปัง\nสรุป');
  assert.deepEqual(types(r.blocks), ['bullet:"นม"', 'bullet:"ไข่"', 'check:"ขนมปัง"', 'text:"สรุป"']);
  assert.equal(pasteInto(b, idOf(b, 0), 0, 0, 'one line'), null);
});

test('pasting multi-line text into a list row keeps the text after the caret', () => {
  const b = parseContent('- AB');
  const r = pasteInto(b, idOf(b, 0), 1, 1, 'x\ny');
  assert.equal(serializeBlocks(r.blocks), 'A' === 'A' ? '- Ax\ny' + 'B' : '');
});

test('save → open again gives the same blocks (stable)', () => {
  const t = 'หัวข้อ\n- นม\n  - นมจืด\n  - นมสด\n[ ] ไข่\n[x] ขนมปัง\n1. หนึ่ง\n2. สอง\nจบ';
  assert.equal(serializeBlocks(parseContent(t)), t);
  assert.equal(serializeBlocks(parseContent(serializeBlocks(parseContent(t)))), t);
});

test('trailing blank row is not saved as extra newlines', () => {
  assert.equal(serializeBlocks(parseContent('- a\n')), '- a');
});

test('the list preview shows real glyphs', () => {
  assert.equal(previewText('- นม\n[x] ไข่\n[ ] ขนม\n3. สาม\nจบ'), '• นม  ☑ ไข่  ☐ ขนม  3. สาม  จบ');
});
