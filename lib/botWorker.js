// lib/botWorker.js
//
// Calls the bot Worker's /internal/* endpoints via a Cloudflare SERVICE
// BINDING (env.BOT_WORKER) instead of a plain fetch() to its public
// *.workers.dev URL. A raw fetch between two Workers on the same
// Cloudflare account is blocked with Error 1042 ("Worker tried to
// fetch from another Worker on the same domain") — Service Bindings
// are Cloudflare's own recommended fix: the call never touches the
// public network at all, so 1042 can't happen, and it's also faster.
// See wrangler.jsonc's "services" entry (binding: BOT_WORKER).
//
// Falls back to a plain fetch (using WORKER_URL) if the binding isn't
// available for some reason (e.g. local dev without Cloudflare
// context) — same requests, same INTERNAL_API_SECRET, just over the
// public network instead of the binding.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function callBotInternal(path, payload) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return { ok: false, error: 'not_configured (INTERNAL_API_SECRET=MISSING)' };
  }

  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
    body: JSON.stringify(payload),
  };

  try {
    const { env } = getCloudflareContext();
    if (env?.BOT_WORKER) {
      // Service binding fetch — the URL's host is ignored/arbitrary,
      // only the path matters; the binding routes directly to the
      // bot Worker's own fetch handler.
      const res = await env.BOT_WORKER.fetch(`https://internal${path}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, synced: false, error: `worker_returned_${res.status}: ${body.error || 'no detail'}` };
      return body;
    }
  } catch (e) {
    console.error('Service binding call failed, falling back to public fetch:', e);
  }

  // Fallback: plain fetch to the public URL (will hit Error 1042 on
  // Cloudflare unless global_fetch_strictly_public is enabled — kept
  // only as a local-dev safety net, not expected to run in production).
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return { ok: false, synced: false, error: 'not_configured (WORKER_URL=MISSING, and no service binding available)' };
  }
  try {
    const res = await fetch(`${workerUrl}${path}`, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, synced: false, error: `worker_returned_${res.status}: ${body.error || 'no detail'}` };
    return body;
  } catch (e) {
    console.error('callBotInternal fallback fetch failed:', e);
    return { ok: false, synced: false, error: e.message };
  }
}
