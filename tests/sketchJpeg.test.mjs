// node --test tests/ — a drawing on a photo: the editable parts travel inside the JPEG
import test from 'node:test';
import assert from 'node:assert/strict';
import { embedInJpeg, readFromJpeg, sniffImageType } from '../lib/sketchJpeg.js';

const JPEG = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnKKKK+/PhAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k=', 'base64'));   // a 64x48 JPEG
const photo = n => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255; return b; };

test('jpeg: scene and original photo come back byte for byte', async () => {
  const scene = { v: 2, items: [{ k: 'ellipse', id: 'a1', c: '#e03131', w: 4, x: 1, y: 2, bw: 30, bh: 20, f: false, t: 'วงนี้' }] };
  const orig = photo(150000);                                     // more than one segment's worth
  const out = await embedInJpeg(JPEG, scene, { bytes: orig, mime: 'image/jpeg' });
  const back = await readFromJpeg(out);
  assert.deepEqual(back.scene.items, scene.items);
  assert.equal(back.bg.mime, 'image/jpeg');
  assert.deepEqual(Buffer.from(back.bg.bytes), Buffer.from(orig));
});

test('jpeg: the result still starts like a JPEG, keeps the picture data and the JFIF header first', async () => {
  const out = await embedInJpeg(JPEG, { v: 2, items: [] }, { bytes: photo(1000), mime: 'image/jpeg' });
  assert.equal(out[0], 0xff); assert.equal(out[1], 0xd8);
  assert.equal(out[2], 0xff); assert.equal(out[3], 0xe0);          // JFIF still first
  assert.ok(Buffer.from(out).includes(Buffer.from(JPEG.subarray(JPEG.length - 200))));   // the picture data is untouched
  assert.equal(out[out.length - 2], 0xff); assert.equal(out[out.length - 1], 0xd9);
});

test('jpeg: embedding again replaces nothing it should not, and a plain JPEG / PNG / junk reads as null', async () => {
  assert.equal(await readFromJpeg(JPEG), null);
  assert.equal(await readFromJpeg(new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6])), null);
  assert.equal(await readFromJpeg(new Uint8Array(3)), null);
  await assert.rejects(() => embedInJpeg(new Uint8Array([1, 2, 3, 4, 5, 6]), {}, null));
});

test('jpeg: a scene without a background reads back with bg null', async () => {
  const out = await embedInJpeg(JPEG, { v: 2, items: [] });
  const back = await readFromJpeg(out); assert.equal(back.bg, null); assert.deepEqual(back.scene.items, []);
});

test('sniffImageType knows the common photo formats', () => {
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13])), 'image/png');
  assert.equal(sniffImageType(new Uint8Array(20)), '');
});
