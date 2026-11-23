import test from 'node:test';
import assert from 'node:assert/strict';
import { indexNotes, pathOf, descendantIds, wouldCycle, buildTree, visibleRows, parentOf, noteLabel } from '../lib/noteTree.js';

const N = (id, parent_id = null, title = id) => ({ id, parent_id, title, content: '' });
const notes = [N('a'), N('b', 'a'), N('c', 'b'), N('d', 'a'), N('e'), N('f', 'gone')];

test('children are grouped under their parent; a missing parent means top level', () => {
  const { kids } = indexNotes(notes);
  assert.deepEqual(kids.get(null).map(n => n.id), ['a', 'e', 'f']);          // f's parent is not in the list → top level
  assert.deepEqual(kids.get('a').map(n => n.id), ['b', 'd']);
  assert.deepEqual(kids.get('b').map(n => n.id), ['c']);
  assert.equal(parentOf(notes[5], indexNotes(notes).byId), null);
});

test('the path runs from the top to the note, and does not loop on bad data', () => {
  const { byId } = indexNotes(notes);
  assert.deepEqual(pathOf('c', byId).map(n => n.id), ['a', 'b', 'c']);
  assert.deepEqual(pathOf('e', byId).map(n => n.id), ['e']);
  assert.deepEqual(pathOf('nope', byId), []);
  const loop = indexNotes([N('x', 'y'), N('y', 'x')]);
  assert.ok(pathOf('x', loop.byId).length <= 2);
  const self = indexNotes([N('s', 's')]);
  assert.deepEqual(pathOf('s', self.byId).map(n => n.id), ['s']);
});

test('descendants at any depth', () => {
  const { kids } = indexNotes(notes);
  assert.deepEqual(descendantIds('a', kids).sort(), ['b', 'c', 'd']);
  assert.deepEqual(descendantIds('c', kids), []);
});

test('a note cannot be moved under itself or under one of its own sub-notes', () => {
  const { byId } = indexNotes(notes);
  assert.equal(wouldCycle('a', 'a', byId), true);
  assert.equal(wouldCycle('a', 'c', byId), true);
  assert.equal(wouldCycle('b', 'e', byId), false);
  assert.equal(wouldCycle('c', 'a', byId), false);
  assert.equal(wouldCycle('a', null, byId), false);
});

test('the tree and the rows it shows (closed nodes hide their sub-notes)', () => {
  const tree = buildTree(notes);
  assert.deepEqual(tree.map(t => t.note.id), ['a', 'e', 'f']);
  assert.equal(tree[0].children[0].children[0].note.id, 'c');
  assert.deepEqual(visibleRows(tree, new Set()).map(r => r.note.id), ['a', 'e', 'f']);
  assert.deepEqual(visibleRows(tree, new Set(['a'])).map(r => `${r.depth}${r.note.id}`), ['0a', '1b', '1d', '0e', '0f']);
  assert.deepEqual(visibleRows(tree, new Set(['a', 'b'])).map(r => r.note.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(visibleRows(tree, new Set())[0].hasKids, true);
});

test('a label comes from the title, else the first line without its list marker', () => {
  assert.equal(noteLabel({ title: ' แผนปีใหม่ ', content: 'x' }), 'แผนปีใหม่');
  assert.equal(noteLabel({ title: '', content: '[ ] ซื้อนม\nอย่างอื่น' }), 'ซื้อนม');
  assert.equal(noteLabel({ title: '', content: '' }), 'โน้ตไม่มีชื่อ');
});

test('ids may be numbers (the database) or text (a URL): both find the same note', () => {
  const rows = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 2 }];
  const { byId, kids } = indexNotes(rows);
  assert.equal(byId.get('2').id, 2);
  assert.equal(byId.has('3'), true);
  assert.deepEqual(pathOf('3', byId).map(n => n.id), [1, 2, 3]);
  assert.deepEqual(descendantIds('1', kids), [2, 3]);
  assert.equal(wouldCycle('1', '3', byId), true);
  assert.equal(wouldCycle(1, 3, byId), true);
  assert.equal(wouldCycle(3, 1, byId), false);
  assert.equal(parentOf(rows[1], byId), 1);
});
