import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, edgePoint, lineEnds, insideShape, shapeAt, hitItem, topItemAt, translateItem, resizeShape, removeItems, byIdMap, sceneBounds, boundsOf, duplicateItem, serializeItems } from '../lib/sketchModel.js';

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
