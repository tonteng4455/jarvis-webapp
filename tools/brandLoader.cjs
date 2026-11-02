// tools/brandLoader.cjs — runs the app under another name. At BUILD time every "Jarvis" in the app's own source (app/ and lib/: screens,
// guide text, manifest, page titles) is replaced by the name in NEXT_PUBLIC_BRAND_NAME (e.g. "Friday"). With no such variable (or "Jarvis")
// nothing changes at all. Lower-case "jarvis" (file names, storage keys, addresses) is never touched. See next.config.js.
// The LINE bot has the same switch: BOT_NAME on its Worker.
const DEFAULT = 'Jarvis';

// the name is pasted into JS / JSX source, so only letters, digits, spaces and . _ - are kept (no quotes, brackets, backslashes …)
function safeName(v) {
  const s = String(v == null ? '' : v).normalize('NFC').replace(/[^\p{L}\p{N}\p{M} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return s || DEFAULT;
}
const applyBrand = (src, name) => (name === DEFAULT ? src : String(src).split(DEFAULT).join(name));

function brandLoader(source) {
  const opts = typeof this.getOptions === 'function' ? this.getOptions() : {};
  return applyBrand(source, safeName(opts.name));
}
brandLoader.safeName = safeName;
brandLoader.applyBrand = applyBrand;
brandLoader.DEFAULT = DEFAULT;
module.exports = brandLoader;
