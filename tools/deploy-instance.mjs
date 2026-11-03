#!/usr/bin/env node
// usage: node tools/deploy-instance.mjs <instance> [--dry]      (npm run deploy:jarvis / deploy:friday)
// One instance of the web app = a Worker config (wrangler.jsonc for "jarvis", wrangler.<instance>.jsonc for the others) and, optionally,
// a brand folder brands/<instance>/ with
//     brand.json   { "name": "Friday", "gender": "female" }        → NEXT_PUBLIC_BRAND_NAME / NEXT_PUBLIC_BRAND_GENDER while building
//     public/*     the logo and app icons of that instance          → laid over public/ for the build, put back afterwards
// Steps: refuse while the config still has a REPLACE… → lay the brand files over public/ → build → wrangler deploy → put public/ back (also on failure / Ctrl+C).
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseConfig, leftovers } from './check-instance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function plan(name, root = ROOT) {
  if (!/^[a-z][a-z0-9-]{0,20}$/.test(name || '')) throw new Error('instance name: lower-case letters, digits and "-"');
  const config = name === 'jarvis' ? 'wrangler.jsonc' : `wrangler.${name}.jsonc`;
  if (!existsSync(join(root, config))) throw new Error(`${config} not found`);
  const brandDir = join(root, 'brands', name);
  const brand = existsSync(join(brandDir, 'brand.json')) ? JSON.parse(readFileSync(join(brandDir, 'brand.json'), 'utf8')) : {};
  const assetsDir = join(brandDir, 'public');
  const assets = existsSync(assetsDir) ? readdirSync(assetsDir).filter(f => !f.startsWith('.')) : [];
  const env = {};
  if (brand.name) env.NEXT_PUBLIC_BRAND_NAME = String(brand.name);
  if (brand.gender) env.NEXT_PUBLIC_BRAND_GENDER = String(brand.gender);
  return { name, config, env, assetsDir, assets };
}

// lay the brand files over public/; returns a function that puts every original back (and removes the files that did not exist before)
export function applyAssets(p, root = ROOT) {
  if (!p.assets.length) return () => {};
  const pub = join(root, 'public'), keep = mkdtempSync(join(tmpdir(), 'public-'));
  const added = [];
  for (const f of p.assets) {
    if (existsSync(join(pub, f))) copyFileSync(join(pub, f), join(keep, f)); else added.push(f);
    copyFileSync(join(p.assetsDir, f), join(pub, f));
  }
  let done = false;
  return () => {
    if (done) return; done = true;
    for (const f of p.assets) { if (added.includes(f)) rmSync(join(pub, f), { force: true }); else copyFileSync(join(keep, f), join(pub, f)); }
    rmSync(keep, { recursive: true, force: true });
  };
}

const run = (cmd, args, env) => { const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`); };

if (process.argv[1] && process.argv[1].endsWith('deploy-instance.mjs')) {
  const name = process.argv[2], dry = process.argv.includes('--dry');
  let restore = () => {};
  try {
    const p = plan(name);
    console.log(`instance "${p.name}" · config ${p.config} · build env ${JSON.stringify(p.env)} · ${p.assets.length} brand file(s) over public/`);
    const left = leftovers(parseConfig(readFileSync(join(ROOT, p.config), 'utf8')));
    if (left.length) { console.error(`✗ ${p.config} still has ${left.length} placeholder(s) to fill in:\n  - ${left.join('\n  - ')}`); process.exit(1); }
    if (dry) { console.log('(dry run: nothing built or deployed)'); process.exit(0); }
    restore = applyAssets(p);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });
    run('npx', ['opennextjs-cloudflare', 'build'], p.env);
    run('npx', ['wrangler', 'deploy', ...(p.config === 'wrangler.jsonc' ? [] : ['--config', p.config])], p.env);
    console.log(`✓ deployed "${p.name}"`);
  } catch (e) { console.error('✗ ' + e.message); restore(); process.exit(1); }
  restore();
}
