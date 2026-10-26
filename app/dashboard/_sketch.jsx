'use client';
// app/dashboard/_sketch.jsx — hand-writing / drawing pad for notes.
//
// • Pen (pressure-aware), marker, stroke eraser, hand (pan); undo / redo; an endless board you pan and pinch-zoom.
// • Tablet with a pen: the pen draws, fingers move and zoom the board (a resting palm never leaves a mark).
//   Phone / no pen: one finger draws, two fingers move and zoom.
// • Saved as a PNG with the strokes embedded (lib/sketchPng.js) → the same picture can be opened and edited again.
// • What is drawn is also backed up on this device while drawing (see lib/draft.js), so a phone call or an app switch
//   in the middle of a drawing loses nothing.
// The paper is always white (so ink reads in light and dark themes).

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { embedScene, readScene } from '../../lib/sketchPng';
import { loadDraft, saveDraft, clearDraft } from '../../lib/draft';

const INK = ['#1c1c1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5'];
const PEN_WIDTHS = [2, 4, 8];
const MARKER_ALPHA = 0.35;
const MIN_K = 0.1, MAX_K = 6;
const EXPORT_SCALE = 2, EXPORT_MAX_SIDE = 4096, EXPORT_MAX_PIXELS = 16e6;
const MAX_DRAFT_CHARS = 1.5e6;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- geometry ----------
function bboxOf(stroke) {
  if (stroke.b) return stroke.b;
  const p = stroke.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
  const pad = (stroke.tool === 'marker' ? stroke.w * 4 : stroke.w) / 2 + 1;
  Object.defineProperty(stroke, 'b', { value: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], enumerable: false });
  return stroke.b;
}
function sceneBounds(strokes, bg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) { const b = bboxOf(s); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (bg) { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, bg.w); y1 = Math.max(y1, bg.h); }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  const cx = ax + t * dx - px, cy = ay + t * dy - py; return cx * cx + cy * cy;
}
function hits(stroke, x, y, r) {
  const b = bboxOf(stroke); if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  const p = stroke.p, rr = (r + stroke.w / 2) ** 2;
  if (p.length === 3) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= rr;
  for (let i = 3; i < p.length; i += 3) if (segDist2(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= rr) return true;
  return false;
}

// ---------- drawing ----------
function drawStroke(ctx, s, k) {
  const p = s.p, n = p.length / 3; if (!n) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  if (s.tool === 'marker') {
    ctx.globalAlpha = MARKER_ALPHA; ctx.lineWidth = s.w * 4 * k;
    ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k);
    if (n === 1) ctx.lineTo(p[0] * k + 0.01, p[1] * k);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 3] * k, p[i * 3 + 1] * k);
    ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  const wAt = i => s.w * (0.45 + 0.9 * clamp(p[i * 3 + 2], 0, 1)) * k;
  if (n === 1) { ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, wAt(0) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  let px = p[0] * k, py = p[1] * k;
  for (let i = 1; i < n; i++) {
    const x = p[i * 3] * k, y = p[i * 3 + 1] * k;
    const mx = i === n - 1 ? x : (x + p[(i + 1) * 3] * k) / 2, my = i === n - 1 ? y : (y + p[(i + 1) * 3 + 1] * k) / 2;
    ctx.lineWidth = wAt(i); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(x, y, mx, my); ctx.stroke();
    px = mx; py = my;
  }
}
function paintScene(ctx, strokes, bg, k) {
  if (bg) ctx.drawImage(bg.img, 0, 0, bg.w * k, bg.h * k);
  for (const s of strokes) drawStroke(ctx, s, k);
}

async function exportPng(strokes, bg) {
  const b = sceneBounds(strokes, bg); if (!b) return null;
  const margin = 32;
  const x0 = Math.floor(b[0] - margin), y0 = Math.floor(b[1] - margin);
  const w = Math.max(64, Math.ceil(b[2] + margin) - x0), h = Math.max(64, Math.ceil(b[3] + margin) - y0);
  let scale = EXPORT_SCALE;
  scale = Math.min(scale, EXPORT_MAX_SIDE / Math.max(w, h), Math.sqrt(EXPORT_MAX_PIXELS / (w * h)));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(-x0 * scale, -y0 * scale); paintScene(ctx, strokes, bg, scale);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  if (!blob) return null;
  const png = new Uint8Array(await blob.arrayBuffer());
  const scene = { v: 1, strokes: strokes.map(s => ({ c: s.c, w: s.w, tool: s.tool, p: s.p })) };
  try { return new Blob([await embedScene(png, scene)], { type: 'image/png' }); } catch { return blob; }
}

const cleanStrokes = list => (Array.isArray(list) ? list : []).filter(s => s && Array.isArray(s.p) && s.p.length >= 3 && s.p.length % 3 === 0 && typeof s.c === 'string')
  .map(s => ({ c: String(s.c).slice(0, 20), w: clamp(Number(s.w) || 4, 1, 40), tool: s.tool === 'marker' ? 'marker' : 'pen', p: s.p.map(Number) }));

// ---------- the component ----------
// imageUrl: reopen an existing picture · draftKey: where the on-device backup lives · onSave(blob) → Promise<boolean> · onCancel()
export default function SketchEditor({ imageUrl, draftKey, onSave, onCancel }) {
  const stageRef = useRef(null), baseRef = useRef(null), liveRef = useRef(null);
  const view = useRef({ x: 24, y: 24, k: 1 });
  const strokes = useRef([]);
  const undo = useRef([]), redo = useRef([]);
  const bgRef = useRef(null);
  const cur = useRef(null);                     // the stroke being drawn
  const ptrs = useRef(new Map());
  const mode = useRef(null);                    // draw | erase | pan | pinch | wait
  const gesture = useRef(null);
  const penSeen = useRef(false), space = useRef(false);
  const dirty = useRef({ base: true, live: true }), raf = useRef(0);
  const erased = useRef(null);
  const initialJson = useRef('[]');

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(INK[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!!imageUrl);
  const [loadNote, setLoadNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const toolRef = useRef(tool); toolRef.current = tool;
  const colorRef = useRef(color); colorRef.current = color;
  const widthRef = useRef(PEN_WIDTHS[widthIdx]); widthRef.current = PEN_WIDTHS[widthIdx];
  const bump = () => setTick(n => n + 1);

  const schedule = useCallback((what = 'both') => {
    if (what !== 'live') dirty.current.base = true;
    dirty.current.live = true;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const stage = stageRef.current, base = baseRef.current, live = liveRef.current; if (!stage || !base || !live) return;
      const dpr = window.devicePixelRatio || 1, { x, y, k } = view.current;
      if (dirty.current.base) {
        const ctx = base.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, base.width, base.height);
        ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
        if (k >= 0.35) {                                   // a faint dot grid helps to line things up; not part of the picture
          const step = 40; const sx = Math.floor(-x / k / step) * step, sy = Math.floor(-y / k / step) * step;
          const ex = (stage.clientWidth - x) / k, ey = (stage.clientHeight - y) / k;
          ctx.fillStyle = 'rgba(0,0,0,0.13)';
          for (let gx = sx; gx < ex; gx += step) for (let gy = sy; gy < ey; gy += step) ctx.fillRect(gx * k - 0.75, gy * k - 0.75, 1.5, 1.5);
        }
        paintScene(ctx, strokes.current, bgRef.current, k);
        dirty.current.base = false;
      }
      if (dirty.current.live) {
        const ctx = live.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, live.width, live.height);
        if (cur.current) { ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr); drawStroke(ctx, cur.current, k); }
        dirty.current.live = false;
      }
    });
  }, []);

  // ----- canvas size -----
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return undefined;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
      for (const c of [baseRef.current, liveRef.current]) { if (c) { c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); } }
      schedule();
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(stage);
    window.addEventListener('resize', fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; };   // (React dev mode runs effects twice)
  }, [schedule]);

  const fitView = useCallback(() => {
    const stage = stageRef.current; if (!stage) return;
    const b = sceneBounds(strokes.current, bgRef.current);
    if (!b) { view.current = { x: 24, y: 24, k: 1 }; schedule(); return; }
    const pad = 32, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    const k = clamp(Math.min(stage.clientWidth / w, stage.clientHeight / h), MIN_K, 1.5);
    view.current = { k, x: (stage.clientWidth - (b[2] - b[0]) * k) / 2 - b[0] * k, y: (stage.clientHeight - (b[3] - b[1]) * k) / 2 - b[1] * k };
    schedule();
  }, [schedule]);

  // ----- load an existing picture (strokes inside the PNG, or just the picture) + restore a backup -----
  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = [];
      if (imageUrl) {
        try {
          const res = await fetch(imageUrl, { credentials: 'same-origin' });
          if (!res.ok) throw new Error(String(res.status));
          const bytes = new Uint8Array(await res.arrayBuffer());
          const scene = await readScene(bytes);
          if (scene?.strokes) loaded = cleanStrokes(scene.strokes);
          else {
            const url = URL.createObjectURL(new Blob([bytes]));
            const img = await new Promise((ok, no) => { const el = new Image(); el.onload = () => ok(el); el.onerror = no; el.src = url; });
            bgRef.current = { img, w: img.naturalWidth, h: img.naturalHeight, url };
            setLoadNote('รูปนี้ไม่มีข้อมูลเส้นให้แก้ — วาดทับได้ แต่เส้นเดิมลบไม่ได้');
          }
        } catch { if (alive) setError('เปิดรูปไม่สำเร็จ ลองอีกครั้งครับ'); }
      }
      if (!alive) return;
      initialJson.current = JSON.stringify(loaded.map(s => [s.c, s.w, s.tool, s.p.length]));
      strokes.current = loaded;
      const saved = draftKey ? loadDraft(`sketch:${draftKey}`) : null;
      const backup = cleanStrokes(saved?.strokes);
      if (backup.length && JSON.stringify(backup.map(s => [s.c, s.w, s.tool, s.p.length])) !== initialJson.current) { strokes.current = backup; setRestored(true); }
      setLoading(false); fitView(); bump();
    })();
    return () => { alive = false; if (bgRef.current?.url) URL.revokeObjectURL(bgRef.current.url); };
  }, [imageUrl, draftKey, fitView]);

  // ----- on-device backup while drawing -----
  const version = useRef(0);
  useEffect(() => {
    if (loading || !draftKey) return undefined;
    const t = setTimeout(() => {
      try {
        const json = JSON.stringify({ strokes: strokes.current.map(s => ({ c: s.c, w: s.w, tool: s.tool, p: s.p })) });
        if (!strokes.current.length) clearDraft(`sketch:${draftKey}`);
        else if (json.length < MAX_DRAFT_CHARS) saveDraft(`sketch:${draftKey}`, JSON.parse(json));
      } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  });                                                           // every render: cheap, and a stroke always re-renders

  // ----- history -----
  const commit = next => {
    undo.current.push(strokes.current); if (undo.current.length > 200) undo.current.shift();
    redo.current = []; strokes.current = next; version.current++; schedule(); bump();
  };
  const doUndo = () => { if (!undo.current.length) return; redo.current.push(strokes.current); strokes.current = undo.current.pop(); version.current++; schedule(); bump(); };
  const doRedo = () => { if (!redo.current.length) return; undo.current.push(strokes.current); strokes.current = redo.current.pop(); version.current++; schedule(); bump(); };

  // ----- pointer input -----
  const toWorld = (cx, cy) => { const r = stageRef.current.getBoundingClientRect(), { x, y, k } = view.current; return [(cx - r.left - x) / k, (cy - r.top - y) / k]; };
  const eraseAt = (cx, cy) => {
    const [wx, wy] = toWorld(cx, cy), r = 14 / view.current.k;
    const keep = strokes.current.filter(s => !hits(s, wx, wy, r));
    if (keep.length !== strokes.current.length) { erased.current = erased.current || strokes.current; strokes.current = keep; schedule('base'); }
  };
  const pressureOf = e => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5);
  const addPoint = e => {
    const [wx, wy] = toWorld(e.clientX, e.clientY), p = cur.current.p, n = p.length;
    if (n >= 3) { const dx = wx - p[n - 3], dy = wy - p[n - 2]; if (dx * dx + dy * dy < (0.8 / view.current.k) ** 2) return; }
    p.push(Math.round(wx * 10) / 10, Math.round(wy * 10) / 10, Math.round(pressureOf(e) * 100) / 100);
  };
  const active = useRef(null);                 // pointerId that is drawing / erasing / panning right now
  const touches = () => [...ptrs.current.values()].filter(v => v.type === 'touch');
  const startPinch = () => {
    const [a, b] = touches();
    gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...view.current } };
    mode.current = 'pinch'; active.current = null;
  };
  const startPan = e => { mode.current = 'pan'; active.current = e.pointerId; gesture.current = { x: e.clientX, y: e.clientY, view: { ...view.current } }; };
  const startErase = e => { mode.current = 'erase'; active.current = e.pointerId; erased.current = null; eraseAt(e.clientX, e.clientY); };
  const startDraw = e => {
    cur.current = { c: colorRef.current, w: widthRef.current, tool: toolRef.current === 'marker' ? 'marker' : 'pen', p: [], fromTouch: e.pointerType === 'touch' };
    mode.current = 'draw'; active.current = e.pointerId; addPoint(e); schedule('live');
  };

  const onDown = e => {
    e.preventDefault();
    if (e.pointerType === 'pen') penSeen.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const tl = toolRef.current;
    if (e.pointerType !== 'touch') {                                  // pen or mouse: always acts, whatever else is on the glass
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      if (mode.current === 'pinch' || mode.current === 'wait' || mode.current === 'pan') { mode.current = null; gesture.current = null; }
      if (cur.current) { cur.current = null; schedule('live'); }
      if (tl === 'hand' || (e.pointerType === 'mouse' && (e.button === 1 || space.current))) startPan(e);
      else if (tl === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32))) startErase(e);
      else startDraw(e);
      return;
    }
    // a finger
    if (mode.current === 'draw' && cur.current && !cur.current.fromTouch) return;       // the pen is writing: a resting palm is ignored
    if (penSeen.current) {                                                              // tablet with a pen: fingers only move / zoom the board
      if (touches().length >= 2) startPinch(); else if (touches().length === 1) startPan(e);
      return;
    }
    if (touches().length >= 2) { if (cur.current) { cur.current = null; schedule('live'); } startPinch(); return; }
    if (mode.current === 'pinch' || mode.current === 'wait') return;
    if (tl === 'hand') startPan(e);
    else if (tl === 'eraser') startErase(e);
    else startDraw(e);
  };
  const onMove = e => {
    const rec = ptrs.current.get(e.pointerId); if (!rec) return;
    rec.x = e.clientX; rec.y = e.clientY;
    if (mode.current === 'pinch' && gesture.current && touches().length >= 2) {
      const [a, b] = touches(), g = gesture.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(g.view.k * d / g.d, MIN_K, MAX_K), r = stageRef.current.getBoundingClientRect();
      const wx = (g.cx - r.left - g.view.x) / g.view.k, wy = (g.cy - r.top - g.view.y) / g.view.k;       // the world point that was under the fingers
      view.current = { k, x: cx - r.left - wx * k, y: cy - r.top - wy * k }; schedule();
      return;
    }
    if (e.pointerId !== active.current) return;
    if (mode.current === 'draw' && cur.current) {
      const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of (list.length ? list : [e])) addPoint(ev);
      schedule('live');
    } else if (mode.current === 'erase') eraseAt(e.clientX, e.clientY);
    else if (mode.current === 'pan' && gesture.current) { view.current = { ...view.current, x: gesture.current.view.x + e.clientX - gesture.current.x, y: gesture.current.view.y + e.clientY - gesture.current.y }; schedule(); }
  };
  const onUp = e => {
    ptrs.current.delete(e.pointerId);
    if (e.pointerId === active.current) {
      if (mode.current === 'draw' && cur.current) {
        const st = cur.current; cur.current = null;
        if (st.p.length >= 3) { delete st.fromTouch; commit([...strokes.current, st]); }
      } else if (mode.current === 'erase' && erased.current) { const after = strokes.current; strokes.current = erased.current; erased.current = null; commit(after); }
      mode.current = null; active.current = null; gesture.current = null;
    } else if (mode.current === 'pinch' && touches().length < 2) { mode.current = touches().length ? 'wait' : null; gesture.current = null; }
    if (mode.current === 'wait' && touches().length === 0) mode.current = null;
    schedule('live');
  };
  const onWheel = e => {
    e.preventDefault();
    const r = stageRef.current.getBoundingClientRect(), { x, y, k } = view.current;
    if (e.ctrlKey || e.metaKey) {
      const nk = clamp(k * Math.exp(-e.deltaY * 0.01), MIN_K, MAX_K), px = e.clientX - r.left, py = e.clientY - r.top;
      view.current = { k: nk, x: px - (px - x) * nk / k, y: py - (py - y) * nk / k };
    } else view.current = { k, x: x - e.deltaX, y: y - e.deltaY };
    schedule();
  };
  useEffect(() => {                                             // React's onWheel is passive; this one may call preventDefault
    const el = stageRef.current; if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const zoomBy = f => {
    const stage = stageRef.current, { x, y, k } = view.current, nk = clamp(k * f, MIN_K, MAX_K), cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
    view.current = { k: nk, x: cx - (cx - x) * nk / k, y: cy - (cy - y) * nk / k }; schedule();
  };

  // ----- keys -----
  const changed = () => JSON.stringify(strokes.current.map(s => [s.c, s.w, s.tool, s.p.length])) !== initialJson.current;
  const cancel = () => { if (saving) return; if (strokes.current.length && changed() && !confirm('ทิ้งสิ่งที่วาดไว้ใช่ไหมครับ?')) return; if (draftKey) clearDraft(`sketch:${draftKey}`); onCancel(); };
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    const down = e => {
      if (e.key === ' ' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { space.current = true; e.preventDefault(); }
      if (e.key === 'Escape') cancelRef.current();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    };
    const up = e => { if (e.key === ' ') space.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  // ----- save -----
  async function save() {
    if (saving || !strokes.current.length) return;
    setSaving(true); setError('');
    try {
      const blob = await exportPng(strokes.current, bgRef.current);
      if (!blob) throw new Error('export');
      const ok = await onSave(blob);
      if (ok === false) { setError('บันทึกไม่สำเร็จ — ที่วาดยังอยู่ ลองกด ✓ อีกครั้งครับ'); setSaving(false); return; }
      if (draftKey) clearDraft(`sketch:${draftKey}`);
    } catch { setError('บันทึกไม่สำเร็จ — ที่วาดยังอยู่ ลองกด ✓ อีกครั้งครับ'); setSaving(false); }
  }

  const stop = e => e.stopPropagation();
  const nStrokes = strokes.current.length;
  return createPortal(
    <div className="sketch-overlay" role="dialog" aria-modal="true" aria-label="เขียนด้วยมือ" onMouseDown={stop} onPointerDown={stop} onClick={stop}>
      <div className="sketch-bar">
        <div className="sk-row">
          <button type="button" className="sk-btn" title="ปิด (ทิ้งที่วาด)" aria-label="ปิด" onClick={cancel}>✕</button>
          <button type="button" className="sk-btn" title="เลิกทำ" aria-label="เลิกทำ" disabled={!undo.current.length} onClick={doUndo}>↶</button>
          <button type="button" className="sk-btn" title="ทำซ้ำ" aria-label="ทำซ้ำ" disabled={!redo.current.length} onClick={doRedo}>↷</button>
          <span className="sk-sep" />
          {[['pen', '✏️', 'ปากกา'], ['marker', '🖍️', 'ไฮไลต์'], ['eraser', '🧽', 'ลบเส้น'], ['hand', '✋', 'เลื่อนกระดาน']].map(([key, icon, label]) => (
            <button key={key} type="button" className={`sk-btn${tool === key ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={tool === key} onClick={() => setTool(key)}>{icon}</button>
          ))}
          <span className="sk-spacer sk-spacer-a" />
          <button type="button" className="sk-btn sk-save" title="บันทึก" aria-label="บันทึก" disabled={saving || loading || nStrokes === 0} onClick={save}>{saving ? '…' : '✓'}</button>
        </div>
        <div className="sk-row">
          {INK.map(c => <button key={c} type="button" className={`sk-dot${color === c ? ' on' : ''}`} style={{ background: c }} title="สี" aria-label={`สี ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === 'eraser' || tool === 'hand') setTool('pen'); }} />)}
          <span className="sk-sep" />
          {PEN_WIDTHS.map((w, i) => <button key={w} type="button" className={`sk-btn${widthIdx === i ? ' on' : ''}`} title={`ขนาดเส้น ${i + 1}`} aria-label={`ขนาดเส้น ${i + 1}`} aria-pressed={widthIdx === i} onClick={() => setWidthIdx(i)}><span className="sk-w" style={{ width: 6 + i * 4, height: 6 + i * 4 }} /></button>)}
          <span className="sk-spacer" />
          <button type="button" className="sk-btn sk-zoom" title="ซูมออก" aria-label="ซูมออก" onClick={() => zoomBy(0.8)}>−</button>
          <button type="button" className="sk-btn sk-zoom" title="ซูมเข้า" aria-label="ซูมเข้า" onClick={() => zoomBy(1.25)}>＋</button>
          <button type="button" className="sk-btn" title="ดูทั้งหมด" aria-label="ดูทั้งหมด" onClick={fitView}>⤢</button>
        </div>
      </div>
      {(restored || loadNote || error) && (
        <div className={`sketch-note${error ? ' err' : ''}`} role="status">{error || loadNote || '📝 กู้คืนที่วาดค้างไว้ให้แล้ว'}</div>
      )}
      <div className={`sketch-stage tool-${tool}`} ref={stageRef} data-strokes={nStrokes} data-tool={tool} data-loading={loading ? '1' : '0'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
        <canvas ref={baseRef} className="sketch-canvas" />
        <canvas ref={liveRef} className="sketch-canvas sketch-live" />
        {loading && <div className="sketch-loading">กำลังเปิด…</div>}
      </div>
    </div>,
    document.body
  );
}
