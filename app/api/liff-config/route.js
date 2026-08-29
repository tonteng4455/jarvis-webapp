// app/api/liff-config/route.js
//
// Serves the LIFF ID to the client at RUNTIME instead of relying on
// NEXT_PUBLIC_LIFF_ID being inlined at BUILD time. Build-time env var
// inlining on Cloudflare requires a SEPARATE "Build variables" config
// section from the regular runtime vars — easy to miss/misconfigure,
// and proved unreliable in practice. A plain (non-NEXT_PUBLIC_) runtime
// var read here server-side works exactly like WORKER_URL/
// INTERNAL_API_SECRET already do — no special build step needed.
//
// Reads NEXT_PUBLIC_LIFF_ID (already set in wrangler.jsonc) OR a plain
// LIFF_ID if you'd rather add a second, non-prefixed var — either name
// works, whichever is actually present.

import { NextResponse } from 'next/server';

export async function GET() {
  const liffId = process.env.LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || null;
  return NextResponse.json({ liffId });
}
