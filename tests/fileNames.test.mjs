import test from 'node:test';
import assert from 'node:assert/strict';
import { finalFileName, driveNameFor, cleanDescription } from '../lib/fileNames.js';

test('a typed name keeps the old extension, once', () => {
  assert.equal(finalFileName('scan001.pdf', 'สัญญาเช่า ร้านกาแฟ'), 'สัญญาเช่า ร้านกาแฟ.pdf');
  assert.equal(finalFileName('scan001.pdf', 'สัญญา.PDF'), 'สัญญา.PDF');
  assert.equal(finalFileName('image_1.jpg', 'รูปหน้าร้าน'), 'รูปหน้าร้าน.jpg');
  assert.equal(finalFileName('ภาพวาด · ซื้อของ', 'แผนผัง'), 'แผนผัง');
});

test('characters Drive does not allow are cleaned; empty is refused; long names are cut', () => {
  assert.equal(finalFileName('a.txt', 'a/b:c*d?e'), 'a b c d e.txt');
  assert.equal(finalFileName('a.txt', '   '), null);
  assert.equal(finalFileName('a.txt', 'x'.repeat(300)).length, 100 + 4);
});

test('the Drive name keeps the arrival date in front (Bangkok day); a note picture gets its picture extension', () => {
  assert.equal(driveNameFor({ source: 'chat', created_at: '2026-10-28T20:30:00Z' }, 'ใหม่.pdf'), '261029_ใหม่.pdf');
  assert.equal(driveNameFor({ source: 'note', mime_type: 'image/jpeg' }, 'ผัง'), 'ผัง.jpg');
  assert.equal(driveNameFor({ source: 'web' }, 'x.pdf'), 'x.pdf');
});

test('descriptions are tidied and capped at 200 characters', () => {
  assert.equal(cleanDescription('  สัญญา   เช่า \n ปี 2569 '), 'สัญญา เช่า ปี 2569');
  assert.equal(cleanDescription('x'.repeat(500)).length, 200);
  assert.equal(cleanDescription(null), '');
});
