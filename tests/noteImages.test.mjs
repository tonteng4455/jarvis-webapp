import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNoteImages, replacedIds } from '../lib/noteImages.js';

const A = 'aaaaaaaaaaaa', B = 'bbbbbbbbbbbb', C = 'cccccccccccc';

test('a re-saved drawing lists the older files it replaces (one or several); they are not stored in the note', () => {
  const input = [{ drive_file_id: A, kind: 'sketch', replaces: [B, C] }, { drive_file_id: C, replaces: B }, { drive_file_id: 'x', replaces: 'short' }];
  assert.deepEqual(replacedIds(input).sort(), [B, C].sort());
  const kept = sanitizeNoteImages(input);
  assert.equal(kept.length, 2);
  assert.equal('replaces' in kept[0], false);
});

test('replacing: a file never replaces itself, junk and non-lists are ignored', () => {
  assert.deepEqual(replacedIds([{ drive_file_id: A, replaces: A }]), []);
  assert.deepEqual(replacedIds(null), []);
  assert.deepEqual(replacedIds([{ drive_file_id: A, replaces: 42 }]), []);
});
