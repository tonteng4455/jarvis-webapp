// app/share/route.js — the Android "share to Jarvis" target (manifest share_target).
// POST (urlencoded) is what the manifest uses: a GET share would put the whole text in the address, and a long
// LINE announcement in Thai (9 bytes per character once percent-encoded) blows past the ~16 KB URL limit.
// GET is still answered (short texts, hand-made links). Public on purpose: this only parks the text on THIS
// device (localStorage) and moves on to /dashboard/share, which needs a login — so a person who is not logged
// in is sent to the login page first and finds the text waiting afterwards. Nothing is saved to the account here.

import { cleanShare } from '../../lib/sharePending';

const MAX_BODY = 2 * 1024 * 1024;

function page(share) {
  // the text goes into a script block: escape what could end it or break the line
  const json = JSON.stringify(share || null).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Jarvis</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem;color:#555">กำลังเปิดข้อความที่แชร์…
<noscript><p>ต้องเปิด JavaScript ครับ</p></noscript>
<script>
(function () {
  var s = ${json};
  try { if (s) { s.at = Date.now(); localStorage.setItem('jarvis-share', JSON.stringify(s)); } } catch (e) {}
  location.replace('/dashboard/share');
})();
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  return page(cleanShare({ title: q.get('title'), text: q.get('text'), url: q.get('url') }));
}

export async function POST(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return new Response('too large', { status: 413 });
  let form;
  try { form = await request.formData(); } catch { return page(null); }
  const get = k => { const v = form.get(k); return typeof v === 'string' ? v : ''; };   // shared FILES are not handled (yet)
  return page(cleanShare({ title: get('title'), text: get('text'), url: get('url') }));
}
