// app/api/card-theme/route.js — the colour of this user's LINE bot cards (users.card_theme)
//
// GET → { theme }   PUT { theme } → { theme }   theme = preset key | '#RRGGBB' | null (default)

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '../../../lib/session';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { normalizeCardTheme } from '../../../lib/cardThemes';

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await supabaseAdmin().from('users').select('card_theme').eq('line_user_id', session.lineUserId).maybeSingle();
  return NextResponse.json({ theme: data?.card_theme ?? null });
}

export async function PUT(request) {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const theme = normalizeCardTheme(body.theme);
  if (theme === undefined) return NextResponse.json({ error: 'bad_theme' }, { status: 400 });
  const { error } = await supabaseAdmin().from('users').update({ card_theme: theme }).eq('line_user_id', session.lineUserId);
  // the column comes from card_theme.sql
  if (error) return NextResponse.json({ error: 'card_theme_unsupported' }, { status: 500 });
  return NextResponse.json({ theme });
}
