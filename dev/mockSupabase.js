// dev/mockSupabase.js
//
// In-memory stand-in for the Supabase admin client, used ONLY for local
// testing (MOCK_MODE=1 under `next dev` — see lib/supabaseAdmin.js).
// Implements just the query-builder surface this app actually uses:
// select / insert / update / upsert / delete, eq / neq / lt / gte /
// or / order / limit / single / maybeSingle, plus rpc().
// State lives on globalThis so every route module (Next dev compiles
// them separately) shares one database. Nothing here is ever bundled
// into a production run — the import is gated on NODE_ENV.

import { seed } from './mockSeed';

const DEFAULTS = {
  notes: () => ({ pinned: false, archived: false, images: [], color: 'default', category: 'general', sort_order: null }),
  tasks: () => ({ is_done: false, archived: false, priority: 'medium', category: 'general', recurrence: null, recurrence_time: null, google_event_id: null }),
  expenses: () => ({}),
  calendar_events: () => ({ status: 'scheduled', reminder_minutes: null, google_event_id: null, calendar_id: null }),
  user_files: () => ({ storage: 'drive' }),
  users: () => ({ is_premium: true, used_storage_bytes: 0 }),
  waitlist: () => ({}),
};

function db() {
  if (!globalThis.__mockDb) globalThis.__mockDb = seed();
  return globalThis.__mockDb;
}

export function resetMockDb() { globalThis.__mockDb = seed(); }

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function cmp(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function parseOrClause(clause) {
  // "a.ilike.%x%,b.is.null,c.gt.2024" → [{col, op, val}]
  return clause.split(',').map(part => {
    const [col, op, ...rest] = part.split('.');
    return { col, op, val: rest.join('.') };
  });
}

function matchesOr(row, conds) {
  return conds.some(({ col, op, val }) => {
    const v = row[col];
    if (op === 'is') return val === 'null' ? v == null : v === (val === 'true');
    if (op === 'ilike') return String(v ?? '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
    if (op === 'gt') return v != null && v > val;
    if (op === 'eq') return String(v) === val;
    return false;
  });
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.payload = null;
    this.wantRows = false;
    this.mode = 'many'; // many | single | maybe
    this.countOnly = false;
    this.upsertKey = null;
  }
  select(_cols, opts) {
    if (this.op === 'select') this.op = 'select';
    this.wantRows = true;
    if (opts?.head) this.countOnly = true;
    return this;
  }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(p, opts) { this.op = 'upsert'; this.payload = p; this.upsertKey = opts?.onConflict || 'id'; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col, val) { this.filters.push(r => r[col] === val); return this; }
  in(col, vals) { const set = new Set(vals || []); this.filters.push(r => set.has(r[col])); return this; }
  neq(col, val) { this.filters.push(r => r[col] !== val); return this; }
  not(col, op, val) { if (op === 'is' && val === null) this.filters.push(r => r[col] != null); else if (op === 'eq') this.filters.push(r => r[col] !== val); return this; }
  lt(col, val) { this.filters.push(r => r[col] < val); return this; }
  gte(col, val) { this.filters.push(r => r[col] >= val); return this; }
  or(clause) { const c = parseOrClause(clause); this.filters.push(r => matchesOr(r, c)); return this; }
  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false, nullsFirst: !!opts.nullsFirst }); return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  _rows() {
    const rows = db()[this.table] || (db()[this.table] = []);
    return rows;
  }
  _match(rows) { return rows.filter(r => this.filters.every(f => f(r))); }
  _sort(rows) {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const { col, asc, nullsFirst } of this.orders) {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) continue;
        if (av == null) return nullsFirst === asc ? -1 : 1;
        if (bv == null) return nullsFirst === asc ? 1 : -1;
        const c = cmp(av, bv);
        if (c) return asc ? c : -c;
      }
      return 0;
    });
  }
  _fill(row) {
    const now = new Date().toISOString();
    const base = (DEFAULTS[this.table] || (() => ({})))();
    const out = { ...base, ...row };
    if (out.id === undefined && this.table !== 'users') out.id = globalThis.crypto.randomUUID();
    if (!out.created_at) out.created_at = now;
    if (['notes', 'users'].includes(this.table) && !out.updated_at) out.updated_at = now;
    return out;
  }
  _run() {
    const rows = this._rows();
    let result;
    if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(p => this._fill(clone(p)));
      rows.push(...list);
      result = list;
    } else if (this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      result = list.map(p => {
        const keys = this.upsertKey.split(',');
        const existing = rows.find(r => keys.every(k => r[k] === p[k]));
        if (existing) { Object.assign(existing, clone(p)); return existing; }
        const row = this._fill(clone(p));
        rows.push(row);
        return row;
      });
    } else if (this.op === 'update') {
      result = this._match(rows);
      for (const r of result) Object.assign(r, clone(this.payload));
    } else if (this.op === 'delete') {
      result = this._match(rows);
      const gone = new Set(result);
      db()[this.table] = rows.filter(r => !gone.has(r));
    } else {
      result = this._sort(this._match(rows));
      if (this.limitN != null) result = result.slice(0, this.limitN);
    }

    if (this.countOnly) return { data: null, count: this._match(rows).length, error: null };
    // Writes only return rows if .select() was chained; the app always
    // does when it reads them, and ignoring extras is harmless.
    result = clone(result);
    if (this.mode === 'single') {
      if (result.length !== 1) return { data: null, error: { message: `expected 1 row, got ${result.length}` } };
      return { data: result[0], error: null };
    }
    if (this.mode === 'maybe') return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }
  then(resolve, reject) {
    try { return Promise.resolve(this._run()).then(resolve, reject); } catch (e) { return Promise.reject(e).then(resolve, reject); }
  }
}

const MERGE_TABLES = ['notes', 'tasks', 'calendar_events', 'expenses', 'user_files', 'user_lexicon', 'google_accounts', 'contacts', 'push_subscriptions'];
// the same job as merge_accounts() in accounts.sql
function mergeAccountsMock(from, to) {
  const d = db();
  if (!from || !to || from === to) return;
  const users = d.users || (d.users = []);
  const f = users.find(u => u.line_user_id === from);
  let t = users.find(u => u.line_user_id === to);
  if (!t && f) { t = { ...JSON.parse(JSON.stringify(f)), line_user_id: to }; users.push(t); }
  for (const name of MERGE_TABLES) {
    for (const row of d[name] || []) if (row.user_id === from) row.user_id = to;
  }
  if (f && t) { for (const k of Object.keys(f)) if (k !== 'line_user_id' && k !== 'used_storage_bytes' && (t[k] === null || t[k] === undefined) && f[k] != null) t[k] = f[k]; t.used_storage_bytes = (t.used_storage_bytes || 0) + (f.used_storage_bytes || 0); }
  d.users = users.filter(u => u.line_user_id !== from);
  for (const i of d.user_identities || []) if (i.user_id === from) i.user_id = to;
}

export function mockSupabase() {
  return {
    from: table => new Query(table),
    rpc: async (name, args) => {
      if (name === 'merge_accounts') { mergeAccountsMock(args?.p_from, args?.p_to); return { data: null, error: null }; }
      return name === 'effective_quota_bytes' ? { data: 1073741824, error: null } : { data: null, error: null };
    },
  };
}
