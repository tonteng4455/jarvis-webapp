// app/api/expenses/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';


export async function GET() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('expenses')
    .select('id, type, amount, category, memo, created_at')
    .eq('user_id', session.lineUserId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  let net = 0;
  for (const e of data) net += (e.type === 'income' ? 1 : -1) * parseFloat(e.amount);

  return NextResponse.json({ expenses: data, net });
}
