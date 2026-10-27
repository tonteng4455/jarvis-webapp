// lib/sketchJpeg.js — a drawing made ON A PHOTO is saved as an ordinary JPEG (the photo with the strokes painted on it, so every
// viewer — the note, the PDF, a browser — just shows it) with the editable parts tucked inside the same file, in "APP15" segments:
//   · the strokes / shapes (the scene, deflated JSON), and
//   · the ORIGINAL photo's bytes,
// so opening it again gives back the photo as the background with every stroke still editable (and "erase all" returns the photo).
// One file, nothing else to store. Pure functions, no DOM (same idea as lib/sketchPng.js).

import { deflate, inflate } from './sketchPng.js';

const SIG = [74, 65, 82, 86, 73, 83, 75, 84];          // "JARVISKT"
const SCENE = 83, BG = 66;                              // 'S' · 'B'
const MAX_DATA = 65535 - 2 - SIG.length - 1;            // what fits in one segment after its length, signature and type byte

const isJpeg = b => b && b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const te = new TextEncoder(), td = new TextDecoder();

function segment(type, data) {
  const out = new Uint8Array(2 + 2 + SIG.length + 1 + data.length);
  out[0] = 0xff; out[1] = 0xef;
  const len = 2 + SIG.length + 1 + data.length;
  out[2] = len >> 8; out[3] = len & 255;
  out.set(SIG, 4); out[4 + SIG.length] = type; out.set(data, 5 + SIG.length);
  return out;
}
const hasSig = (b, at) => SIG.every((v, i) => b[at + i] === v);

// where my segments go: after the SOI and the leading JFIF / Exif segments
function insertAt(jpeg) {
  let pos = 2;
  while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff && (jpeg[pos + 1] === 0xe0 || jpeg[pos + 1] === 0xe1)) pos += 2 + ((jpeg[pos + 2] << 8) | jpeg[pos + 3]);
  return pos;
}

// → a copy of the JPEG carrying the scene (an object) and, optionally, the original photo { bytes, mime }
export async function embedInJpeg(jpeg, scene, bg = null) {
  if (!isJpeg(jpeg)) throw new Error('not a jpeg');
  const json = te.encode(JSON.stringify({ ...scene, bgMime: bg ? bg.mime : undefined }));
  const packed = (await deflate(json)) || json;
  const flag = packed === json ? 0 : 1;
  const parts = [];
  const put = (type, bytes, first) => {
    for (let at = 0; at < bytes.length || (at === 0 && first); at += MAX_DATA) {
      const piece = bytes.subarray(at, at + MAX_DATA);
      parts.push(segment(type, piece));
      if (bytes.length === 0) break;
    }
  };
  const header = new Uint8Array(1 + packed.length); header[0] = flag; header.set(packed, 1);
  put(SCENE, header, true);
  if (bg && bg.bytes?.length) put(BG, bg.bytes, false);
  const at = insertAt(jpeg);
  const total = jpeg.length + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  out.set(jpeg.subarray(0, at), 0);
  let w = at;
  for (const p of parts) { out.set(p, w); w += p.length; }
  out.set(jpeg.subarray(at), w);
  return out;
}

// → { scene, bg: { bytes, mime } | null }, or null (not a JPEG, nothing inside, unreadable)
export async function readFromJpeg(jpeg) {
  try {
    if (!isJpeg(jpeg)) return null;
    const sceneParts = [], bgParts = [];
    let pos = 2;
    while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
      const marker = jpeg[pos + 1];
      if (marker === 0xda) break;                                   // the picture data starts: no more segments
      const len = (jpeg[pos + 2] << 8) | jpeg[pos + 3];
      if (marker === 0xef && hasSig(jpeg, pos + 4)) {
        const type = jpeg[pos + 4 + SIG.length], data = jpeg.subarray(pos + 5 + SIG.length, pos + 2 + len);
        (type === SCENE ? sceneParts : type === BG ? bgParts : []).push(data);
      }
      pos += 2 + len;
    }
    if (!sceneParts.length) return null;
    const join = list => { const out = new Uint8Array(list.reduce((n, p) => n + p.length, 0)); let w = 0; for (const p of list) { out.set(p, w); w += p.length; } return out; };
    const sceneBytes = join(sceneParts);
    const raw = sceneBytes[0] === 1 ? await inflate(sceneBytes.subarray(1)) : sceneBytes.subarray(1);
    if (!raw) return null;
    const scene = JSON.parse(td.decode(raw));
    const bytes = bgParts.length ? join(bgParts) : null;
    return { scene, bg: bytes ? { bytes, mime: scene.bgMime || 'image/jpeg' } : null };
  } catch { return null; }
}

// the first bytes of the common photo formats (no DOM needed)
export function sniffImageType(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}
