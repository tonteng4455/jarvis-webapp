// lib/accounts.js — who is who when a person can sign in with LINE or Google (server only).
//
// Every table keeps one key per person (users.line_user_id, <table>.user_id):
//   · a LINE person: their LINE user id (the LINE bot uses it as it is),
//   · a person who only ever signed in with Google: "google:<google id>".
// Table user_identities (accounts.sql) says which Google sign-in belongs to which key. Joining two accounts moves everything
// to ONE key with merge_accounts() — the LINE key wins when there is one, so the bot keeps finding the data.

export const GOOGLE_PREFIX = 'google:';
export const isGoogleKey = key => String(key || '').startsWith(GOOGLE_PREFIX);
export const isLineKey = key => !!key && !isGoogleKey(key);

// the tables the summary counts (what a person would miss if it were lost)
export const COUNTED = [['notes', 'โน้ต'], ['tasks', 'งาน'], ['calendar_events', 'นัดหมาย'], ['expenses', 'รายการเงิน'], ['user_files', 'ไฟล์']];

// when two accounts become one: the LINE-type key wins (the bot needs it); two of the same type → the account that is signed in now
export function mergeTarget(currentKey, otherKey) {
  if (isLineKey(currentKey) && isGoogleKey(otherKey)) return { to: currentKey, from: otherKey };
  if (isGoogleKey(currentKey) && isLineKey(otherKey)) return { to: otherKey, from: currentKey };
  return { to: currentKey, from: otherKey };
}

export async function identityOf(supabase, provider, subject) {
  const { data } = await supabase.from('user_identities').select('user_id, label').eq('provider', provider).eq('subject', String(subject)).maybeSingle();
  return data || null;
}

// A Google sign-in → the key of the account it belongs to (made on the spot for a brand new person).
export async function keyForGoogle(supabase, { sub, name, picture, email }) {
  const found = await identityOf(supabase, 'google', sub);
  if (found) return { key: found.user_id, created: false };
  const key = GOOGLE_PREFIX + sub;
  const { error: uerr } = await supabase.from('users').upsert({ line_user_id: key, display_name: name || email || null, picture_url: picture || null, updated_at: new Date().toISOString() }, { onConflict: 'line_user_id' });
  if (uerr) throw new Error('users upsert failed: ' + uerr.message);
  const { error: ierr } = await supabase.from('user_identities').upsert({ provider: 'google', subject: String(sub), user_id: key, label: email || name || null }, { onConflict: 'provider,subject' });
  if (ierr) throw new Error('identity insert failed: ' + ierr.message);
  return { key, created: true };
}

export async function identitiesOf(supabase, key) {
  const { data } = await supabase.from('user_identities').select('provider, subject, label').eq('user_id', key);
  return data || [];
}

export async function countsFor(supabase, key) {
  const out = {};
  await Promise.all(COUNTED.map(async ([table]) => {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('user_id', key);
    out[table] = count || 0;
  }));
  return out;
}

export async function mergeAccounts(supabase, from, to) {
  const { error } = await supabase.rpc('merge_accounts', { p_from: from, p_to: to });
  if (error) throw new Error('merge failed: ' + error.message);
}

export async function profileOf(supabase, key) {
  const { data } = await supabase.from('users').select('display_name, picture_url').eq('line_user_id', key).maybeSingle();
  return data || {};
}
