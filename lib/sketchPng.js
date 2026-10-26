// lib/sketchPng.js — a hand-drawn picture is saved as an ordinary PNG (so every viewer can show it) with the drawing's own data
// (the strokes) tucked inside the same file in an "iTXt" text chunk. Opening the picture again reads the strokes back, so it can be
// edited; nothing else (no second file, no database column) is needed. Pure functions, no DOM.

const KEY = 'jarvis-sketch';
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const te = new TextEncoder(), td = new TextDecoder();

let table = null;
export function crc32(bytes) {
  if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}
const deflate = bytes => (typeof CompressionStream === 'function' ? pipe(bytes, new CompressionStream('deflate')) : null);
const inflate = bytes => (typeof DecompressionStream === 'function' ? pipe(bytes, new DecompressionStream('deflate')) : null);

const u32 = (v, at, n) => { n[at] = (v >>> 24) & 255; n[at + 1] = (v >>> 16) & 255; n[at + 2] = (v >>> 8) & 255; n[at + 3] = v & 255; };
const readU32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const isPng = b => b && b.length > 20 && SIGNATURE.every((v, i) => b[i] === v);

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  u32(data.length, 0, out);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  u32(crc32(out.subarray(4, 8 + data.length)), 8 + data.length, out);
  return out;
}

// → a copy of the PNG with the scene inside (any older copy of the scene chunk is replaced)
export async function embedScene(png, scene) {
  if (!isPng(png)) throw new Error('not a png');
  const json = te.encode(JSON.stringify(scene));
  const packed = await deflate(json);
  const head = te.encode(KEY);
  const body = new Uint8Array(head.length + 5 + (packed || json).length);
  body.set(head, 0);                                   // keyword, then: NUL, compression flag, method 0, empty language, empty translated keyword
  body[head.length] = 0; body[head.length + 1] = packed ? 1 : 0; body[head.length + 2] = 0; body[head.length + 3] = 0; body[head.length + 4] = 0;
  body.set(packed || json, head.length + 5);
  const mine = chunk('iTXt', body);

  const parts = []; let pos = 8; let iend = -1;
  while (pos + 12 <= png.length) {
    const len = readU32(png, pos), type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const end = pos + 12 + len;
    if (type === 'IEND') { iend = pos; break; }
    const isOld = type === 'iTXt' && td.decode(png.subarray(pos + 8, pos + 8 + KEY.length)) === KEY && png[pos + 8 + KEY.length] === 0;
    if (!isOld) parts.push(png.subarray(pos, end));
    pos = end;
  }
  if (iend < 0) throw new Error('png has no IEND');
  const iendChunk = png.subarray(iend);
  const total = 8 + parts.reduce((n, p) => n + p.length, 0) + mine.length + iendChunk.length;
  const out = new Uint8Array(total);
  out.set(png.subarray(0, 8), 0);
  let at = 8;
  for (const p of parts) { out.set(p, at); at += p.length; }
  out.set(mine, at); at += mine.length;
  out.set(iendChunk, at);
  return out;
}

// → the scene stored inside, or null (not a PNG, no scene, unreadable)
export async function readScene(png) {
  try {
    if (!isPng(png)) return null;
    let pos = 8;
    while (pos + 12 <= png.length) {
      const len = readU32(png, pos), type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      if (type === 'iTXt' && td.decode(png.subarray(pos + 8, pos + 8 + KEY.length)) === KEY && png[pos + 8 + KEY.length] === 0) {
        const at = pos + 8 + KEY.length + 1;
        const compressed = png[at] === 1;
        let q = at + 2;                                  // skip flag + method
        while (png[q] !== 0 && q < pos + 8 + len) q++;   // language tag
        q++;
        while (png[q] !== 0 && q < pos + 8 + len) q++;   // translated keyword
        q++;
        const data = png.subarray(q, pos + 8 + len);
        const raw = compressed ? await inflate(data) : data;
        if (!raw) return null;
        return JSON.parse(td.decode(raw));
      }
      if (type === 'IEND') break;
      pos += 12 + len;
    }
    return null;
  } catch { return null; }
}
