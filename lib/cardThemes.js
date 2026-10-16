// lib/cardThemes.js — colours of the LINE bot's cards. Keep in sync with CARD_THEMES in jarvis-line-bot.js.
// The choice is stored in users.card_theme: a preset key, or a custom '#RRGGBB'; null = default.

export const CARD_THEMES = [
  { key: 'teal', label: 'เขียวมิ้นต์ (เดิม)', primary: '#1DB4A6', secondary: '#4A90E2' },
  { key: 'ocean', label: 'น้ำเงิน', primary: '#2563EB', secondary: '#0EA5E9' },
  { key: 'sunset', label: 'ส้ม', primary: '#EA580C', secondary: '#DC2626' },
  { key: 'rose', label: 'ชมพู', primary: '#DB2777', secondary: '#9333EA' },
  { key: 'violet', label: 'ม่วง', primary: '#7C3AED', secondary: '#4F46E5' },
  { key: 'forest', label: 'เขียวเข้ม', primary: '#15803D', secondary: '#0F766E' },
  { key: 'slate', label: 'เทาเข้ม', primary: '#374151', secondary: '#6B7280' },
];

const hexToRgb = h => { const m = /^#([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

// white header text must stay readable on the colour
export const isReadableCardColor = hex => { const rgb = hexToRgb(hex); return !!rgb && lum(rgb) < 0.45; };

// → the value to store (null = default) or undefined when the input is not acceptable
export function normalizeCardTheme(value) {
  if (value === null || value === '' || value === 'teal') return null;
  if (CARD_THEMES.some(t => t.key === value)) return value;
  if (/^#[0-9a-f]{6}$/i.test(value || '') && isReadableCardColor(value)) return value.toUpperCase();
  return undefined;
}

export function themeColors(value) {
  const t = CARD_THEMES.find(x => x.key === (value || 'teal'));
  if (t) return { primary: t.primary, secondary: t.secondary };
  const rgb = hexToRgb(value);
  if (!rgb) return { primary: CARD_THEMES[0].primary, secondary: CARD_THEMES[0].secondary };
  const dark = '#' + rgb.map(v => Math.round(v * 0.78).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { primary: value.toUpperCase(), secondary: dark };
}
