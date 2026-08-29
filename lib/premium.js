// lib/premium.js
//
// Shared by every Premium-gated API route (notes/tasks/calendar/
// expenses view pages). Centralizing this in one place means the
// "is this user currently Premium" check — active flag AND not
// expired — only has to be right in one spot, matching the same
// logic the Worker's isUserPremiumActive() uses on the bot side.

import { supabaseAdmin } from './supabaseAdmin';
import { getSession } from './session';

export async function getPremiumSession(cookieStore) {
  const session = await getSession(cookieStore);
  if (!session) return { session: null, isPremium: false };

  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from('users')
    .select('is_premium, premium_until')
    .eq('line_user_id', session.lineUserId)
    .maybeSingle();

  const isPremium = !!data?.is_premium && (!data.premium_until || new Date(data.premium_until) > new Date());
  return { session, isPremium };
}
