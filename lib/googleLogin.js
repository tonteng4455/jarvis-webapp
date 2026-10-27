// lib/googleLogin.js — "Sign in with Google" (OpenID Connect, code flow). Server only. Needs, in Cloudflare:
//   GOOGLE_LOGIN_CLIENT_ID, GOOGLE_LOGIN_CLIENT_SECRET   (a "Web application" OAuth client; scopes: openid email profile)
//   GOOGLE_LOGIN_REDIRECT_URI  (optional; default  <this site>/api/auth/google/callback  — must be listed in the client's redirect URIs)

export const googleConfigured = () => !!(process.env.GOOGLE_LOGIN_CLIENT_ID && process.env.GOOGLE_LOGIN_CLIENT_SECRET);
export const googleRedirectUri = request => process.env.GOOGLE_LOGIN_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString();
export const mockGoogle = () => process.env.MOCK_MODE === '1' && process.env.NODE_ENV !== 'production';

export function googleAuthorizeUrl(request, state, nonce) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', process.env.GOOGLE_LOGIN_CLIENT_ID);
  u.searchParams.set('redirect_uri', googleRedirectUri(request));
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

// code → who signed in: { sub, name, picture, email } or null
export async function googleIdentityFromCode(request, code, nonce) {
  if (mockGoogle() && String(code).startsWith('mock:')) {                         // local tests only: code = mock:<id>:<name>
    const [, sub, name] = String(code).split(':');
    return { sub: sub || 'mock', name: name || 'Mock Google', picture: null, email: `${sub || 'mock'}@example.test` };
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env.GOOGLE_LOGIN_CLIENT_ID, client_secret: process.env.GOOGLE_LOGIN_CLIENT_SECRET, redirect_uri: googleRedirectUri(request) }),
  });
  if (!tokenRes.ok) { console.error('Google token exchange failed:', await tokenRes.text()); return null; }
  const { id_token: idToken } = await tokenRes.json();
  if (!idToken) return null;
  // Google checks the signature and expiry for us; we check who it was issued to
  const verifyRes = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!verifyRes.ok) { console.error('Google id_token verify failed:', await verifyRes.text()); return null; }
  const v = await verifyRes.json();
  if (v.aud !== process.env.GOOGLE_LOGIN_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(v.iss) || !v.sub) return null;
  if (nonce && v.nonce && v.nonce !== nonce) return null;
  return { sub: String(v.sub), name: v.name || null, picture: v.picture || null, email: v.email || null };
}
