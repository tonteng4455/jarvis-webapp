// lib/sketchDraw.js — paints the items of lib/sketchModel.js onto a canvas 2D context. `k` is the zoom (world → pixels); the
// caller has already translated the context to the board's origin.

import { FONT, LABEL_SIZE, isShape, isLine, lineEnds, linePath, cornerPoints, boundsOf, clamp } from './sketchModel';

let mctx = null;
const measureCtx = () => (mctx ||= document.createElement('canvas').getContext('2d'));

export function measureText(it) {
  const ctx = measureCtx(); ctx.font = `${it.s}px ${FONT}`;
  const lines = String(it.t).split('\n');
  return { w: Math.max(...lines.map(l => ctx.measureText(l).width), 4), h: lines.length * it.s * 1.3 };
}

// word / character wrapping (Thai has no spaces, so it breaks between characters when it must)
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}

export function tint(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(120,120,120,${alpha})`;
  const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
const MARKER_ALPHA = 0.35;

function drawStroke(ctx, s, k) {
  const p = s.p, n = p.length / 3; if (!n) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  if (s.tool === 'marker') {
    ctx.globalAlpha = MARKER_ALPHA; ctx.lineWidth = s.w * 4 * k;
    ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k);
    if (n === 1) ctx.lineTo(p[0] * k + 0.01, p[1] * k);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 3] * k, p[i * 3 + 1] * k);
    ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  const wAt = i => s.w * (0.45 + 0.9 * clamp(p[i * 3 + 2], 0, 1)) * k;
  if (n === 1) { ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, wAt(0) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  let px = p[0] * k, py = p[1] * k;
  for (let i = 1; i < n; i++) {
    const x = p[i * 3] * k, y = p[i * 3 + 1] * k;
    const mx = i === n - 1 ? x : (x + p[(i + 1) * 3] * k) / 2, my = i === n - 1 ? y : (y + p[(i + 1) * 3 + 1] * k) / 2;
    ctx.lineWidth = wAt(i); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(x, y, mx, my); ctx.stroke();
    px = mx; py = my;
  }
}

function shapePath(ctx, s, k) {
  const x = s.x * k, y = s.y * k, w = s.bw * k, h = s.bh * k;
  ctx.beginPath();
  if (s.k === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (s.k === 'diamond') { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); }
  else {
    const r = Math.min(10 * k, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}

function drawShape(ctx, s, k, hideText) {
  shapePath(ctx, s, k);
  if (s.f) { ctx.fillStyle = tint(s.c, 0.16); ctx.fill(); }
  ctx.lineWidth = s.w * k; ctx.strokeStyle = s.c; ctx.lineJoin = 'round'; ctx.stroke();
  if (s.t && !hideText) {
    ctx.fillStyle = s.c; ctx.font = `${LABEL_SIZE * k}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const inset = s.k === 'rect' ? 12 : s.k === 'ellipse' ? s.bw * 0.2 : s.bw * 0.28;
    const lines = wrap(ctx, s.t, Math.max(20, (s.bw - inset) * k)), lh = LABEL_SIZE * 1.3 * k;
    const top = (s.y + s.bh / 2) * k - (lines.length * lh) / 2 + lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, (s.x + s.bw / 2) * k, top + i * lh));
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}

function drawLine(ctx, it, k, byId) {
  const pts = linePath(it, byId), n = pts.length, [ex, ey] = pts[n - 1], [px, py] = pts[n - 2];
  ctx.strokeStyle = it.c; ctx.fillStyle = it.c; ctx.lineWidth = it.w * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ang = Math.atan2(ey - py, ex - px), head = (10 + it.w * 2.5) * k;
  const bx = it.k === 'arrow' ? ex * k - Math.cos(ang) * head * 0.6 : ex * k, by = it.k === 'arrow' ? ey * k - Math.sin(ang) * head * 0.6 : ey * k;
  ctx.beginPath(); ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
  for (let i = 1; i < n - 1; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
  ctx.lineTo(bx, by); ctx.stroke();
  if (it.k === 'arrow') {
    ctx.beginPath(); ctx.moveTo(ex * k, ey * k);
    ctx.lineTo(ex * k - Math.cos(ang - 0.45) * head, ey * k - Math.sin(ang - 0.45) * head);
    ctx.lineTo(ex * k - Math.cos(ang + 0.45) * head, ey * k - Math.sin(ang + 0.45) * head);
    ctx.closePath(); ctx.fill();
  }
}

function drawText(ctx, it, k) {
  ctx.fillStyle = it.c; ctx.font = `${it.s * k}px ${FONT}`; ctx.textBaseline = 'top';
  String(it.t).split('\n').forEach((l, i) => ctx.fillText(l, it.x * k, (it.y + i * it.s * 1.3) * k));
  ctx.textBaseline = 'alphabetic';
}

export function drawItem(ctx, it, k, byId, hideTextOf = null) {
  ctx.save();
  if (it.k === 'stroke') drawStroke(ctx, it, k);
  else if (isShape(it)) drawShape(ctx, it, k, hideTextOf === it.id);
  else if (isLine(it)) drawLine(ctx, it, k, byId);
  else if (it.k === 'text' && hideTextOf !== it.id) drawText(ctx, it, k);
  ctx.restore();
}

export function paintItems(ctx, items, bg, k, byId, hideTextOf = null) {
  if (bg) ctx.drawImage(bg.img, 0, 0, bg.w * k, bg.h * k);
  for (const it of items) drawItem(ctx, it, k, byId, hideTextOf);
}

// the dashed frame + handles around the selected item (handles keep a constant size on screen)
export function drawSelection(ctx, it, k, byId, accent = '#14a39a') {
  ctx.save();
  const b = boundsOf(it, byId, measureText);
  const x0 = b[0] * k, y0 = b[1] * k, x1 = b[2] * k, y1 = b[3] * k;
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  if (!isLine(it)) ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]); ctx.fillStyle = '#fff';
  const dot = (x, y, round) => { ctx.beginPath(); if (round) ctx.arc(x, y, 7, 0, Math.PI * 2); else ctx.rect(x - 6, y - 6, 12, 12); ctx.fill(); ctx.stroke(); };
  if (isShape(it)) for (const [x, y] of Object.values(cornerPoints(it))) dot(x * k, y * k, false);
  if (isLine(it)) { const [ax, ay, ex, ey] = lineEnds(it, byId); dot(ax * k, ay * k, true); dot(ex * k, ey * k, true); }
  ctx.restore();
}

// several items selected: a light dashed outline round each, and one frame round the lot (no handles — a group is moved, not resized)
export function drawGroupSelection(ctx, list, k, byId, accent = '#14a39a') {
  if (!list.length) return;
  ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.7;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of list) {
    const b = boundsOf(it, byId, measureText);
    ctx.strokeRect(b[0] * k, b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k);
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]);
  ctx.strokeRect(x0 * k - 4, y0 * k - 4, (x1 - x0) * k + 8, (y1 - y0) * k + 8);
  ctx.restore();
}

// the rubber-band rectangle while dragging across empty space
export function drawMarquee(ctx, r, k, accent = '#14a39a') {
  ctx.save();
  const x = Math.min(r[0], r[2]) * k, y = Math.min(r[1], r[3]) * k, w = Math.abs(r[2] - r[0]) * k, h = Math.abs(r[3] - r[1]) * k;
  ctx.fillStyle = 'rgba(20,163,154,0.10)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = accent; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
