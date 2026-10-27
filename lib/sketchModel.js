// lib/sketchModel.js — the data and the geometry of the drawing pad (no DOM, no canvas, so it can be unit-tested).
//
// A drawing is a list of items:
//   stroke   { k:'stroke', c, w, tool:'pen'|'marker', p:[x,y,pressure, …] }
//   rect / ellipse / diamond   { k, c, w, f, x, y, bw, bh, t }      (f = tinted fill, t = label)
//   line / arrow  { k, c, w, a:[x,y], e:[x,y], from, to, elbow, ends, dash }     (from / to = id of a shape the end is glued to; elbow = right-angle route; ends = 'none'|'end'|'both'|'dot' (default: an arrow has a head at the end, a line has none); dash = broken line)
//   text     { k:'text', c, s, x, y, t }
//   callout  { k:'callout', c, w, f, x, y, bw, bh, t, tip:[x,y], tipStyle:'arrow'|'dot'|'none' }   a text box whose pointer runs to a spot (a box like the shapes)
//   dim      { k:'dim', c, w, a:[x,y], e:[x,y], style:'simple'|'plan', off, t, ends }   a measured distance from a to e; t = what is written on it ("3.50 ม.")
//   pin      { k:'pin', c, x, y, n, r }   a numbered round marker (1, 2, 3 …)
// Items older than shapes were plain strokes without "k" — still read.

export const FONT = "'Noto Sans Thai','Sarabun','Segoe UI',system-ui,sans-serif";
export const TEXT_SIZES = [18, 28, 44];
export const LABEL_SIZE = 18;
export const SHAPES = ['rect', 'ellipse', 'diamond', 'callout'];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max) => String(v ?? '').slice(0, max);

export const isShape = it => SHAPES.includes(it?.k);
export const LINE_ENDS = ['none', 'end', 'both', 'dot'];
// how the ends of a line / arrow look
export const endsOf = it => (LINE_ENDS.includes(it.ends) ? it.ends : it.k === 'arrow' ? 'end' : 'none');
export const isLine = it => it?.k === 'line' || it?.k === 'arrow';
export const isDim = it => it?.k === 'dim';
export const isPin = it => it?.k === 'pin';

// ---------- loading / saving ----------
export function cleanItems(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object') continue;
    const k = raw.k || 'stroke';
    const base = { id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 20) : uid(), c: str(raw.c || '#1c1c1e', 20) };
    if (k === 'stroke') {
      if (!Array.isArray(raw.p) || raw.p.length < 3 || raw.p.length % 3) continue;
      out.push({ ...base, k, w: clamp(num(raw.w, 4), 1, 40), tool: raw.tool === 'marker' ? 'marker' : 'pen', p: raw.p.map(Number) });
    } else if (SHAPES.includes(k)) {
      const shape = { ...base, k, w: clamp(num(raw.w, 3), 1, 40), f: raw.f === true, x: num(raw.x), y: num(raw.y), bw: Math.max(4, num(raw.bw, 100)), bh: Math.max(4, num(raw.bh, 60)), t: str(raw.t, 500) };
      if (num(raw.ls, 0) > 0) shape.ls = clamp(num(raw.ls), 8, 200);                              // the size of its label when it is not the standard one (a drawing on a big photo)
      if (k === 'callout') {
        const tip = Array.isArray(raw.tip) && raw.tip.length >= 2 && raw.tip.slice(0, 2).every(v => Number.isFinite(Number(v))) ? [Number(raw.tip[0]), Number(raw.tip[1])] : [shape.x - 40, shape.y + shape.bh + 40];
        shape.tip = tip; shape.tipStyle = raw.tipStyle === 'dot' ? 'dot' : raw.tipStyle === 'none' ? 'none' : 'arrow';
      }
      out.push(shape);
    } else if (k === 'dim') {
      const a = Array.isArray(raw.a) ? raw.a.map(Number) : null, e = Array.isArray(raw.e) ? raw.e.map(Number) : null;
      if (!a || !e || a.length < 2 || e.length < 2 || [...a, ...e].some(v => !Number.isFinite(v))) continue;
      out.push({ ...base, k, w: clamp(num(raw.w, 3), 1, 40), a: [a[0], a[1]], e: [e[0], e[1]], style: raw.style === 'plan' ? 'plan' : 'simple', off: clamp(num(raw.off, 48), -4000, 4000), t: str(raw.t, 80), ...(raw.ends === 'dot' || raw.ends === 'none' ? { ends: raw.ends } : null) });
    } else if (k === 'pin') {
      out.push({ ...base, k, x: num(raw.x), y: num(raw.y), n: clamp(Math.round(num(raw.n, 1)), 1, 999), r: clamp(num(raw.r, 18), 6, 80) });
    } else if (k === 'line' || k === 'arrow') {
      const a = Array.isArray(raw.a) ? raw.a.map(Number) : null, e = Array.isArray(raw.e) ? raw.e.map(Number) : null;
      if (!a || !e || a.length < 2 || e.length < 2 || [...a, ...e].some(v => !Number.isFinite(v))) continue;
      out.push({ ...base, k, w: clamp(num(raw.w, 3), 1, 40), a: [a[0], a[1]], e: [e[0], e[1]], from: raw.from ? str(raw.from, 20) : null, to: raw.to ? str(raw.to, 20) : null, elbow: raw.elbow === true, ...(LINE_ENDS.includes(raw.ends) ? { ends: raw.ends } : null), ...(raw.dash === true ? { dash: true } : null) });
    } else if (k === 'text') {
      const t = str(raw.t, 2000); if (!t.trim()) continue;
      out.push({ ...base, k, s: clamp(num(raw.s, 28), 8, 200), x: num(raw.x), y: num(raw.y), t });
    }
  }
  // glue to shapes that do not exist (any more) is dropped
  const ids = new Set(out.filter(isShape).map(i => i.id));
  for (const it of out) if (isLine(it)) { if (it.from && !ids.has(it.from)) it.from = null; if (it.to && !ids.has(it.to)) it.to = null; }
  return out;
}
export const serializeItems = items => items.map(it => ({ ...it }));        // own enumerable fields only (cached bounds are hidden)
export const sig = items => JSON.stringify(items.map(it => [it.k, it.id, it.c, it.w, it.s, it.f, it.t, it.x, it.y, it.bw, it.bh, it.a, it.e, it.from, it.to, it.elbow, it.p?.length, it.tip, it.tipStyle, it.style, it.off, it.n, it.r, it.ls, it.ends, it.dash]));

export const byIdMap = items => { const m = {}; for (const it of items) m[it.id] = it; return m; };

// ---------- shapes ----------
export const centerOf = s => [s.x + s.bw / 2, s.y + s.bh / 2];

// the point where the line from the centre of a shape towards (tx, ty) leaves the shape
export function edgePoint(s, tx, ty) {
  const [cx, cy] = centerOf(s), dx = tx - cx, dy = ty - cy, a = s.bw / 2, b = s.bh / 2;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [cx + a, cy];
  let t;
  if (s.k === 'ellipse') t = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
  else if (s.k === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else t = Math.min(Math.abs(dx) < 1e-6 ? Infinity : a / Math.abs(dx), Math.abs(dy) < 1e-6 ? Infinity : b / Math.abs(dy));
  return [cx + dx * t, cy + dy * t];
}
const sideMid = (s, side) => (side === 'r' ? [s.x + s.bw, s.y + s.bh / 2] : side === 'l' ? [s.x, s.y + s.bh / 2] : side === 'b' ? [s.x + s.bw / 2, s.y + s.bh] : [s.x + s.bw / 2, s.y]);

// ---------- callouts, measured distances, pins ----------
// the pointer of a callout: from where it leaves the box to its tip
export function calloutLine(it) { const [cx, cy] = centerOf(it); const from = edgePoint(it, it.tip[0], it.tip[1]); return Math.hypot(it.tip[0] - cx, it.tip[1] - cy) < 1 ? [[cx, cy], it.tip] : [from, it.tip]; }

export const dimLabelSize = it => Math.round(16 + it.w * 2.5);
// where a measured distance is drawn: the dimension line (p0 → p1), the extension lines of the plan style, the middle (for the label)
export function dimGeom(it) {
  const [ax, ay] = it.a, [ex, ey] = it.e, len = Math.hypot(ex - ax, ey - ay) || 1, ux = (ex - ax) / len, uy = (ey - ay) / len;
  if (it.style !== 'plan') return { p0: [ax, ay], p1: [ex, ey], ext: [], mid: [(ax + ex) / 2, (ay + ey) / 2], len, ux, uy };
  const nx = -uy, ny = ux, off = it.off || 0, sg = off >= 0 ? 1 : -1, gap = 4 * sg, over = 10 * sg;
  const p0 = [ax + nx * off, ay + ny * off], p1 = [ex + nx * off, ey + ny * off];
  return { p0, p1, ext: [[[ax + nx * gap, ay + ny * gap], [p0[0] + nx * over, p0[1] + ny * over]], [[ex + nx * gap, ey + ny * gap], [p1[0] + nx * over, p1[1] + ny * over]]], mid: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], len, ux, uy };
}
// the label of a dimension: always read left to right, centred on the line
export function dimLabelBox(it, measure) {
  const g = dimGeom(it), s = dimLabelSize(it), m = measure ? measure({ s, t: it.t || '…' }) : { w: (it.t || '…').length * s * 0.6, h: s * 1.3 };
  const w = Math.max(m.w + 14, 34), h = s * 1.3 + 8;
  return [g.mid[0] - w / 2, g.mid[1] - h / 2, g.mid[0] + w / 2, g.mid[1] + h / 2];
}
// the handle that moves the dimension line of the plan style (a quarter of the way along it, clear of the label)
export function dimOffsetHandle(it) { const g = dimGeom(it); return [g.p0[0] + (g.p1[0] - g.p0[0]) * 0.25, g.p0[1] + (g.p1[1] - g.p0[1]) * 0.25]; }
// the offset a pointer at (x, y) asks for (signed distance from the measured line, along its normal)
export function dimOffsetFor(it, x, y) { const g = dimGeom({ ...it, style: 'simple' }); return (x - it.a[0]) * -g.uy + (y - it.a[1]) * g.ux; }
export const nextPinNumber = items => 1 + items.reduce((n, it) => (it.k === 'pin' ? Math.max(n, it.n) : n), 0);

// the points a line / arrow runs through, following the shapes it is glued to.
// straight: two points (each end leaves its shape on the line towards the other end).
// elbow: right angles — leaves the middle of a side of each shape and bends twice (a Z, or a straight run when aligned).
export function linePath(it, byId) {
  const sFrom = it.from && isShape(byId[it.from]) ? byId[it.from] : null, sTo = it.to && isShape(byId[it.to]) ? byId[it.to] : null;
  if (it.elbow) {
    const A0 = sFrom ? centerOf(sFrom) : it.a, E0 = sTo ? centerOf(sTo) : it.e;
    const dx = E0[0] - A0[0], dy = E0[1] - A0[1], horizontal = Math.abs(dx) >= Math.abs(dy);
    const a = sFrom ? sideMid(sFrom, horizontal ? (dx >= 0 ? 'r' : 'l') : (dy >= 0 ? 'b' : 't')) : it.a;
    const e = sTo ? sideMid(sTo, horizontal ? (dx >= 0 ? 'l' : 'r') : (dy >= 0 ? 't' : 'b')) : it.e;
    const pts = horizontal ? [a, [(a[0] + e[0]) / 2, a[1]], [(a[0] + e[0]) / 2, e[1]], e] : [a, [a[0], (a[1] + e[1]) / 2], [e[0], (a[1] + e[1]) / 2], e];
    return tidyPath(pts);
  }
  const aim = sTo ? centerOf(sTo) : it.e, from = sFrom ? centerOf(sFrom) : it.a;
  return [sFrom ? edgePoint(sFrom, aim[0], aim[1]) : it.a, sTo ? edgePoint(sTo, from[0], from[1]) : it.e];
}
// drop repeated points and middle points that lie on a straight run
function tidyPath(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 0.01 || Math.abs(q[1] - p[1]) > 0.01) out.push(p); }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01)) out.splice(i, 1);
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]];
}
// both ends of a line / arrow
export function lineEnds(it, byId) {
  const p = linePath(it, byId), a = p[0], e = p[p.length - 1];
  return [a[0], a[1], e[0], e[1]];
}
export function insideShape(s, x, y) {
  const [cx, cy] = centerOf(s), a = s.bw / 2, b = s.bh / 2, dx = x - cx, dy = y - cy;
  if (s.k === 'ellipse') return (dx / a) ** 2 + (dy / b) ** 2 <= 1;
  if (s.k === 'diamond') return Math.abs(dx) / a + Math.abs(dy) / b <= 1;
  return Math.abs(dx) <= a && Math.abs(dy) <= b;
}
// the topmost shape under a point (for gluing a line's end to it)
export function shapeAt(items, x, y, exceptId = null) {
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (isShape(it) && it.id !== exceptId && insideShape(it, x, y)) return it; }
  return null;
}

// ---------- bounds ----------
// measure(item) → { w, h } of its text (supplied by the canvas side)
export function textBox(it) { return { x: it.x, y: it.y }; }
export function boundsOf(it, byId, measure) {
  if (it.k === 'stroke') {
    if (it.b) return it.b;
    const p = it.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
    const pad = (it.tool === 'marker' ? it.w * 4 : it.w) / 2 + 1;
    Object.defineProperty(it, 'b', { value: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], enumerable: false });
    return it.b;
  }
  if (isShape(it)) {
    const pad = it.w / 2 + 1; let b = [it.x - pad, it.y - pad, it.x + it.bw + pad, it.y + it.bh + pad];
    if (it.k === 'callout') { const q = it.w + 12; b = [Math.min(b[0], it.tip[0] - q), Math.min(b[1], it.tip[1] - q), Math.max(b[2], it.tip[0] + q), Math.max(b[3], it.tip[1] + q)]; }
    return b;
  }
  if (isPin(it)) return [it.x - it.r - 2, it.y - it.r - 2, it.x + it.r + 2, it.y + it.r + 2];
  if (isDim(it)) {
    const g = dimGeom(it), pad = it.w * 2 + 6, lb = dimLabelBox(it, measure);
    const xs = [g.p0[0], g.p1[0], it.a[0], it.e[0], lb[0], lb[2]], ys = [g.p0[1], g.p1[1], it.a[1], it.e[1], lb[1], lb[3]];
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  }
  if (isLine(it)) {
    const pts = linePath(it, byId), pad = it.w / 2 + 8 + it.w * 2;
    return [Math.min(...pts.map(q => q[0])) - pad, Math.min(...pts.map(q => q[1])) - pad, Math.max(...pts.map(q => q[0])) + pad, Math.max(...pts.map(q => q[1])) + pad];
  }
  const m = measure ? measure(it) : { w: it.t.length * it.s * 0.6, h: it.s * 1.3 };
  return [it.x, it.y, it.x + m.w, it.y + m.h];
}
export function sceneBounds(items, bg, measure) {
  const byId = byIdMap(items);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) { const b = boundsOf(it, byId, measure); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (bg) { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, bg.w); y1 = Math.max(y1, bg.h); }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

// ---------- hit testing ----------
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0, cx = ax + t * dx - px, cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}
export function hitItem(it, x, y, tol, byId, measure) {
  if (it.k === 'stroke') {
    const b = boundsOf(it, byId, measure); if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
    const p = it.p, r = tol + it.w / 2;
    if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= r;
    for (let i = 3; i < p.length; i += 3) if (segDist(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= r) return true;
    return false;
  }
  if (isPin(it)) return Math.hypot(x - it.x, y - it.y) <= it.r + tol;
  if (isDim(it)) {
    const g = dimGeom(it), lb = dimLabelBox(it, measure), r = tol + it.w / 2 + 2;
    if (x >= lb[0] - tol && x <= lb[2] + tol && y >= lb[1] - tol && y <= lb[3] + tol) return true;
    if (segDist(x, y, g.p0[0], g.p0[1], g.p1[0], g.p1[1]) <= r) return true;
    return g.ext.some(([[x0, y0], [x1, y1]]) => segDist(x, y, x0, y0, x1, y1) <= r);
  }
  if (it.k === 'callout') { const [[x0, y0], [x1, y1]] = calloutLine(it); if (segDist(x, y, x0, y0, x1, y1) <= tol + it.w / 2 + 2) return true; }
  if (isShape(it)) {
    if (it.f || it.t || it.k === 'callout') return insideShape({ ...it, bw: it.bw + tol * 2, bh: it.bh + tol * 2, x: it.x - tol, y: it.y - tol }, x, y);
    const outer = insideShape({ ...it, bw: it.bw + tol * 2, bh: it.bh + tol * 2, x: it.x - tol, y: it.y - tol }, x, y);
    const inner = it.bw > tol * 2 && it.bh > tol * 2 && insideShape({ ...it, bw: it.bw - tol * 2, bh: it.bh - tol * 2, x: it.x + tol, y: it.y + tol }, x, y);
    return outer && !inner;                                                  // an empty shape is taken by its outline
  }
  if (isLine(it)) {
    const pts = linePath(it, byId);
    for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= tol + it.w / 2 + 2) return true;
    return false;
  }
  const b = boundsOf(it, byId, measure); return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol;
}
export function topItemAt(items, x, y, tol, measure) {
  const byId = byIdMap(items);
  for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], x, y, tol, byId, measure)) return items[i];
  return null;
}

// ---------- editing ----------
export function translateItem(it, dx, dy) {
  if (it.k === 'stroke') { const p = it.p.slice(); for (let i = 0; i < p.length; i += 3) { p[i] += dx; p[i + 1] += dy; } return { ...it, p }; }
  if (it.k === 'callout') return { ...it, x: it.x + dx, y: it.y + dy, tip: [it.tip[0] + dx, it.tip[1] + dy] };
  if (isShape(it) || it.k === 'text' || isPin(it)) return { ...it, x: it.x + dx, y: it.y + dy };
  if (isDim(it)) return { ...it, a: [it.a[0] + dx, it.a[1] + dy], e: [it.e[0] + dx, it.e[1] + dy] };
  return { ...it, a: [it.a[0] + dx, it.a[1] + dy], e: [it.e[0] + dx, it.e[1] + dy], from: null, to: null };   // dragging a line by itself unglues it
}
// drag a corner of a shape: `which` is 'nw' | 'ne' | 'sw' | 'se'; the opposite corner stays where it is
export function resizeShape(it, which, x, y) {
  const fx = which.includes('w') ? it.x + it.bw : it.x, fy = which.includes('n') ? it.y + it.bh : it.y;
  const nx = Math.min(fx, x), ny = Math.min(fy, y);
  return { ...it, x: nx, y: ny, bw: Math.max(12, Math.abs(x - fx)), bh: Math.max(12, Math.abs(y - fy)) };
}
export function cornerPoints(it) { return { nw: [it.x, it.y], ne: [it.x + it.bw, it.y], sw: [it.x, it.y + it.bh], se: [it.x + it.bw, it.y + it.bh] }; }

// remove items; a line glued to a removed shape stays where it was drawn
export function removeItems(items, ids) {
  const drop = new Set(ids), byId = byIdMap(items);
  return items.filter(it => !drop.has(it.id)).map(it => {
    if (!isLine(it) || (!drop.has(it.from) && !drop.has(it.to))) return it;
    const [ax, ay, ex, ey] = lineEnds(it, byId);
    return { ...it, a: [ax, ay], e: [ex, ey], from: drop.has(it.from) ? null : it.from, to: drop.has(it.to) ? null : it.to };
  });
}
export function duplicateItem(it, dx = 24, dy = 24) {
  const c = translateItem(it, dx, dy);
  return { ...c, id: uid(), ...(isLine(it) ? { from: null, to: null } : {}) };
}

// ---------- several items at once ----------
// Move a group. A line inside the group whose end is glued to a shape that moves too keeps that glue (it follows the shape);
// a line whose other end is glued to something NOT moving lets go of it and moves where it is drawn.
export function translateMany(items, ids, dx, dy) {
  const set = new Set(ids), byId = byIdMap(items);
  return items.map(it => {
    if (!set.has(it.id)) return it;
    if (!isLine(it)) return translateItem(it, dx, dy);
    const [ax, ay, ex, ey] = lineEnds(it, byId), keepFrom = it.from && set.has(it.from), keepTo = it.to && set.has(it.to);
    return { ...it, a: keepFrom ? it.a : [ax + dx, ay + dy], e: keepTo ? it.e : [ex + dx, ey + dy], from: keepFrom ? it.from : null, to: keepTo ? it.to : null };
  });
}
// copies of several items (new ids); lines between copied shapes join the copies, other lines come out free
export function duplicateItems(items, ids, dx = 24, dy = 24) {
  const set = new Set(ids), byId = byIdMap(items), idMap = {};
  const picked = items.filter(it => set.has(it.id));
  for (const it of picked) idMap[it.id] = uid();
  let pinNo = nextPinNumber(items);
  const copies = picked.map(it => {
    if (isPin(it)) return { ...translateItem(it, dx, dy), id: idMap[it.id], n: pinNo++ };
    if (!isLine(it)) return { ...translateItem(it, dx, dy), id: idMap[it.id] };
    const [ax, ay, ex, ey] = lineEnds(it, byId), fromIn = it.from && set.has(it.from), toIn = it.to && set.has(it.to);
    return { ...it, id: idMap[it.id], a: fromIn ? it.a : [ax + dx, ay + dy], e: toIn ? it.e : [ex + dx, ey + dy], from: fromIn ? idMap[it.from] : null, to: toIn ? idMap[it.to] : null };
  });
  return { copies, idMap };
}
// ids of the items lying completely inside a rectangle [x0, y0, x1, y1]
export function itemsInRect(items, rect, measure) {
  const [rx0, ry0, rx1, ry1] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])], byId = byIdMap(items);
  return items.filter(it => { const b = boundsOf(it, byId, measure); return b[0] >= rx0 && b[1] >= ry0 && b[2] <= rx1 && b[3] <= ry1; }).map(it => it.id);
}
