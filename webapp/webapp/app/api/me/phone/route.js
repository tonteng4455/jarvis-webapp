// app/api/me/phone/route.js
//
// One-time phone capture, per the "don't make Premium applicants type
// it in every time" decision — LINE doesn't expose phone numbers via
// the normal Login API (would need a separate LINE Profile+ corporate
// contract), so this is the practical alternative: ask once here, the
// admin console then has it on hand for every future Premium request.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../../lib/session';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'edge';

export async function POST(request) {
  const session = await getSession(cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { phoneNumber } = await request.json();
  const cleaned = (phoneNumber || '').replace(/[^0-9+]/g, '').slice(0, 20);
  if (!cleaned) return NextResponse.json({ error: 'invalid phone number' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from('users')
    .update({ phone_number: cleaned, updated_at: new Date().toISOString() })
    .eq('line_user_id', session.lineUserId);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ phoneNumber: cleaned });
}
