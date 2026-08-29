// lib/scopedToken.js
//
// Verifies the short-lived, single-item edit tokens the bot generates
// for FREE users (see signScopedEditToken in jarvis-line-bot.js) —
// same HMAC-SHA256 scheme, same shared secret (INTERNAL_API_SECRET,
// already configured on both sides). Deliberately NOT a cookie/session
// — this is the whole point of the scoped-editor flow: access to
// exactly one item, for 15 minutes, no dashboard login involved at all.

export async function verifyScopedToken(token) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const b64urlToBytes = (s) => {
      const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
      const bin = atob(padded);
      return Uint8Array.from(bin, c => c.charCodeAt(0));
    };

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sigB64), enc.encode(payloadB64));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (!payload.exp || payload.exp < Date.now()) return null; // expired (15 min window)
    if (!payload.sub || !payload.id || !['note', 'calendar'].includes(payload.t)) return null;
    return payload; // { sub: userId, t: itemType, id: itemId, exp }
  } catch (e) {
    console.error('verifyScopedToken error:', e);
    return null;
  }
}
