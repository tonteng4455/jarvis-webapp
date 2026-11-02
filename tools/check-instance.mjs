#!/usr/bin/env node
// usage: node tools/check-instance.mjs <wrangler config> — refuses to continue while the config still has a REPLACE… placeholder
// (so an instance cannot be deployed half set up), and prints a short summary of what is about to be deployed.
import { readFileSync } from 'node:fs';

export function stripJsonc(text) {
  let out = '', i = 0, str = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (str) { out += c; if (c === '\\') { out += n; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
export const parseConfig = text => JSON.parse(stripJsonc(text));
export function leftovers(cfg) {
  const found = [];
  (function walk(v, path) {
    if (typeof v === 'string') { if (/REPLACE/i.test(v)) found.push(`${path} = ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  })(cfg, '');
  return found;
}

if (process.argv[1] && process.argv[1].endsWith('check-instance.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/check-instance.mjs <wrangler config>'); process.exit(2); }
  let cfg; try { cfg = parseConfig(readFileSync(file, 'utf8')); } catch (e) { console.error(`✗ ${file}: cannot read (${e.message})`); process.exit(2); }
  const left = leftovers(cfg);
  if (left.length) { console.error(`✗ ${file} still has ${left.length} placeholder(s) to fill in:\n  - ${left.join('\n  - ')}`); process.exit(1); }
  console.log(`✓ ${file}: worker "${cfg.name}" · bucket "${cfg.r2_buckets?.[0]?.bucket_name}" · name "${cfg.vars?.BOT_NAME || 'Jarvis (default)'}"`);
}
