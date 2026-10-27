import test from 'node:test';
import assert from 'node:assert/strict';
import { dimOffsetHandle, dimOffsetFor, isShape, dimGeom, dimLabelBox, calloutLine, nextPinNumber, linePath, translateMany, duplicateItems, itemsInRect, cleanItems, edgePoint, lineEnds, insideShape, shapeAt, hitItem, topItemAt, translateItem, resizeShape, removeItems, byIdMap, sceneBounds, boundsOf, duplicateItem, serializeItems } from '../lib/sketchModel.js';

const rect = (o = {}) => ({ k: 'rect', id: 'r1', c: '#000', w: 3, f: false, x: 100, y: 100, bw: 200, bh: 100, t: '', ...o });
const arrow = (o = {}) => ({ k: 'arrow', id: 'a1', c: '#000', w: 3, a: [0, 0], e: [50, 0], from: null, to: null, ...o });
const approx = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} ≈ ${b}`);

test('old drawings (plain strokes without a kind) are still read', () => {
  const out = cleanItems([{ c: '#f00', w: 4, tool: 'pen', p: [1, 2, 0.5, 3, 4, 0.5] }]);
  assert.equal(out.length, 1); assert.equal(out[0].k, 'stroke'); assert.ok(out[0].id);
});

test('junk in a saved scene is dropped, not trusted', () => {
  const out = cleanItems([null, 5, { k: 'stroke', p: [1, 2] }, { k: 'arrow', a: [0, 'x'], e: [1, 1] }, { k: 'text', t: '   ' }, { k: 'wat' }, rect({ bw: -5, bh: NaN })]);
  assert.deepEqual(out.map(i => i.k), ['rect']);
  assert.ok(out[0].bw >= 4 && Number.isFinite(out[0].bh));
});

test('glue to a shape that is not in the drawing is dropped', () => {
  const [l] = cleanItems([arrow({ from: 'ghost', to: 'ghost2' })]);
  assert.equal(l.from, null); assert.equal(l.to, null);
});

test('edge points: rectangle, ellipse, diamond', () => {
  const r = rect(), [cx, cy] = [200, 150];
  const [rx, ry] = edgePoint(r, 500, cy); approx(rx, 300); approx(ry, cy);          // straight right
  const [tx, ty] = edgePoint(r, cx, -500); approx(tx, cx); approx(ty, 100);          // straight up
  const e = rect({ k: 'ellipse' }); const [ex] = edgePoint(e, 900, cy); approx(ex, 300);
  const d = rect({ k: 'diamond' }); const [dx, dy] = edgePoint(d, cx, 900); approx(dx, cx); approx(dy, 200);
  const [qx, qy] = edgePoint(r, 300, 200); approx(qx, 300); approx(qy, 200);       // towards the corner
});

test('a glued arrow follows its shapes when they move', () => {
  const a = rect({ id: 'A', x: 0, y: 0, bw: 100, bh: 100 }), b = rect({ id: 'B', x: 300, y: 0, bw: 100, bh: 100 });
  const ar = arrow({ from: 'A', to: 'B', a: [0, 0], e: [0, 0] });
  let ends = lineEnds(ar, byIdMap([a, b, ar])); approx(ends[0], 100); approx(ends[2], 300); approx(ends[1], 50);
  const moved = translateItem(b, 0, 200);
  ends = lineEnds(ar, byIdMap([a, moved, ar]));
  assert.ok(ends[3] > 50 && ends[3] < 250, 'end is on the moved shape');
});

test('removing a shape leaves its arrows where they were', () => {
  const a = rect({ id: 'A', x: 0, y: 0, bw: 100, bh: 100 }), b = rect({ id: 'B', x: 300, y: 0, bw: 100, bh: 100 });
  const ar = arrow({ from: 'A', to: 'B' });
  const left = removeItems([a, b, ar], ['B']);
  assert.equal(left.length, 2);
  const kept = left.find(i => i.id === 'a1'); assert.equal(kept.to, null); assert.equal(kept.from, 'A');
  approx(kept.e[0], 300);
});

test('hit testing: an empty shape is taken by its outline, a filled one anywhere inside, a label counts as filled', () => {
  const byId = {};
  const empty = rect(), filled = rect({ f: true }), labelled = rect({ t: 'เริ่ม' });
  assert.equal(hitItem(empty, 200, 150, 8, byId), false);        // inside, nothing there
  assert.equal(hitItem(empty, 100, 150, 8, byId), true);         // on the left border
  assert.equal(hitItem(filled, 200, 150, 8, byId), true);
  assert.equal(hitItem(labelled, 200, 150, 8, byId), true);
  assert.equal(hitItem(empty, 50, 50, 8, byId), false);
});

test('the item on top wins; a line can be picked near its middle', () => {
  const items = [rect({ f: true }), rect({ id: 'r2', f: true, x: 150, y: 120, bw: 50, bh: 50 })];
  assert.equal(topItemAt(items, 160, 130, 6).id, 'r2');
  assert.equal(topItemAt([arrow({ a: [0, 0], e: [100, 100] })], 50, 52, 6).id, 'a1');
  assert.equal(topItemAt([arrow({ a: [0, 0], e: [100, 100] })], 50, 90, 6), null);
});

test('shapeAt finds the shape a line ends in (not the one it starts in)', () => {
  const items = [rect({ id: 'A' }), rect({ id: 'B', x: 400 })];
  assert.equal(shapeAt(items, 450, 150).id, 'B');
  assert.equal(shapeAt(items, 450, 150, 'B'), null);
  assert.equal(shapeAt(items, 0, 0), null);
});

test('resizing a corner keeps the opposite corner fixed and never flips or collapses', () => {
  const r = rect();
  const a = resizeShape(r, 'se', 400, 300); assert.deepEqual([a.x, a.y, a.bw, a.bh], [100, 100, 300, 200]);
  const b = resizeShape(r, 'nw', 50, 40); assert.deepEqual([b.x, b.y, b.bw, b.bh], [50, 40, 250, 160]);
  const c = resizeShape(r, 'se', 20, 20);   // dragged past the opposite corner → mirrors
  assert.deepEqual([c.x, c.y, c.bw, c.bh], [20, 20, 80, 80]);
  const d = resizeShape(r, 'se', 100, 100); assert.ok(d.bw >= 12 && d.bh >= 12);
});

test('moving: strokes and shapes move, a line dragged by itself comes unglued', () => {
  const s = { k: 'stroke', id: 's', c: '#000', w: 3, tool: 'pen', p: [0, 0, 1, 10, 10, 1] };
  assert.deepEqual(translateItem(s, 5, 7).p, [5, 7, 1, 15, 17, 1]);
  assert.deepEqual(s.p, [0, 0, 1, 10, 10, 1], 'the original is not changed');
  const l = translateItem(arrow({ from: 'A', to: 'B' }), 10, 0); assert.equal(l.from, null); assert.deepEqual(l.a, [10, 0]);
});

test('bounds cover shapes, arrows and text; empty drawing has none', () => {
  assert.equal(sceneBounds([], null), null);
  const b = sceneBounds([rect(), arrow({ a: [0, 0], e: [500, 600] }), { k: 'text', id: 't', c: '#000', s: 20, x: 900, y: 10, t: 'hello' }], null, it => ({ w: 50, h: 26 }));
  assert.ok(b[0] <= 0 && b[1] <= 0 && b[2] >= 950 && b[3] >= 600);
});

test('duplicate gets a new id and offset; a duplicated line is unglued; serialising keeps own fields only', () => {
  const r = rect(); const d = duplicateItem(r); assert.notEqual(d.id, r.id); assert.equal(d.x, 124);
  const l = duplicateItem(arrow({ from: 'A', to: 'B' })); assert.equal(l.from, null);
  const s = { k: 'stroke', id: 's', c: '#000', w: 3, tool: 'pen', p: [0, 0, 1] }; boundsOf(s, {});
  assert.ok(!('b' in serializeItems([s])[0]), 'cached bounds are not saved');
});

test('insideShape basics', () => {
  assert.equal(insideShape(rect({ k: 'ellipse' }), 105, 105), false);   // corner of the box is outside an ellipse
  assert.equal(insideShape(rect({ k: 'diamond' }), 200, 150), true);
  assert.equal(insideShape(rect({ k: 'diamond' }), 105, 105), false);
});

// ---- elbow lines, groups ----
const A = (o = {}) => rect({ id: 'A', x: 0, y: 0, bw: 100, bh: 60, ...o }), Bq = (o = {}) => rect({ id: 'B', x: 300, y: 200, bw: 100, bh: 60, ...o });

test('elbow: leaves the right side of the first shape, bends twice, enters the left side of the second', () => {
  const a = A(), b = Bq(), l = arrow({ elbow: true, from: 'A', to: 'B' });
  const p = linePath(l, byIdMap([a, b, l]));
  assert.deepEqual(p, [[100, 30], [200, 30], [200, 230], [300, 230]]);
  assert.ok(p.every((q, i) => i === 0 || q[0] === p[i - 1][0] || q[1] === p[i - 1][1]), 'every segment is horizontal or vertical');
});

test('elbow: stacked shapes route vertically; aligned shapes give a straight run', () => {
  const a = A(), b = Bq({ x: 20, y: 300 }), l = arrow({ elbow: true, from: 'A', to: 'B' });
  const p = linePath(l, byIdMap([a, b, l]));
  assert.deepEqual(p[0], [50, 60]); assert.deepEqual(p[p.length - 1], [70, 300]);
  const b2 = Bq({ x: 300, y: 0 }); const p2 = linePath(arrow({ elbow: true, from: 'A', to: 'B' }), byIdMap([a, b2]));
  assert.deepEqual(p2, [[100, 30], [300, 30]]);
});

test('elbow with free ends keeps the ends where they are', () => {
  const p = linePath(arrow({ elbow: true, a: [0, 0], e: [100, 50] }), {});
  assert.deepEqual(p[0], [0, 0]); assert.deepEqual(p.at(-1), [100, 50]); assert.ok(p.length >= 3);
});

test('an elbow arrow can be picked on any of its segments, and its bounds cover the whole route', () => {
  const a = A(), b = Bq(), l = arrow({ elbow: true, from: 'A', to: 'B' }), byId = byIdMap([a, b, l]);
  assert.equal(hitItem(l, 200, 130, 6, byId), true);       // the vertical middle run
  assert.equal(hitItem(l, 150, 130, 6, byId), false);      // empty space where a straight line would have been
  const bb = boundsOf(l, byId); assert.ok(bb[0] <= 100 && bb[2] >= 300 && bb[3] >= 230);
  assert.equal(cleanItems([{ ...l, elbow: true }])[0].elbow, true);
  assert.equal(cleanItems([{ ...l, elbow: 'yes' }])[0].elbow, false);
});

test('moving a group: glue inside the group is kept, glue to outsiders is let go', () => {
  const a = A(), b = Bq(), c = rect({ id: 'C', x: 600, y: 0 }), inside = arrow({ id: 'in', from: 'A', to: 'B' }), toOutside = arrow({ id: 'out', from: 'B', to: 'C' });
  const moved = translateMany([a, b, c, inside, toOutside], ['A', 'B', 'in', 'out'], 10, 20);
  assert.equal(moved.find(i => i.id === 'A').x, 10); assert.equal(moved.find(i => i.id === 'C').x, 600);
  const i1 = moved.find(i => i.id === 'in'); assert.equal(i1.from, 'A'); assert.equal(i1.to, 'B');
  const o1 = moved.find(i => i.id === 'out'); assert.equal(o1.from, 'B'); assert.equal(o1.to, null);
  assert.ok(Number.isFinite(o1.e[0]) && o1.e[0] > 300);
});

test('a line NOT in the group follows its shapes when they move', () => {
  const a = A(), b = Bq(), l = arrow({ id: 'L', from: 'A', to: 'B' });
  const moved = translateMany([a, b, l], ['A'], 0, 500);
  const ends = lineEnds(moved.find(i => i.id === 'L'), byIdMap(moved));
  assert.ok(ends[1] > 300, 'its start moved down with shape A');
});

test('duplicating a group joins the copies to each other, not to the originals', () => {
  const a = A(), b = Bq(), l = arrow({ id: 'L', from: 'A', to: 'B' }), free = arrow({ id: 'F', a: [0, 400], e: [50, 400] });
  const { copies, idMap } = duplicateItems([a, b, l, free], ['A', 'B', 'L', 'F']);
  assert.equal(copies.length, 4);
  const cl = copies.find(c => c.id === idMap.L); assert.equal(cl.from, idMap.A); assert.equal(cl.to, idMap.B);
  assert.ok(Object.values(idMap).every(v => ![ 'A', 'B', 'L', 'F' ].includes(v)));
  const half = duplicateItems([a, b, l], ['A', 'L']); const hl = half.copies.find(c => c.k === 'arrow'); assert.equal(hl.from, half.idMap.A); assert.equal(hl.to, null);
});

test('marquee picks only what lies completely inside', () => {
  const a = A(), b = Bq();
  assert.deepEqual(itemsInRect([a, b], [-10, -10, 150, 100]), ['A']);
  assert.deepEqual(itemsInRect([a, b], [450, 300, -10, -10]).sort(), ['A', 'B']);
  assert.deepEqual(itemsInRect([a, b], [50, 50, 90, 90]), []);
});

// ---- measured distances, callouts, pins ----
const dim = (o = {}) => ({ k: 'dim', id: 'D', c: '#e03131', w: 4, a: [0, 0], e: [300, 0], style: 'simple', off: 48, t: '3.50 ม.', ...o });
const call = (o = {}) => ({ k: 'callout', id: 'C', c: '#f08c00', w: 3, f: true, x: 200, y: 100, bw: 160, bh: 60, t: 'รอยร้าว', tip: [50, 20], tipStyle: 'arrow', ...o });
const pin = (o = {}) => ({ k: 'pin', id: 'P', c: '#e03131', x: 10, y: 20, n: 1, r: 18, ...o });

test('dim: the simple style measures a → e; the plan style draws the dimension line beside it with extension lines', () => {
  const g = dimGeom(dim());
  assert.deepEqual(g.p0, [0, 0]); assert.deepEqual(g.p1, [300, 0]); assert.equal(g.ext.length, 0); assert.deepEqual(g.mid, [150, 0]);
  const p = dimGeom(dim({ style: 'plan', off: 50 }));
  assert.ok(Math.abs(p.p0[1] - 50) < 1e-9 && Math.abs(p.p1[1] - 50) < 1e-9, 'offset to one side, parallel');
  assert.equal(p.ext.length, 2); assert.ok(p.ext[0][1][1] > 50, 'the extension line runs a little past the dimension line');
  const q = dimGeom(dim({ style: 'plan', off: -50 })); assert.ok(q.p0[1] < 0, 'a negative offset goes to the other side');
});

test('dim: the label is centred on the line and never rotated (its box is wider than tall for a horizontal reading)', () => {
  const v = dim({ a: [0, 0], e: [0, 300] }), b = dimLabelBox(v);
  assert.ok(Math.abs((b[0] + b[2]) / 2) < 1e-9 && Math.abs((b[1] + b[3]) / 2 - 150) < 1e-9);
  assert.ok(b[2] - b[0] > b[3] - b[1]);
});

test('dim / callout / pin load back, with defaults and limits', () => {
  const out = cleanItems([dim({ off: 99999, t: 'x'.repeat(200) }), call({ tip: undefined, tipStyle: 'zzz' }), pin({ n: 0, r: 1000 }), { k: 'dim', a: [0], e: [1, 2] }]);
  assert.equal(out.length, 3);
  assert.equal(out[0].off, 4000); assert.equal(out[0].t.length, 80);
  assert.equal(out[1].tipStyle, 'arrow'); assert.equal(out[1].tip.length, 2);
  assert.equal(out[2].n, 1); assert.equal(out[2].r, 80);
});

test('callout: it is a shape (can be glued, resized, labelled), its pointer is part of it for hit testing and bounds', () => {
  const c = call(); assert.equal(isShape(c), true);
  const [[sx, sy], [tx, ty]] = calloutLine(c); assert.deepEqual([tx, ty], [50, 20]); assert.ok(sx >= 200 && sx <= 360);
  const byId = byIdMap([c]);
  assert.equal(hitItem(c, 120, 60, 6, byId), true, 'on the pointer, away from the box');
  assert.equal(hitItem(c, 120, 200, 6, byId), false);
  const bb = boundsOf(c, byId); assert.ok(bb[0] <= 50 && bb[1] <= 20 && bb[2] >= 360);
});

test('callout / dim / pin move as a whole (a callout takes its tip along)', () => {
  const c = translateItem(call(), 10, 5); assert.deepEqual(c.tip, [60, 25]); assert.equal(c.x, 210);
  const d = translateItem(dim(), 7, 9); assert.deepEqual(d.a, [7, 9]); assert.deepEqual(d.e, [307, 9]);
  const p = translateItem(pin(), 1, 2); assert.equal(p.x, 11); assert.equal(p.y, 22);
});

test('pins: the next number counts on; duplicating pins numbers the copies on', () => {
  assert.equal(nextPinNumber([]), 1);
  assert.equal(nextPinNumber([pin({ id: 'a', n: 1 }), pin({ id: 'b', n: 4 })]), 5);
  const { copies } = duplicateItems([pin({ id: 'a', n: 1 }), pin({ id: 'b', n: 2 })], ['a', 'b']);
  assert.deepEqual(copies.map(c => c.n), [3, 4]);
});

test('dim: a label click selects it; the line and extension lines are hit too', () => {
  const d = dim({ style: 'plan', off: 50 }), byId = byIdMap([d]);
  assert.equal(hitItem(d, 150, 50, 6, byId), true);       // the label
  assert.equal(hitItem(d, 20, 50, 6, byId), true);        // the dimension line
  assert.equal(hitItem(d, 0, 20, 6, byId), true);         // an extension line
  assert.equal(hitItem(d, 150, 200, 6, byId), false);
});

test('dim: the offset follows the pointer (signed, along the normal) and the handle sits on the dimension line', () => {
  const d = dim({ style: 'plan', off: 50 });
  assert.ok(Math.abs(dimOffsetFor(d, 120, 80) - 80) < 1e-9);
  assert.ok(Math.abs(dimOffsetFor(d, 120, -30) + 30) < 1e-9);
  const h = dimOffsetHandle(d); assert.ok(Math.abs(h[1] - 50) < 1e-9 && Math.abs(h[0] - 75) < 1e-9);
});
