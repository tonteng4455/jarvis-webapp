// lib/noteBlocks.js — the note body as BLOCKS, Google-Keep style.
//
// A note's `content` stays plain text in the database (the LINE bot and
// the list preview read it as is), written with these markers:
//
//     - item            bullet
//     [ ] item          checkbox   ([x] = ticked)
//     1. item           numbered   (numbers are renumbered automatically)
//       - sub item      two spaces per indent level (up to 4 levels)
//     anything else     ordinary text (many lines can share one text block,
//                       so selecting/copying across them works natively)
//
// Everything here is pure (no React / DOM): the editor calls these and gets
// back `{ blocks, focus? }` — `focus` = where the caret should land.

export const MAX_INDENT = 4;

let seq = 0;
export const newId = () => `b${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const mk = (type, text = '', extra = {}) => ({ id: newId(), type, text, indent: 0, checked: false, ...extra });

// ---------- text → blocks ----------
const TASK_RE = /^[-*•][ \t]+\[( |x|X)\][ \t]?(.*)$/;      // "- [ ] foo" (GitHub style)
const CHECK_RE = /^\[( |x|X)?\][ \t]?(.*)$/;                // "[] foo", "[ ] foo", "[x] foo"
const BULLET_RE = /^[-*•][ \t]+(.*)$/;                      // needs the space, so "-5 องศา" / "---" stay text
const NUM_RE = /^(\d{1,3})[.)][ \t]+(.*)$/;

// A list line → a block, or null for ordinary text.
export function parseListLine(line) {
  const lead = /^[ \t]*/.exec(line)[0];
  const rest = line.slice(lead.length);
  const indent = Math.min(MAX_INDENT, Math.floor(lead.replace(/\t/g, '  ').length / 2));
  let m;
  if ((m = TASK_RE.exec(rest)) || (m = CHECK_RE.exec(rest))) return mk('check', m[2], { indent, checked: /x/i.test(m[1] || '') });
  if ((m = BULLET_RE.exec(rest))) return mk('bullet', m[1], { indent });
  if ((m = NUM_RE.exec(rest))) return mk('num', m[2], { indent });
  return null;
}

export function parseContent(content) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  for (const line of lines) {
    const item = parseListLine(line);
    if (item) { blocks.push(item); continue; }
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'text') last.text += '\n' + line;
    else blocks.push(mk('text', line));
  }
  return blocks.length ? blocks : [mk('text', '')];
}

// ---------- blocks → text ----------
// Number shown for each numbered block (0 for everything else). A numbered
// run restarts after plain text, and each indent level counts on its own.
export function numbering(blocks) {
  const out = []; const c = [];
  for (const b of blocks) {
    if (b.type === 'text') { c.length = 0; out.push(0); continue; }
    c.length = Math.min(c.length, b.indent + 1);
    if (b.type === 'num') { c[b.indent] = (c[b.indent] || 0) + 1; out.push(c[b.indent]); }
    else { c[b.indent] = 0; out.push(0); }
  }
  return out;
}

export function serializeBlocks(blocks) {
  const nums = numbering(blocks);
  const lines = blocks.map((b, i) => {
    if (b.type === 'text') return b.text;
    const mark = b.type === 'bullet' ? '- ' : b.type === 'check' ? (b.checked ? '[x] ' : '[ ] ') : `${nums[i]}. `;
    return '  '.repeat(b.indent) + mark + b.text;
  });
  return lines.join('\n').replace(/\n+$/, '');
}

// ---------- helpers ----------
const indexOf = (blocks, id) => blocks.findIndex(b => b.id === id);
const replaceAt = (blocks, i, ...items) => [...blocks.slice(0, i), ...items, ...blocks.slice(i + 1)];

// Merge neighbouring text blocks (one text block = one run of plain lines),
// keeping the caret target valid.
function normalize(blocks, focus) {
  const out = []; let f = focus || null;
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === 'text' && last && last.type === 'text') {
      if (f && f.id === b.id) f = { id: last.id, pos: last.text.length + 1 + f.pos };
      last.text += '\n' + b.text;
    } else out.push({ ...b });
  }
  if (!out.length) out.push(mk('text', ''));
  return { blocks: out, focus: f };
}

// "- " / "[] " / "[x] " / "1. " typed at the very start of a line (caret right after the space)
const TYPED_RE = /^([-*•]|\[[ xX]?\]|\d{1,3}[.)])[ \t]$/;
function shortcutTyped(typed) {
  const m = TYPED_RE.exec(typed);
  if (!m) return null;
  const t = m[1];
  if (/^[-*•]$/.test(t)) return { type: 'bullet', checked: false };
  if (t.startsWith('[')) return { type: 'check', checked: /x/i.test(t) };
  return { type: 'num', checked: false };
}
// "-ข้อความ" / "[]ข้อความ" at the start of a line when Enter is pressed (no space typed)
const ENTER_SHORTCUT_RE = /^(?:([-*•])(?=[A-Za-z฀-๿])|(\[[ xX]?\])(?=\S))/;

// ---------- operations ----------

// The text of block `id` changed (typing / IME / paste of one line).
export function setText(blocks, id, value, caret) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];
  if (b.type !== 'text') return { blocks: replaceAt(blocks, i, { ...b, text: value.replace(/\n/g, ' ') }) };

  const before = value.slice(0, caret);
  const lineStart = before.lastIndexOf('\n') + 1;
  const sc = shortcutTyped(before.slice(lineStart));
  if (!sc) return { blocks: replaceAt(blocks, i, { ...b, text: value }) };

  // The person just typed "- " (or "[] ", "1. ") at the start of a line: that line becomes a list row.
  const lineEnd = value.indexOf('\n', caret);
  const row = mk(sc.type, value.slice(caret, lineEnd === -1 ? value.length : lineEnd), { checked: sc.checked });
  const parts = [];
  if (lineStart > 0) parts.push({ ...b, text: value.slice(0, lineStart - 1) });
  parts.push(row);
  if (lineEnd !== -1) parts.push(mk('text', value.slice(lineEnd + 1)));
  return normalize(replaceAt(blocks, i, ...parts), { id: row.id, pos: 0 });
}

// Enter inside a text block. Only the "-foo" / "[]foo" (no space) shortcut is special;
// anything else returns null = let the browser insert the newline.
export function enterInText(blocks, id, value, caret) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];
  if (b.type !== 'text') return null;
  const lineStart = value.slice(0, caret).lastIndexOf('\n') + 1;
  const lineEndIdx = value.indexOf('\n', caret);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  if (caret !== lineEnd) return null;
  const line = value.slice(lineStart, lineEnd);
  const m = ENTER_SHORTCUT_RE.exec(line);
  if (!m) return null;
  const type = m[1] ? 'bullet' : 'check';
  const first = mk(type, line.slice(m[0].length), { checked: !!m[2] && /x/i.test(m[2]) });
  const next = mk(type, '');
  const parts = [];
  if (lineStart > 0) parts.push({ ...b, text: value.slice(0, lineStart - 1) });
  parts.push(first, next);
  if (lineEndIdx !== -1) parts.push(mk('text', value.slice(lineEndIdx + 1)));
  return normalize(replaceAt(blocks, i, ...parts), { id: next.id, pos: 0 });
}

// Enter inside a list row: new row of the same kind; on an empty row, step out of the list.
export function enterInList(blocks, id, caret) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];
  if (b.type === 'text') return null;
  if (b.text === '') {
    if (b.indent > 0) return { blocks: replaceAt(blocks, i, { ...b, indent: b.indent - 1 }), focus: { id, pos: 0 } };
    return normalize(replaceAt(blocks, i, { ...b, type: 'text', checked: false, indent: 0 }), { id, pos: 0 });
  }
  const left = b.text.slice(0, caret), right = b.text.slice(caret);
  const next = mk(b.type, right, { indent: b.indent });
  return { blocks: replaceAt(blocks, i, { ...b, text: left }, next), focus: { id: next.id, pos: 0 } };
}

// Backspace with the caret at the very start of a block (Google-Keep behaviour):
//   · an EMPTY list row is simply removed (caret goes to the end of the row above);
//   · a row with text: indented → one level out; at the left edge it joins the list row above
//     (or, with no list row above, becomes plain text);
//   · the first line of a text block joins the list row above.
export function backspaceAtStart(blocks, id) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];
  const prev = blocks[i - 1];
  if (b.type !== 'text') {
    if (b.text === '') {
      if (!prev) return normalize(replaceAt(blocks, i, { ...b, type: 'text', checked: false, indent: 0 }), { id, pos: 0 });
      return normalize(blocks.filter((_, j) => j !== i), { id: prev.id, pos: prev.text.length });
    }
    if (b.indent > 0) return { blocks: replaceAt(blocks, i, { ...b, indent: b.indent - 1 }), focus: { id, pos: 0 } };
    if (prev && prev.type !== 'text') {
      return normalize([...blocks.slice(0, i - 1), { ...prev, text: prev.text + b.text }, ...blocks.slice(i + 1)], { id: prev.id, pos: prev.text.length });
    }
    return normalize(replaceAt(blocks, i, { ...b, type: 'text', checked: false, indent: 0 }), { id, pos: 0 });
  }
  if (i === 0) return null;
  if (prev.type === 'text') return null;                   // can't happen after normalize()
  const nl = b.text.indexOf('\n');
  const first = nl === -1 ? b.text : b.text.slice(0, nl);
  const rest = nl === -1 ? null : b.text.slice(nl + 1);
  const merged = { ...prev, text: prev.text + first };
  const repl = rest === null ? [merged] : [merged, { ...b, text: rest }];
  return normalize([...blocks.slice(0, i - 1), ...repl, ...blocks.slice(i + 1)], { id: prev.id, pos: prev.text.length });
}

// Tapping the empty space under the note: keep typing where the note ends. After a list that means
// one more row of the same kind (like Keep's "+ รายการ"); Enter on an empty row steps out to text.
export function appendRow(blocks) {
  const last = blocks[blocks.length - 1];
  if (!last) return null;
  if (last.type === 'text') return { blocks, focus: { id: last.id, pos: last.text.length } };
  // a checklist ending with ticked rows: the new row belongs above that "done" group
  if (last.type === 'check' || doneLayout(blocks).done[blocks.length - 1]) {
    const { done } = doneLayout(blocks);
    let f = blocks.length;
    while (f > 0 && done[f - 1]) f--;
    if (f < blocks.length) {
      const above = blocks[f - 1];
      if (above && above.type === 'check' && above.indent === 0 && above.text === '') return { blocks, focus: { id: above.id, pos: 0 } };
      const row = mk('check', '');
      return { blocks: [...blocks.slice(0, f), row, ...blocks.slice(f)], focus: { id: row.id, pos: 0 } };
    }
  }
  if (last.text === '') return { blocks, focus: { id: last.id, pos: 0 } };
  const row = mk(last.type, '', { indent: last.indent });
  return { blocks: [...blocks, row], focus: { id: row.id, pos: 0 } };
}

export function indentBlock(blocks, id, delta) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];
  if (b.type === 'text') return null;
  const next = b.indent + delta;
  if (next < 0 || next > MAX_INDENT) return null;
  if (delta > 0) { const prev = blocks[i - 1]; if (!prev || prev.type === 'text' || next > prev.indent + 1) return null; }
  return { blocks: replaceAt(blocks, i, { ...b, indent: next }) };
}

// ---------- subtrees (a row + the deeper rows right under it) ----------
export function subtreeEnd(blocks, i) {
  let j = i + 1;
  while (j < blocks.length && blocks[j].type !== 'text' && blocks[j].indent > blocks[i].indent) j++;
  return j;
}

// Ticking moves the row (with its sub-items) to the end of its checklist, unticking moves it back to
// the end of the unticked rows — like Keep's "รายการที่ทำแล้ว" group. Only neighbouring checkboxes of
// the same level take part; bullets / numbers / text around them never move.
export function toggleCheck(blocks, id) {
  const i = indexOf(blocks, id); if (i < 0 || blocks[i].type !== 'check') return null;
  const ind = blocks[i].indent;
  const nowChecked = !blocks[i].checked;
  // the run of neighbouring checkbox subtrees around i
  let start = i;
  for (;;) {
    let q = start - 1;
    while (q >= 0 && blocks[q].type !== 'text' && blocks[q].indent > ind) q--;
    if (q >= 0 && blocks[q].type === 'check' && blocks[q].indent === ind) start = q; else break;
  }
  const j = subtreeEnd(blocks, i);
  let end = j;
  while (end < blocks.length && blocks[end].type === 'check' && blocks[end].indent === ind) end = subtreeEnd(blocks, end);

  const moved = blocks.slice(i, j).map((b, k) => (k === 0 ? { ...b, checked: nowChecked } : b));
  const run = [...blocks.slice(start, i), ...blocks.slice(j, end)];
  let at = run.length;                                   // ticked → the end of the run
  if (!nowChecked) {                                     // unticked → before the first ticked row
    for (let k = 0; k < run.length;) {
      if (run[k].indent === ind && run[k].type === 'check' && run[k].checked) { at = k; break; }
      k = subtreeEnd(run, k);
    }
  }
  const out = [...blocks.slice(0, start), ...run.slice(0, at), ...moved, ...run.slice(at), ...blocks.slice(end)];
  return { blocks: out };
}

// For drawing the "ทำแล้ว" group: per row, `header` = how many ticked top-level rows the group that STARTS
// here has (0 = no header here) and `done` = the row belongs to that group (ticked row or its sub-items).
export function doneLayout(blocks) {
  const header = new Array(blocks.length).fill(0);
  const done = new Array(blocks.length).fill(false);
  let first = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'text' || b.indent === 0) {
      if (b.type === 'check' && b.indent === 0 && b.checked) {
        if (first < 0) first = i;
        header[first]++; done[i] = true; continue;
      }
      first = -1; continue;
    }
    if (first >= 0) done[i] = true;                      // sub-item of a ticked row
  }
  return { header, done };
}

// Drag & drop: move the row (+ its sub-items) so it sits right before row `beforeIdx` of the current
// list (blocks.length = the very end). The first moved row's indent is clamped so the list stays valid.
export function moveSubtree(blocks, id, beforeIdx) {
  const i = indexOf(blocks, id); if (i < 0 || blocks[i].type === 'text') return null;
  const j = subtreeEnd(blocks, i);
  if (beforeIdx >= i && beforeIdx <= j) return null;     // dropped on itself
  const sub = blocks.slice(i, j);
  const rest = [...blocks.slice(0, i), ...blocks.slice(j)];
  const at = beforeIdx > i ? beforeIdx - (j - i) : beforeIdx;
  const prev = rest[at - 1];
  const maxIndent = prev && prev.type !== 'text' ? prev.indent + 1 : 0;
  const delta = Math.min(sub[0].indent, maxIndent) - sub[0].indent;
  const fixed = delta ? sub.map(b => ({ ...b, indent: Math.max(0, Math.min(MAX_INDENT, b.indent + delta)) })) : sub;
  return { blocks: normalize([...rest.slice(0, at), ...fixed, ...rest.slice(at)]).blocks, focus: { id, pos: sub[0].text.length } };
}

// What the toolbar needs to know about the row the caret is in.
export function rowInfo(blocks, id) {
  const i = indexOf(blocks, id);
  if (i < 0) return { list: false, type: 'text', canIndent: false, canOutdent: false };
  const b = blocks[i];
  if (b.type === 'text') return { list: false, type: 'text', canIndent: false, canOutdent: false };
  const prev = blocks[i - 1];
  return { list: true, type: b.type, canOutdent: b.indent > 0, canIndent: b.indent < MAX_INDENT && !!prev && prev.type !== 'text' && b.indent + 1 <= prev.indent + 1 };
}

// One button that turns the list the caret is in into the next kind:
//   numbered → bullet → checkbox → plain text → numbered → …
// "The list" = the neighbouring rows of the same kind (sub-items of another kind stay as they are).
// On a plain-text line, only that line becomes a numbered row.
export const LIST_CYCLE = ['num', 'bullet', 'check', 'text'];
export function cycleList(blocks, id, caret = 0) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const b = blocks[i];

  if (b.type === 'text') {                                   // text line → numbered row
    const pos = Math.min(Math.max(caret, 0), b.text.length);
    const lineStart = b.text.lastIndexOf('\n', pos - 1) + 1;
    const nl = b.text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? b.text.length : nl;
    const row = mk('num', b.text.slice(lineStart, lineEnd));
    const parts = [];
    if (lineStart > 0) parts.push({ ...b, text: b.text.slice(0, lineStart - 1) });
    parts.push(row);
    if (nl !== -1) parts.push(mk('text', b.text.slice(nl + 1)));
    return normalize(replaceAt(blocks, i, ...parts), { id: row.id, pos: Math.min(pos - lineStart, row.text.length) });
  }

  // the section: from the row's own level, up and down while rows are siblings of the same kind
  // (deeper rows are its children and belong to the section; text or a shallower row ends it)
  const k = b.indent, T = b.type;
  let a = i, z = i;
  while (a > 0) { const q = blocks[a - 1]; if (q.type === 'text' || q.indent < k || (q.indent === k && q.type !== T)) break; a--; }
  while (z < blocks.length - 1) { const q = blocks[z + 1]; if (q.type === 'text' || q.indent < k || (q.indent === k && q.type !== T)) break; z++; }
  const next = LIST_CYCLE[(LIST_CYCLE.indexOf(T) + 1) % LIST_CYCLE.length];
  const out = blocks.map((x, j) => {
    if (j < a || j > z || x.type !== T) return x;
    return next === 'text' ? { ...x, type: 'text', checked: false, indent: 0 } : { ...x, type: next, checked: false };
  });
  return normalize(out, { id, pos: Math.min(caret, b.text.length) });
}

// Multi-line paste: "- a\n- b\n1. c" becomes real list rows. Single-line paste → null (native).
export function pasteInto(blocks, id, selStart, selEnd, pasted) {
  const i = indexOf(blocks, id); if (i < 0) return null;
  const src = String(pasted || '').replace(/\r\n?/g, '\n');
  if (!src.includes('\n')) return null;
  const b = blocks[i];
  if (b.type === 'text') {
    const nv = b.text.slice(0, selStart) + src + b.text.slice(selEnd);
    const parsed = parseContent(nv);
    if (parsed[0].type === 'text') parsed[0].id = b.id;
    return normalize(replaceAt(blocks, i, ...parsed), null);
  }
  const lines = src.split('\n');
  const head = b.text.slice(0, selStart) + (parseListLine(lines[0])?.text ?? lines[0]);
  const tail = b.text.slice(selEnd);
  const restBlocks = parseContent(lines.slice(1).join('\n'));
  const last = restBlocks[restBlocks.length - 1];
  restBlocks[restBlocks.length - 1] = { ...last, text: last.text + tail };
  return normalize(replaceAt(blocks, i, { ...b, text: head }, ...restBlocks), { id: restBlocks[restBlocks.length - 1].id, pos: restBlocks[restBlocks.length - 1].text.length - tail.length });
}

// The one-line preview used in the notes list: markers become real glyphs.
export function previewText(content) {
  return String(content || '')
    .split('\n')
    .map(l => {
      const item = parseListLine(l);
      if (!item) return l.trim();
      const num = item.type === 'num' ? /(\d{1,3})/.exec(l)[1] + '.' : null;
      return `${item.type === 'bullet' ? '•' : item.type === 'check' ? (item.checked ? '☑' : '☐') : num} ${item.text}`.trim();
    })
    .filter(Boolean)
    .join('  ');
}
