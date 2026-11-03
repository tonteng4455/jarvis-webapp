import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parseConfig, leftovers } from '../tools/check-instance.mjs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const jarvis = parseConfig(read('wrangler.jsonc')), friday = parseConfig(read('wrangler.friday.jsonc'));

test('both instances run the same build output next to their own bot Worker', () => {
  assert.equal(jarvis.main, friday.main);
  assert.notEqual(jarvis.name, friday.name);
  assert.equal(jarvis.services[0].binding, 'BOT_WORKER');
  assert.equal(friday.services[0].binding, 'BOT_WORKER');
  assert.notEqual(jarvis.services[0].service, friday.services[0].service);
  assert.equal(friday.services[0].service, 'friday-line-bot');          // the name in the bot repo's wrangler.friday.jsonc
  assert.equal(jarvis.keep_vars && friday.keep_vars, true);
});

test('the placeholder guard: a REPLACE… left in a config is found; Jarvis’s config is complete', () => {
  const half = JSON.parse(JSON.stringify(friday)); half.vars.SUPABASE_URL = 'https://REPLACE-me.supabase.co';
  assert.ok(leftovers(half).length >= 1);
  assert.equal(leftovers(jarvis).length, 0);
});

test('no secret is written into a config file, and the variables are ones the app reads', () => {
  const secrets = ['SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET', 'INTERNAL_API_SECRET', 'ADMIN_SECRET', 'LINE_LOGIN_CHANNEL_SECRET', 'GOOGLE_LOGIN_CLIENT_SECRET', 'LINE_ACCESS_TOKEN'];
  for (const k of secrets) { assert.ok(!(k in friday.vars)); assert.ok(!(k in jarvis.vars)); }
  const src = ['app', 'lib'].flatMap(d => readdirRecursive(d)).map(f => readFileSync(f, 'utf8')).join('\n');
  for (const k of Object.keys(friday.vars)) assert.ok(src.includes(k), `${k} is not read anywhere`);
});

function readdirRecursive(dir) {
  const out = [];
  for (const n of readdirSync(new URL('../' + dir, import.meta.url))) {
    const rel = `${dir}/${n}`;
    if (statSync(new URL('../' + rel, import.meta.url)).isDirectory()) out.push(...readdirRecursive(rel));
    else if (/\.(js|jsx|mjs)$/.test(n)) out.push(new URL('../' + rel, import.meta.url));
  }
  return out;
}

import { plan, applyAssets } from '../tools/deploy-instance.mjs';
import { mkdtempSync, mkdirSync, writeFileSync as wf, readFileSync as rf2, existsSync as ex } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as j } from 'node:path';

test('deploy plan: Jarvis builds as it always did; Friday gets its name, voice and picture', () => {
  const pj = plan('jarvis'), pf = plan('friday');
  assert.equal(pj.config, 'wrangler.jsonc'); assert.deepEqual(pj.env, {}); assert.equal(pj.assets.length, 0);
  assert.equal(pf.config, 'wrangler.friday.jsonc');
  assert.deepEqual(pf.env, { NEXT_PUBLIC_BRAND_NAME: 'Friday', NEXT_PUBLIC_BRAND_GENDER: 'female' });
  for (const f of ['logo-head.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-48.png', 'favicon.ico']) assert.ok(pf.assets.includes(f), f);
  assert.throws(() => plan('../x'));
  assert.throws(() => plan('nope'));
});

test('brand files are laid over public/ for the build and put back afterwards', () => {
  const root = mkdtempSync(j(tmpdir(), 'inst-')); mkdirSync(j(root, 'public')); mkdirSync(j(root, 'brands/x/public'), { recursive: true });
  wf(j(root, 'public/logo.png'), 'JARVIS'); wf(j(root, 'brands/x/public/logo.png'), 'X'); wf(j(root, 'brands/x/public/new.png'), 'NEW');
  const p = { assets: ['logo.png', 'new.png'], assetsDir: j(root, 'brands/x/public') };
  const restore = applyAssets(p, root);
  assert.equal(rf2(j(root, 'public/logo.png'), 'utf8'), 'X'); assert.equal(rf2(j(root, 'public/new.png'), 'utf8'), 'NEW');
  restore(); restore();                                                    // twice is fine
  assert.equal(rf2(j(root, 'public/logo.png'), 'utf8'), 'JARVIS'); assert.equal(ex(j(root, 'public/new.png')), false);
});
