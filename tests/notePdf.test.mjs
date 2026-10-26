// node --test tests/ — the PDF container used by "download as PDF" (the page drawing needs a browser and is covered by the browser tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf } from '../lib/notePdf.js';

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiqKKK8A/Wz//Z', 'base64');

test('buildPdf: a valid-looking PDF with one page object per picture and a correct cross-reference table', () => {
  const bytes = buildPdf([{ jpeg: new Uint8Array(JPEG), w: 16, h: 16 }, { jpeg: new Uint8Array(JPEG), w: 16, h: 16 }], { title: 'ซื้อของ' });
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.equal((s.match(/\/Type \/Page /g) || []).length, 2);
  assert.match(s, /\/Count 2/);
  assert.match(s, /\/Filter \/DCTDecode/);
  // every xref entry points at "N 0 obj"
  const xrefAt = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(xrefAt).startsWith('xref'));
  const lines = s.slice(xrefAt).split('\n').slice(2);
  const total = Number(/xref\n0 (\d+)/.exec(s.slice(xrefAt))[1]);
  for (let n = 1; n < total; n++) {
    const off = Number(lines[n].slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${n} 0 obj`), `object ${n} is where the table says`);
  }
  // the picture bytes are inside untouched
  assert.ok(Buffer.from(bytes).includes(JPEG));
});

test('buildPdf: the title is stored as UTF-16 hex so Thai survives', () => {
  const s = Buffer.from(buildPdf([{ jpeg: new Uint8Array(JPEG), w: 16, h: 16 }], { title: 'กข' })).toString('latin1');
  assert.match(s, /\/Title <FEFF0E010E02>/);
});

test('buildPdf: the stream length is right (a viewer would reject the file otherwise)', () => {
  const bytes = buildPdf([{ jpeg: new Uint8Array(JPEG), w: 16, h: 16 }]);
  const s = Buffer.from(bytes).toString('latin1');
  const m = /\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(s);
  assert.equal(Number(m[1]), JPEG.length);
});
