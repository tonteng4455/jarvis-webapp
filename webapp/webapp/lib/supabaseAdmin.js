// lib/supabaseAdmin.js
//
// Server-only Supabase client using the SERVICE ROLE key. This is the
// ONE place in the whole web app allowed to talk to Supabase — per the
// Phase 1 decision, we are NOT doing per-row RLS with minted JWTs yet.
// Authorization instead happens in application code: every API route
// reads the caller's line_user_id from the signed session cookie
// (see lib/session.js) and always filters queries by that id itself.
//
// NEVER import this file from a "use client" component or expose
// SUPABASE_SERVICE_ROLE_KEY to the browser bundle.

import { createClient } from '@supabase/supabase-js';

let _client = null;

export function supabaseAdmin() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
