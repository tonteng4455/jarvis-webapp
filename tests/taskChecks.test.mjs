import test from 'node:test';
import assert from 'node:assert/strict';
import { stampNow, checkCounts, checkEvent, completeAllChecks, formatStamp, formatMoment } from '../lib/taskChecks.js';
import { parseContent, serializeBlocks, toggleCheck } from '../lib/noteBlocks.js';

test('progress counts the top-level checkboxes only', () => {
  assert.deepEqual(checkCounts('[x] a\n[ ] b\n  [ ] b1\n  [x] b2\n[ ] c'), { done: 1, total: 3, pct: 33 });
  assert.deepEqual(checkCounts('[x] a ✓2026-11-23 08:10\n[x] b'), { done: 2, total: 2, pct: 100 });
  assert.deepEqual(checkCounts('just text\n- bullet\n1. num'), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(checkCounts(''), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(checkCounts(null), { done: 0, total: 0, pct: 0 });
});

test('ticking the last open sub-item completes the task; un-ticking re-opens it; nothing else does', () => {
  assert.equal(checkEvent('[x] a\n[ ] b', '[x] a\n[x] b'), 'complete');
  assert.equal(checkEvent('[ ] a', '[x] a'), 'complete');                       // a single sub-item
  assert.equal(checkEvent('[x] a\n[x] b', '[x] a\n[ ] b'), 'reopen');
  assert.equal(checkEvent('[ ] a\n[ ] b', '[x] a\n[ ] b'), null);               // not the last one
  assert.equal(checkEvent('[x] a\n[x] b', '[x] a\n[x] b\n[ ] c'), null);        // a NEW open item does not re-open a finished task
  assert.equal(checkEvent('[x] a\n[ ] b', '[x] a'), null);                      // deleting the open one is not a tick
  assert.equal(checkEvent('[x] a', '[x] a edited'), null);
  assert.equal(checkEvent('', '[x] a'), null);
  assert.equal(checkEvent('notes', 'more notes'), null);
});

test('completing the task ticks and stamps every open sub-item (any level), leaving the rest as it was', () => {
  const out = completeAllChecks('intro\n[x] a ✓2026-11-20 09:00\n[ ] b\n  [ ] b1\n- bullet', '2026-11-23 08:10');
  assert.equal(out, 'intro\n[x] a ✓2026-11-20 09:00\n[x] b ✓2026-11-23 08:10\n  [x] b1 ✓2026-11-23 08:10\n- bullet');
  assert.equal(completeAllChecks('[x] a\n[x] b'), null);                         // nothing open → no rewrite
  assert.equal(completeAllChecks('plain text'), null);
  assert.equal(completeAllChecks(''), null);
  assert.equal(completeAllChecks(null), null);
});

test('a tick made in the editor carries the moment, an un-tick forgets it, and it survives a save/load', () => {
  let blocks = parseContent('[ ] a\n[ ] b');
  blocks = toggleCheck(blocks, blocks[0].id, '2026-11-23 08:10').blocks;
  const text = serializeBlocks(blocks);
  assert.equal(text, '[ ] b\n[x] a ✓2026-11-23 08:10');
  const again = parseContent(text);
  assert.equal(again.find(b => b.text === 'a').doneAt, '2026-11-23 08:10');
  const un = toggleCheck(again, again.find(b => b.text === 'a').id, '2026-11-23 09:00').blocks;
  assert.equal(serializeBlocks(un), '[ ] b\n[ ] a');
  // with no stamp given (a note) a tick adds nothing, and an old stamp is kept while the box stays ticked
  const nb = parseContent('[ ] x');
  const note = toggleCheck(nb, nb[0].id);
  assert.equal(serializeBlocks(note.blocks), '[x] x');
});

test('Bangkok time stamps and how they read', () => {
  assert.equal(stampNow(new Date('2026-11-23T01:10:00Z')), '2026-11-23 08:10');
  assert.equal(stampNow(new Date('2026-11-23T17:30:00Z')), '2026-11-24 00:30');   // past midnight in Bangkok
  const now = new Date('2026-11-23T05:00:00Z');
  assert.equal(formatStamp('2026-11-23 08:10', now), '23 พ.ย. 08:10');
  assert.equal(formatStamp('2025-01-02 14:05', now), '2 ม.ค. 2568 14:05');
  assert.equal(formatStamp('nope', now), '');
  assert.equal(formatMoment('2026-11-23T01:10:00Z', now), '23 พ.ย. 08:10');
  assert.equal(formatMoment(null, now), '');
});
