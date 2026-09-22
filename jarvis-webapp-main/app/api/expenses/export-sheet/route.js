// app/api/expenses/export-sheet/route.js
//
// POST — exports ALL of this user's expenses into a Google Sheet
// (created once, reused/updated on every subsequent export — see the
// bot's exportExpensesToSheet). Requires Google connected; returns
// { error: 'not_connected' } if not, so the page can prompt to connect
// rather than showing a generic failure.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPremiumSession } from '../../../../lib/premium';
import { callBotInternal } from '../../../../lib/botWorker';

export async function POST() {
  const { session } = await getPremiumSession(await cookies());
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const result = await callBotInternal('/internal/expense-sheet-export', { userId: session.lineUserId });
  if (!result?.url) {
    return NextResponse.json({ error: result?.error || 'failed', connectUrl: result?.connectUrl }, { status: 502 });
  }
  return NextResponse.json(result);
}
