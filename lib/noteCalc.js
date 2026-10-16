// lib/noteCalc.js — little calculator for note text. Pure; no eval().
//
//   "5*10="   typed → "5*10=50"          (answer appended right after the "=")
//   "=5*10"   + Enter → "50"             (the whole "=expression" is replaced by the answer)
//
// Understands + - * / (also x × ÷ −), ^ (power), ( ), decimals, thousands commas ("1,250.5"),
// Thai digits, and % : "7%" is 0.07, and "100+10%" is 110 (a percent after + or − is a share of the left side).
// Anything it is not sure about returns null and the text is left alone.

const THAI = '๐๑๒๓๔๕๖๗๘๙';
const norm = s => s.replace(/[๐-๙]/g, c => String(THAI.indexOf(c))).replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
export const MATH_CHARS = /[0-9๐-๙.,+\-−–*/xX×÷^()%\s]/;

function tokenize(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) return null;
      toks.push({ t: 'n', v: parseFloat(m[0].replace(/,/g, '')) }); i += m[0].length;
      if (src[i] === ',' || src[i] === '.') return null;      // "1,23" / "1.2.3"
      continue;
    }
    if ('+-*/^()%'.includes(c)) { toks.push({ t: c }); i++; continue; }
    return null;
  }
  return toks;
}

// Evaluate an expression string → number, or null when it is not a clean arithmetic expression.
export function evalMath(text) {
  const toks = tokenize(norm(String(text || '')));
  if (!toks || !toks.length) return null;
  let p = 0, ok = true, ops = 0;
  const peek = () => toks[p]?.t;
  // a value + whether it was written with a trailing % (for "100+10%")
  function primary() {
    const tk = toks[p];
    if (!tk) { ok = false; return { v: NaN }; }
    if (tk.t === 'n') { p++; return { v: tk.v }; }
    if (tk.t === '(') { p++; const e = add(); if (peek() !== ')') ok = false; else p++; return { v: e.v }; }
    ok = false; return { v: NaN };
  }
  function postfix() {
    let r = primary();
    while (peek() === '%') { p++; r = { v: r.v / 100, pct: true }; }
    return r;
  }
  function unary() {
    if (peek() === '-') { p++; ops++; const r = unary(); return { v: -r.v, pct: r.pct }; }
    if (peek() === '+') { p++; return unary(); }
    return postfix();
  }
  function power() {
    const base = unary();
    if (peek() === '^') { p++; ops++; const e = power(); return { v: Math.pow(base.v, e.v) }; }   // right-associative
    return base;
  }
  function mul() {
    let l = power();
    while (peek() === '*' || peek() === '/') {
      const op = toks[p++].t; ops++;
      const r = power();
      l = { v: op === '*' ? l.v * r.v : (r.v === 0 ? (ok = false, NaN) : l.v / r.v) };
    }
    return l;
  }
  function add() {
    let l = mul();
    while (peek() === '+' || peek() === '-') {
      const op = toks[p++].t; ops++;
      const r = mul();
      const rv = r.pct ? l.v * r.v : r.v;                      // 100 + 10% → 110
      l = { v: op === '+' ? l.v + rv : l.v - rv };
    }
    return l;
  }
  const res = add();
  if (!ok || p !== toks.length || !Number.isFinite(res.v) || ops === 0) return null;
  return res.v;
}

export function formatResult(n) {
  if (!Number.isFinite(n)) return null;
  const r = Number(n.toPrecision(12));
  if (Math.abs(r) >= 1e21 || (r !== 0 && Math.abs(r) < 1e-9)) return null;
  return String(r);
}

// Longest valid expression that ends exactly at the end of `s` (and starts after a non-math character).
function trailingExpression(s) {
  let a = s.length;
  while (a > 0 && MATH_CHARS.test(s[a - 1])) a--;
  for (let i = a; i < s.length; i++) {
    if (!/[0-9๐-๙(.\-−–]/.test(s[i])) continue;
    if (i > 0 && /[0-9๐-๙]/.test(s[i - 1])) continue;          // never start inside a number / word
    const expr = s.slice(i);
    const v = evalMath(expr);
    if (v !== null) return { start: i, expr, value: v };
  }
  return null;
}

// "…5*10=" just typed at the end of `beforeCaret` → { start, insert } : put `insert` ("50") right after the "="
export function answerAfterEquals(beforeCaret) {
  if (!beforeCaret.endsWith('=')) return null;
  const hit = trailingExpression(beforeCaret.slice(0, -1).replace(/\s+$/, ''));
  if (!hit) return null;
  const out = formatResult(hit.value);
  return out === null ? null : { insert: out };
}

// "… =5*10" at the end of the line (caret at the end) → { from, text }: replace text[from..] by the answer
export function answerForEqualsPrefix(line) {
  const m = /(?:^|\s)=(?=\S)([^=]*)$/.exec(line);
  if (!m) return null;
  const expr = m[1].trim();
  if (!expr) return null;
  const v = evalMath(expr);
  const out = v === null ? null : formatResult(v);
  if (out === null) return null;
  const from = line.length - m[1].length - 1;                    // index of the "="
  return { from, text: out };
}

// At Enter: finish the line if it carries a calculation → the new line text, or null
export function completeLineOnEnter(line) {
  const pre = answerForEqualsPrefix(line);
  if (pre) return line.slice(0, pre.from) + pre.text;
  if (line.endsWith('=')) { const a = answerAfterEquals(line); if (a) return line + a.insert; }
  return null;
}
