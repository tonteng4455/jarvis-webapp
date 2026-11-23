// lib/noteTreeDb.js — database side of nested notes (see lib/noteTree.js and note_tree.sql).
import { indexNotes, descendantIds } from './noteTree.js';

export const PAGE = 1000;                 // Supabase returns at most 1000 rows per request
export const MAX_NOTES_LOADED = 5000;     // one list call reads up to this many notes (it used to stop at 500, silently hiding the rest)
const missingParent = e => /parent_id/.test(`${e?.message || ''} ${e?.details || ''}`);
export const isMissingParentColumn = missingParent;

// every row a query returns, page by page. `make()` builds a fresh query each time (a query can only be awaited once).
export async function allRows(make, max = MAX_NOTES_LOADED) {
  const out = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await make().range(from, Math.min(from + PAGE, max) - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

// id + parent_id of all the owner's notes (archived too). → { rows, ready } — ready=false when note_tree.sql has not been run yet
export async function loadTreeRows(supabase, owner) {
  const { data, error } = await allRows(() => supabase.from('notes').select('id, parent_id').eq('user_id', owner));
  if (error) return { rows: [], ready: !missingParent(error) ? true : false, error };
  return { rows: data, ready: true };
}

export function treeOf(rows) { return indexNotes(rows); }
export { descendantIds };
