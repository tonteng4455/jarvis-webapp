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

test('Friday’s config is not deployable until its placeholders are filled; Jarvis’s is complete', () => {
  assert.ok(leftovers(friday).length >= 5);
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
