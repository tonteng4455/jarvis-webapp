// app/api/expenses/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../lib/premium';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';


export async function GET(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ?from=ISO — only entries since then (Today's "วันนี้" card needs just today's).
  const from = new URL(request.url).searchParams.get('from');
  const fromOk = from && !Number.isNaN(Date.parse(from));

  const supabase = supabaseAdmin();
  let q = supabase
    .from('expenses')
    .select('id, type, amount, category, memo, created_at')
    .eq('user_id', session.lineUserId);
  if (fromOk) q = q.gte('created_at', new Date(Date.parse(from)).toISOString());
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  let net = 0;
  for (const e of data) net += (e.type === 'income' ? 1 : -1) * parseFloat(e.amount);

  return NextResponse.json({ expenses: data, net });
}

// POST — add an income/expense entry from the web.
export async function POST(request) {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const type = body.type === 'income' ? 'income' : 'expense';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: session.lineUserId,
      type,
      amount,
      category: String(body.category || 'general').slice(0, 60),
      memo: body.memo ? String(body.memo).slice(0, 300) : null,
    })
    .select('id, type, amount, category, memo, created_at')
    .single();

  if (error) {
    console.error('expense insert failed:', error);
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}
