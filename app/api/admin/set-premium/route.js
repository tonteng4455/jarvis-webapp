// app/api/admin/set-premium/route.js
//
// The "manual PromptPay" path agreed for Phase 1: Boq shows a QR code,
// checks the payment landed, then submits this form to flip the payer's
// row to premium for 365 days (annual plan). Protected by a single shared admin
// password (ADMIN_SECRET env var) — this is NOT a full admin auth
// system, just enough gatekeeping since Boq is the only admin. If more
// admins are ever needed, replace this with a proper role check against
// specific line_user_id's instead of a shared secret.
//
// Also runs waitlist promotion (see promoteWaitlist below) — every new
// Premium subscriber raises the user cap by PREMIUM_CAP_BONUS_SLOTS
// (must match the same env var on the Worker), so granting Premium here
// is also the trigger that lets waitlisted people in.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';


const USER_CAP = Number(process.env.USER_CAP) > 0 ? Number(process.env.USER_CAP) : 200;
const PREMIUM_CAP_BONUS_SLOTS = Number(process.env.PREMIUM_CAP_BONUS_SLOTS) > 0 ? Number(process.env.PREMIUM_CAP_BONUS_SLOTS) : 5;

export async function POST(request) {
  const { adminSecret, lineUserId, days, quotaBytes } = await request.json();

  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!lineUserId) {
    return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
  }

  const extendDays = Number(days) > 0 ? Number(days) : 365;
  const newQuota = Number(quotaBytes) > 0 ? Number(quotaBytes) : 5368709120; // 5GB default

  const supabase = supabaseAdmin();

  // Extend from the LATER of (now, current premium_until) so renewing
  // before expiry stacks days on top instead of losing remaining time.
  const { data: existing } = await supabase
    .from('users')
    .select('premium_until, is_premium')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  const wasAlreadyPremium = !!existing?.is_premium && (!existing.premium_until || new Date(existing.premium_until) > new Date());

  const base = existing?.premium_until && new Date(existing.premium_until) > new Date()
    ? new Date(existing.premium_until)
    : new Date();
  const premiumUntil = new Date(base.getTime() + extendDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from('users')
    .upsert(
      { line_user_id: lineUserId, is_premium: true, premium_until: premiumUntil, storage_quota_bytes: newQuota, updated_at: new Date().toISOString() },
      { onConflict: 'line_user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('admin set-premium failed:', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Only a BRAND NEW Premium grant expands the cap — renewing someone
  // who was already active doesn't add new capacity, since the bonus
  // slots for their subscription are already counted.
  let promoted = [];
  if (!wasAlreadyPremium) {
    promoted = await promoteWaitlist(supabase).catch(e => { console.error('promoteWaitlist failed:', e); return []; });
  }

  return NextResponse.json({ user: data, promotedFromWaitlist: promoted.length });
}

// Recomputes the effective cap (base + bonus × active Premium count) and
// lets in waitlisted users, oldest-first, up to whatever room just
// opened up — registering them in `users` and pushing a LINE
// notification so they don't have to keep checking back manually.
async function promoteWaitlist(supabase) {
  const now = new Date().toISOString();

  const { data: premiumRows } = await supabase
    .from('users').select('line_user_id').eq('is_premium', true).or(`premium_until.is.null,premium_until.gt.${now}`);
  const effectiveCap = USER_CAP + (premiumRows?.length || 0) * PREMIUM_CAP_BONUS_SLOTS;

  const { count: totalUsers } = await supabase.from('users').select('line_user_id', { count: 'exact', head: true });
  const room = effectiveCap - (totalUsers || 0);
  if (room <= 0) return [];

  const { data: waiting } = await supabase
    .from('waitlist').select('user_id').eq('notified', false).order('created_at', { ascending: true }).limit(room);
  if (!waiting?.length) return [];

  const promoted = [];
  for (const w of waiting) {
    const { error: insertErr } = await supabase.from('users').upsert({ line_user_id: w.user_id }, { onConflict: 'line_user_id' });
    if (insertErr) { console.error('waitlist promote insert failed:', w.user_id, insertErr); continue; }
    await supabase.from('waitlist').update({ notified: true }).eq('user_id', w.user_id);
    promoted.push(w.user_id);
    await pushLineMessage(w.user_id, '🎉 มีที่ว่างเพิ่มแล้วครับ! ตอนนี้คุณใช้งาน Jarvis ได้เต็มรูปแบบแล้ว ลองพิมพ์ "เมนู" ดูได้เลยครับ');
  }
  return promoted;
}

async function pushLineMessage(to, text) {
  const token = process.env.LINE_ACCESS_TOKEN;
  if (!token) { console.error('LINE_ACCESS_TOKEN not configured — cannot notify waitlisted user', to); return; }
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
  } catch (e) {
    console.error('pushLineMessage failed for', to, e);
  }
}
