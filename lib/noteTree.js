// lib/noteTree.js — notes inside notes. Pure helpers shared by the page and the API (no DOM, no database).
// A note has an optional `parent_id`. A parent that is not in the list (archived, deleted, not loaded) counts as "no parent":
// the note is shown at the top level instead of disappearing.

// note ids are numbers in the database but strings in a URL (?p=12): keys are compared as text, so both find the same note
class KeyMap extends Map {
  static k(v) { return v == null ? null : String(v); }
  get(key) { return super.get(KeyMap.k(key)); }
  has(key) { return super.has(KeyMap.k(key)); }
  set(key, val) { return super.set(KeyMap.k(key), val); }
}
const same = (a, b) => a != null && b != null && String(a) === String(b);

export function indexNotes(notes) {
  const byId = new KeyMap();
  for (const n of notes || []) byId.set(n.id, n);
  const kids = new KeyMap();                                // parent id (or null) → [note]
  for (const n of notes || []) {
    const p = n.parent_id != null && byId.has(n.parent_id) && !same(n.parent_id, n.id) ? n.parent_id : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(n);
  }
  return { byId, kids };
}

export const parentOf = (note, byId) => (note?.parent_id != null && byId.has(note.parent_id) && !same(note.parent_id, note.id) ? note.parent_id : null);

// root → … → the note itself (cycle-safe: stops if it meets a note twice)
export function pathOf(id, byId) {
  const out = [], seen = new Set();
  let cur = byId.get(id);
  while (cur && !seen.has(String(cur.id))) { seen.add(String(cur.id)); out.unshift(cur); const up = parentOf(cur, byId); cur = up == null ? null : byId.get(up); }
  return out;
}

// every note below `id`, at any depth
export function descendantIds(id, kids) {
  const out = [], seen = new Set([String(id)]), stack = [id];
  while (stack.length) {
    for (const k of kids.get(stack.pop()) || []) if (!seen.has(String(k.id))) { seen.add(String(k.id)); out.push(k.id); stack.push(k.id); }
  }
  return out;
}

// would moving `id` under `newParentId` make a loop? (itself, or one of its own sub-notes)
export function wouldCycle(id, newParentId, byId) {
  if (newParentId == null || newParentId === '') return false;
  if (same(newParentId, id)) return true;
  return pathOf(newParentId, byId).some(n => same(n.id, id));
}

export const MAX_TREE_DEPTH = 50;    // a safety net only — nobody nests that far

// the whole tree as nested { note, children } for the picker / side panel
export function buildTree(notes, cmp) {
  const { kids } = indexNotes(notes);
  const make = (parent, depth) => {
    const list = [...(kids.get(parent) || [])];
    if (cmp) list.sort(cmp);
    return list.map(note => ({ note, depth, children: depth < MAX_TREE_DEPTH ? make(note.id, depth + 1) : [] }));
  };
  return make(null, 0);
}

// the rows a tree shows, given which nodes are open → [{ note, depth, hasKids, open }]
export function visibleRows(tree, openIds) {
  const rows = [];
  const walk = nodes => { for (const t of nodes) { const open = openIds.has(t.note.id); rows.push({ note: t.note, depth: t.depth, hasKids: t.children.length > 0, open }); if (open) walk(t.children); } };
  walk(tree);
  return rows;
}

export const noteLabel = n => (String(n?.title || '').trim() || String(n?.content || '').split('\n').map(s => s.replace(/^\s*([-*•]|\[[ xX]?\]|\d+\.)\s*/, '').trim()).find(Boolean) || 'โน้ตไม่มีชื่อ').slice(0, 60);
