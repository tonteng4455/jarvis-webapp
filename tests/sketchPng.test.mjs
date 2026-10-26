import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { embedScene, readScene, crc32 } from '../lib/sketchPng.js';

// a real 2x2 white PNG, built here so the test needs no files
function makePng(w = 2, h = 2) {
  const u32 = v => Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  const chunk = (type, data) => { const t = new TextEncoder().encode(type); const body = Uint8Array.from([...t, ...data]); return Uint8Array.from([...u32(data.length), ...body, ...u32(crc32(body))]); };
  const raw = []; for (let y = 0; y < h; y++) { raw.push(0); for (let x = 0; x < w; x++) raw.push(255, 255, 255); }
  const ihdr = Uint8Array.from([...u32(w), ...u32(h), 8, 2, 0, 0, 0]);
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('IDAT', zlib.deflateSync(Uint8Array.from(raw))), ...chunk('IEND', [])]);
}
const strokes = Array.from({ length: 300 }, (_, i) => ({ c: '#111', w: 3, p: Array.from({ length: 150 }, (_, j) => (i * 7 + j * 1.5) % 900) }));

test('crc32 matches the known value', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); });

test('a scene survives a round trip through the PNG', async () => {
  const scene = { v: 1, strokes };
  const withScene = await embedScene(makePng(), scene);
  assert.deepEqual(await readScene(withScene), scene);
});

test('the result is still a valid PNG (signature, chunks in order, IEND last, CRCs right)', async () => {
  const out = await embedScene(makePng(), { v: 1, strokes: [{ c: '#f00', w: 2, p: [1, 2, 3] }] });
  assert.deepEqual([...out.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const types = []; let pos = 8;
  while (pos < out.length) {
    const len = ((out[pos] << 24) | (out[pos + 1] << 16) | (out[pos + 2] << 8) | out[pos + 3]) >>> 0;
    types.push(String.fromCharCode(...out.subarray(pos + 4, pos + 8)));
    const crc = ((out[pos + 8 + len] << 24) | (out[pos + 9 + len] << 16) | (out[pos + 10 + len] << 8) | out[pos + 11 + len]) >>> 0;
    assert.equal(crc, crc32(out.subarray(pos + 4, pos + 8 + len)), `CRC of ${types.at(-1)}`);
    pos += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'iTXt', 'IEND']);
});

test('saving again replaces the old scene instead of piling up chunks', async () => {
  const once = await embedScene(makePng(), { v: 1, strokes: [{ c: 'a', w: 1, p: [1] }] });
  const twice = await embedScene(once, { v: 1, strokes: [{ c: 'b', w: 1, p: [2] }] });
  assert.equal((await readScene(twice)).strokes[0].c, 'b');
  assert.equal([...Buffer.from(twice).toString('latin1').matchAll(/jarvis-sketch/g)].length, 1);
});

test('Thai text in a scene is kept', async () => {
  const scene = { v: 1, strokes: [], note: 'แผนผังห้องประชุม ✏️' };
  assert.equal((await readScene(await embedScene(makePng(), scene))).note, scene.note);
});

test('a plain PNG, a photo or junk has no scene (null, no crash)', async () => {
  assert.equal(await readScene(makePng()), null);
  assert.equal(await readScene(new Uint8Array([1, 2, 3])), null);
  assert.equal(await readScene(null), null);
});

test('refuses to embed into something that is not a PNG', async () => {
  await assert.rejects(embedScene(new Uint8Array(40), { v: 1 }));
});

test('compression keeps a big drawing small', async () => {
  const out = await embedScene(makePng(), { v: 1, strokes });
  assert.ok(out.length < JSON.stringify({ v: 1, strokes }).length * 0.6, `size ${out.length}`);
});
