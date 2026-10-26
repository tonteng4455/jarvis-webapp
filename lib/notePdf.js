// lib/notePdf.js — notes → a PDF file, made entirely in the browser (no server work, no libraries, nothing to pay for).
//
// The note is laid out on canvases with the browser's own text engine (so Thai is shaped and wrapped correctly),
// each A4 page becomes one JPEG, and buildPdf() wraps the JPEGs in a minimal PDF. Pictures placed between the rows
// of a note (⟦img:…⟧ lines) are drawn at that place; the other attached pictures follow after the text.
// Trade-off: the pages are pictures, so the text in the PDF is not selectable / searchable.

import { parseContent, numbering } from './noteBlocks.js';

// ---------- the PDF container (pure; runs anywhere) ----------
const enc = new TextEncoder();
const hex16 = s => { let h = 'FEFF'; for (const ch of String(s || '')) { const c = ch.codePointAt(0); if (c > 0xFFFF) { const v = c - 0x10000; h += (0xD800 + (v >> 10)).toString(16).padStart(4, '0') + (0xDC00 + (v & 0x3FF)).toString(16).padStart(4, '0'); } else h += c.toString(16).padStart(4, '0'); } return h.toUpperCase(); };

// pages: [{ jpeg: Uint8Array, w, h }] (pixels) · page size in points (A4 by default) · → Uint8Array
export function buildPdf(pages, { title = '', widthPt = 595.28, heightPt = 841.89 } = {}) {
  const parts = []; const offsets = []; let len = 0;
  const push = chunk => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); len += b.length; };
  const obj = (n, body, stream) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    if (stream) { push(`${body.replace(/>>\s*$/, `/Length ${stream.length} >>`)}\nstream\n`); push(stream); push('\nendstream\nendobj\n'); }
    else push(`${body}\nendobj\n`);
  };
  const n = pages.length, first = 4;                         // 1 catalog · 2 page tree · 3 info · then three objects per page
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${first + i * 3 + 2} 0 R`).join(' ')}] >>`);
  obj(3, `<< /Producer (Jarvis) /Title <${hex16(title)}> >>`);
  pages.forEach((p, i) => {
    const im = first + i * 3, ct = im + 1, pg = im + 2;
    obj(im, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, p.jpeg);
    obj(ct, '<< >>', enc.encode(`q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`));
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
  });
  const total = first + n * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) push(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

// ---------- laying a note out (browser only) ----------
const PAGE_W = 794, PAGE_H = 1123, MARGIN = 56, SCALE = 2, FOOT = 34;       // CSS px (A4 at 96 dpi); drawn at 2x
const CONTENT_W = PAGE_W - MARGIN * 2, BOTTOM = PAGE_H - MARGIN - FOOT;
const INK = '#1c1c1e', SOFT = '#6b6b70', RULE = '#d6d6da';

function wrapText(ctx, text, maxW) {
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(text)].map(s => s.segment) : [...text];
  const lines = []; let line = '';
  for (const piece of seg) {
    if (ctx.measureText(line + piece).width <= maxW || !line) {
      if (ctx.measureText(piece).width > maxW && !line) {                       // one very long word: break it by character
        let part = '';
        for (const ch of piece) { if (ctx.measureText(part + ch).width > maxW && part) { lines.push(part); part = ''; } part += ch; }
        line = part;
      } else line += piece;
    } else { lines.push(line.replace(/\s+$/, '')); line = piece.replace(/^\s+/, ''); }
  }
  lines.push(line.replace(/\s+$/, ''));
  return lines;
}

async function loadBitmap(url) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
    const u = URL.createObjectURL(blob);
    try { return await new Promise((ok, no) => { const el = new Image(); el.onload = () => ok(el); el.onerror = no; el.src = u; }); } finally { URL.revokeObjectURL(u); }
  } catch { return null; }
}
const bmpSize = b => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight });

class Paper {
  constructor(family) {
    this.family = family; this.pages = []; this.n = 0;
    this.cv = document.createElement('canvas'); this.cv.width = PAGE_W * SCALE; this.cv.height = PAGE_H * SCALE;
    this.ctx = this.cv.getContext('2d'); this.blank();
  }
  blank() { const c = this.ctx; c.setTransform(SCALE, 0, 0, SCALE, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, PAGE_W, PAGE_H); c.textBaseline = 'alphabetic'; this.y = MARGIN; this.empty = true; }
  font(size, weight = 400) { this.ctx.font = `${weight} ${size}px ${this.family}`; }
  async endPage() {
    this.n++;
    const c = this.ctx; c.fillStyle = SOFT; this.font(11); c.textAlign = 'center'; c.fillText(`${this.n}`, PAGE_W / 2, PAGE_H - MARGIN + 6); c.textAlign = 'start';
    const blob = await new Promise(r => this.cv.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) throw new Error('jpeg');
    this.pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: this.cv.width, h: this.cv.height });
    this.blank();
  }
  async need(h) { if (!this.empty && this.y + h > BOTTOM) await this.endPage(); }
  async newPage() { if (!this.empty) await this.endPage(); }
  async text(str, { size = 15, weight = 400, color = INK, x = MARGIN, width = CONTENT_W, lh = size * 1.6, strike = false } = {}) {
    this.font(size, weight);
    for (const logical of String(str).split('\n')) {
      if (logical === '') { await this.need(lh * 0.6); this.y += lh * 0.6; continue; }
      for (const l of wrapText(this.ctx, logical, width)) {
        await this.need(lh);
        this.font(size, weight); this.ctx.fillStyle = color; this.ctx.fillText(l, x, this.y + size * 1.15);
        if (strike && l) { const w = this.ctx.measureText(l).width; this.ctx.fillRect(x, this.y + size * 0.75, w, 1); }
        this.y += lh; this.empty = false;
      }
    }
  }
  async picture(bmp) {
    const c = this.ctx;
    if (!bmp) { await this.text('🖼️ (โหลดภาพไม่ได้)', { size: 13, color: SOFT }); return; }
    const { w, h } = bmpSize(bmp);
    let dw = Math.min(CONTENT_W, w), dh = dw * h / w;                           // never blown up past its own size
    const maxH = (BOTTOM - MARGIN) * 0.8;
    if (dh > maxH) { dh = maxH; dw = dh * w / h; }
    await this.need(dh + 14);
    c.drawImage(bmp, MARGIN, this.y + 6, dw, dh);
    c.strokeStyle = RULE; c.lineWidth = 1; c.strokeRect(MARGIN + 0.5, this.y + 6.5, dw, dh);
    this.y += dh + 16; this.empty = false;
  }
  async rule() { await this.need(14); this.ctx.fillStyle = RULE; this.ctx.fillRect(MARGIN, this.y + 4, CONTENT_W, 1); this.y += 14; this.empty = false; }
}

// notes: [{ title, content, images: [{drive_file_id, kind, name}] }] · imageUrl(id) → URL · onProgress?(done, total) → Uint8Array (the PDF)
export async function notesToPdf(notes, { imageUrl, onProgress } = {}) {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const paper = new Paper(family);
  const cache = new Map();
  const bitmap = id => { if (!cache.has(id)) cache.set(id, loadBitmap(imageUrl(id))); return cache.get(id); };
  let done = 0;
  for (let ni = 0; ni < notes.length; ni++) {
    const note = notes[ni];
    if (ni > 0) await paper.newPage();                                          // every note starts on a new page
    const title = String(note.title || '').trim();
    if (title) { await paper.text(title, { size: 24, weight: 700, lh: 34 }); await paper.rule(); }
    const blocks = parseContent(note.content);
    const nums = numbering(blocks);
    const placed = new Set();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'img') { placed.add(b.text); await paper.picture(await bitmap(b.text)); continue; }
      if (b.type === 'text') { if (b.text.trim() === '' && i === blocks.length - 1) continue; await paper.text(b.text); continue; }
      const indent = 22 + b.indent * 22, x = MARGIN + indent, width = CONTENT_W - indent;
      await paper.need(24);
      const top = paper.y, c = paper.ctx;
      if (b.type === 'bullet') { c.fillStyle = INK; c.beginPath(); c.arc(x - 12, top + 12, 2.6, 0, Math.PI * 2); c.fill(); }
      else if (b.type === 'num') { paper.font(15); c.fillStyle = SOFT; c.textAlign = 'right'; c.fillText(`${nums[i]}.`, x - 6, top + 17.2); c.textAlign = 'start'; }
      else {                                                                    // check box
        c.strokeStyle = b.checked ? SOFT : INK; c.lineWidth = 1.4; c.strokeRect(x - 21, top + 5, 13, 13);
        if (b.checked) { c.beginPath(); c.moveTo(x - 18.5, top + 11.5); c.lineTo(x - 15, top + 15); c.lineTo(x - 10.5, top + 8); c.stroke(); }
      }
      await paper.text(b.text || ' ', { x, width, color: b.type === 'check' && b.checked ? SOFT : INK, strike: b.type === 'check' && b.checked });
    }
    const loose = (Array.isArray(note.images) ? note.images : []).filter(im => im?.drive_file_id && !placed.has(im.drive_file_id));
    if (loose.length) {
      await paper.text('รูปแนบ', { size: 13, weight: 700, color: SOFT });
      for (const im of loose) await paper.picture(await bitmap(im.drive_file_id));
    }
    done++; onProgress?.(done, notes.length);
  }
  if (!paper.empty || !paper.pages.length) await paper.endPage();
  const name = notes.length === 1 ? String(notes[0].title || '') : `${notes.length} โน้ต`;
  return buildPdf(paper.pages, { title: name });
}
