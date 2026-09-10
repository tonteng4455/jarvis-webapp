// lib/premium.js
//
// Premium was cut from the whole system — every route that used to be
// gated on isPremium now gets the same unlimited access, matching the
// bot Worker's isUserPremiumActive() (also a permanent-true stub now —
// see its own comment in jarvis-line-bot.js). Kept as a function
// (rather than inlining `true` at every call site) so every route that
// destructures `{ session, isPremium }` from here keeps working
// unchanged — only this one place needed to change.

import { getSession } from './session';

export async function getPremiumSession(cookieStore) {
  const session = await getSession(cookieStore);
  if (!session) return { session: null, isPremium: false };
  return { session, isPremium: true };
}
