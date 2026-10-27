'use client';
// app/dashboard/_sketch.jsx — hand-writing + diagram pad for notes.
//
// • Pen (pressure-aware), marker, stroke eraser, hand (pan); undo / redo; an endless board you pan and pinch-zoom.
// • Diagrams: rectangle / ellipse / diamond (with a label), line and arrow (the ends glue to shapes and follow them when moved),
//   free text; select → move, resize a corner, drag an arrow's end, change colour / thickness / tint, duplicate, delete.
//   Elbow arrows route in right angles. Several items: tick the ☑ button (tap to add / remove) or drag a box across them
//   (mouse / pen: just drag on empty space; Shift-click on a desktop) → move, recolour, duplicate or delete them together.
// • Tablet with a pen: the pen draws, fingers move and zoom the board (a resting palm never leaves a mark).
//   Phone / no pen: one finger draws, two fingers move and zoom.
// • Saved as a PNG with the drawing embedded (lib/sketchPng.js) → the same picture can be opened and edited again.
// • A PHOTO can be opened to draw on (circle / arrow / write on it): saved as a JPEG with the strokes AND the original photo inside
//   (lib/sketchJpeg.js), so it can be edited again and "erase all" brings the photo back.
// • Backed up on this device while drawing (lib/draft.js), so a phone call or an app switch loses nothing.
// The paper is always white (so ink reads in light and dark themes). The model / geometry lives in lib/sketchModel.js,
// the painting in lib/sketchDraw.js.

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { embedScene, readScene } from '../../lib/sketchPng';
import { embedInJpeg, readFromJpeg, sniffImageType } from '../../lib/sketchJpeg';
import { loadDraft, saveDraft, clearDraft } from '../../lib/draft';
import {
  FONT, TEXT_SIZES, LABEL_SIZE, clamp, uid, isShape, isLine, isDim, isPin, endsOf, dimOffsetHandle, dimOffsetFor, dimLabelBox, dimLabelSize, nextPinNumber, cleanItems, serializeItems, sig, byIdMap, sceneBounds, boundsOf,
  hitItem, topItemAt, shapeAt, resizeShape, cornerPoints, lineEnds, removeItems, translateMany, duplicateItems, itemsInRect,
} from '../../lib/sketchModel';
import { paintItems, drawItem, drawSelection, drawGroupSelection, drawMarquee, measureText } from '../../lib/sketchDraw';

const INK = ['#1c1c1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5'];
const WIDTHS = [2, 4, 8];
const PIN_R = [14, 18, 26];                 // a pin's size follows the thickness setting
const CALLOUT_W = 180, CALLOUT_H = 60;       // a new callout's box
// on a photo the board is the photo's pixels (up to 1600 wide): pens, text, labels, pins and callouts are made bigger to match, so they read when the picture is shown small
const unitFor = bg => (bg ? clamp(Math.max(bg.w, bg.h) / 600, 1, 3) : 1);
const editable = it => !!it && (it.k === 'text' || isShape(it) || isDim(it));       // things that carry words
const MIN_K = 0.1, MAX_K = 6;
const EXPORT_SCALE = 2, EXPORT_MAX_SIDE = 4096, EXPORT_MAX_PIXELS = 16e6;
const MAX_DRAFT_CHARS = 1.5e6;
const DOUBLE_TAP_MS = 380;

// small drawn icons for the tools that have no good emoji (they say what the tool makes)
const svg = body => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>;
const ICON = {
  dim: svg(<><path d="M3 12h18M3 8v8M21 8v8" /><path d="M7.5 9.5L4 12l3.5 2.5M16.5 9.5L20 12l-3.5 2.5" /></>),
  dimPlan: svg(<><path d="M5 3v11M19 3v11M3 17h18" /><path d="M3 19.5l4-5M17 19.5l4-5" /></>),
  callout: svg(<><rect x="9" y="3" width="12" height="8" rx="2" /><path d="M11 11L5 18" /><circle cx="4" cy="19.5" r="1.8" fill="currentColor" /></>),
  pin: svg(<><circle cx="12" cy="12" r="9" /><text x="12" y="16.2" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="currentColor" stroke="none">1</text></>),
  tipDot: svg(<><path d="M4 20L15 9" /><circle cx="17" cy="7" r="3" fill="currentColor" /></>),
  fill: svg(<><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 000 16z" fill="currentColor" /></>),
  endsNone: svg(<path d="M3 12h18" />),
  endsEnd: svg(<><path d="M3 12h16" /><path d="M14 7l6 5-6 5z" fill="currentColor" /></>),
  endsBoth: svg(<><path d="M5 12h14" /><path d="M10 7L4 12l6 5zM14 7l6 5-6 5z" fill="currentColor" /></>),
  endsDot: svg(<><path d="M3 12h13" /><circle cx="18.5" cy="12" r="3" fill="currentColor" /></>),
  solid: svg(<path d="M3 12h18" />),
  dashed: svg(<path d="M3 12h4M10 12h4M17 12h4" />),
  tipArrow: svg(<><path d="M4 20L18 6M18 6h-7M18 6v7" /></>),
};
// the tools in groups. A group is shown open when the bar is wide enough, else as ONE button (its last-used tool + the group's name)
const GROUPS = [
  { id: 'draw', label: 'วาด', tools: [['pen', '✏️', 'ปากกา'], ['marker', '🖍️', 'ไฮไลต์'], ['eraser', '🧽', 'ลบ'], ['hand', '✋', 'เลื่อนกระดาน']] },
  { id: 'style', label: 'สี/ขนาด', tools: [] },
  { id: 'shape', label: 'รูปทรง', tools: [['rect', '▭', 'สี่เหลี่ยม'], ['ellipse', '◯', 'วงรี'], ['diamond', '◇', 'ข้าวหลามตัด'], ['line', '╱', 'เส้นตรง'], ['arrow', '➜', 'ลูกศร'], ['elbow', '↱', 'ลูกศรหักมุม']] },
  { id: 'mark', label: 'วัด/ชี้', tools: [['dim', ICON.dim, 'เส้นวัดระยะ'], ['callout', ICON.callout, 'กรอบมีตัวชี้'], ['pin', ICON.pin, 'หมายเลขจุด'], ['text', 'T', 'ข้อความ']] },
  { id: 'edit', label: 'เลือก/จัดการ', tools: [['select', '👆', 'เลือก / ย้าย']] },
];
const COLLAPSE_ORDER = ['edit', 'mark', 'shape', 'style', 'draw'];          // the least important group folds first
const ALL_OPEN = { expand: { draw: true, style: true, shape: true, mark: true, edit: true }, wrap: false, stack: false };
const HINTS = {
  pen: 'ใช้นิ้วหรือปากกาเขียนได้เลย · สองนิ้วเพื่อเลื่อนและซูม (แท็บเล็ตที่มีปากกา: ปากกาเขียน นิ้วเลื่อน)', marker: 'ไฮไลต์ทับข้อความหรือเส้น สีจางโปร่งแสง', eraser: 'ลากผ่านเส้นหรือรูปทรงที่ต้องการลบ (ลบทั้งชิ้น)', hand: 'ลากเพื่อเลื่อนกระดาน',
  select: 'แตะเพื่อเลือก ลากเพื่อย้าย ลากมุม/ปลายลูกศรเพื่อปรับ · แก้ข้อความ: แตะสองครั้ง หรือเลือกแล้วกดปุ่ม ✎ (หรือ Enter)',
  rect: 'ลากเพื่อวาด (แตะครั้งเดียวได้ขนาดมาตรฐาน) แล้วแตะสองครั้งเพื่อใส่ข้อความ', ellipse: 'ลากเพื่อวาด (แตะครั้งเดียวได้ขนาดมาตรฐาน) แล้วแตะสองครั้งเพื่อใส่ข้อความ', diamond: 'ลากเพื่อวาด (แตะครั้งเดียวได้ขนาดมาตรฐาน) แล้วแตะสองครั้งเพื่อใส่ข้อความ',
  line: 'ลากจากรูปทรงหนึ่งไปอีกรูปทรง เส้นจะติดกับรูปและตามเมื่อย้าย', arrow: 'ลากจากรูปทรงหนึ่งไปอีกรูปทรง ลูกศรจะติดกับรูปและตามเมื่อย้าย', elbow: 'ลากจากรูปทรงหนึ่งไปอีกรูปทรง ลูกศรจะหักเป็นมุมฉาก ติดกับรูปและตามเมื่อย้าย', multi: 'แตะรูปหลายชิ้นเพื่อเลือก/เลิกเลือก หรือลากคลุมให้ครอบรูปทั้งชิ้น แล้วลากเพื่อย้ายพร้อมกัน', text: 'แตะตรงที่ต้องการพิมพ์',
  dim: 'ลากจากจุดเริ่มไปจุดสิ้นสุดของระยะที่วัด แล้วพิมพ์ตัวเลขและหน่วย (พิมพ์เองตามที่ต้องการ) · ปุ่มสลับแบบ: แบบง่าย / แบบแบบแปลน', callout: 'กดที่จุดที่ต้องการชี้ แล้วลากไปวางกรอบข้อความ จากนั้นพิมพ์ข้อความ ลากหัวชี้เพื่อย้ายตำแหน่งที่ชี้', pin: 'แตะที่จุดเพื่อปักหมายเลข (เรียง 1, 2, 3… ให้เอง) แตะต่อได้เรื่อย ๆ · เสร็จแล้วเลือกเครื่องมือ 👆 เพื่อย้าย',
};

async function exportPng(items, bg) {
  const b = sceneBounds(items, bg, measureText); if (!b) return null;
  const margin = 32;
  const x0 = Math.floor(b[0] - margin), y0 = Math.floor(b[1] - margin);
  const w = Math.max(64, Math.ceil(b[2] + margin) - x0), h = Math.max(64, Math.ceil(b[3] + margin) - y0);
  const scale = Math.min(EXPORT_SCALE, EXPORT_MAX_SIDE / Math.max(w, h), Math.sqrt(EXPORT_MAX_PIXELS / (w * h)));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(-x0 * scale, -y0 * scale); paintItems(ctx, items, bg, scale, byIdMap(items));
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  if (!blob) return null;
  const png = new Uint8Array(await blob.arrayBuffer());
  try { return new Blob([await embedScene(png, { v: 2, items: serializeItems(items) })], { type: 'image/png' }); } catch { return blob; }
}

// a drawing on a photo → a JPEG (photo + strokes painted together) that also carries the strokes and the original photo
async function exportOnPhoto(items, bg, original) {
  const b = sceneBounds(items, bg, measureText); if (!b || !original) return null;
  const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]), w = Math.max(64, Math.ceil(b[2]) - x0), h = Math.max(64, Math.ceil(b[3]) - y0);
  const scale = Math.min(1, EXPORT_MAX_SIDE / Math.max(w, h), Math.sqrt(EXPORT_MAX_PIXELS / (w * h)));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(-x0 * scale, -y0 * scale); paintItems(ctx, items, bg, scale, byIdMap(items));
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
  if (!blob) return null;
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  try { return new Blob([await embedInJpeg(jpeg, { v: 2, items: serializeItems(items) }, original)], { type: 'image/jpeg' }); } catch { return blob; }
}

const PHOTO_MAX_EDGE = 1600;
// bytes of any photo → { img, w, h, url } to paint, and the same photo as a bounded JPEG to keep inside the saved file
async function decodePhoto(bytes, mime, normalise) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const img = await new Promise((ok, no) => { const el = new Image(); el.onload = () => ok(el); el.onerror = no; el.src = url; });
  if (!normalise) return { bg: { img, w: img.naturalWidth, h: img.naturalHeight, url }, original: { bytes, mime } };
  const k = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('jpeg');
  const norm = new Uint8Array(await blob.arrayBuffer());
  return decodePhoto(norm, 'image/jpeg', false);
}

// imageUrl: reopen an existing picture · draftKey: where the on-device backup lives · onSave(blob) → Promise<boolean> · onCancel()
export default function SketchEditor({ imageUrl, draftKey, onSave, onCancel }) {
  const stageRef = useRef(null), baseRef = useRef(null), liveRef = useRef(null), taRef = useRef(null);
  const view = useRef({ x: 24, y: 24, k: 1 });
  const items = useRef([]);
  const undo = useRef([]), redo = useRef([]);
  const bgRef = useRef(null);
  const originalRef = useRef(null);                // the photo under a drawing-on-a-photo: { bytes, mime } (kept inside the saved file)
  const cur = useRef(null);                     // the item being drawn right now (stroke / shape / line preview)
  const ptrs = useRef(new Map());
  const g = useRef(null);                       // the running gesture: { type, pid, … }
  const penSeen = useRef(false), space = useRef(false);
  const dirty = useRef({ base: true, live: true }), raf = useRef(0);
  const initialSig = useRef('');
  const lastTap = useRef({ id: null, t: 0 });
  const marq = useRef(null);                    // the rubber-band box while dragging across empty space: [x0, y0, x1, y1] in board coordinates
  const version = useRef(0);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(INK[0]);
  const [widthIdx, setWidthIdx] = useState(1);
  const [fill, setFill] = useState(false);
  const [dimStyle, setDimStyle] = useState('simple');   // how the next measured distance looks: 'simple' | 'plan'
  const [tipStyle, setTipStyle] = useState('arrow');   // how the next callout's pointer ends: 'arrow' | 'dot'
  const [lineOpts, setLineOpts] = useState({ ends: null, dash: false });   // how the next line / arrow looks (ends null = the tool's own default)
  const [customW, setCustomW] = useState(null);         // a thickness typed in by hand (null = the three presets)
  const [sizeText, setSizeText] = useState(null);
  const [selIds, setSelIds] = useState([]);
  const [multi, setMulti] = useState(false);
  const [editing, setEditing] = useState(null);     // { mode:'new'|'text'|'label', id, x, y, text, size, c, box? }
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(!!imageUrl);
  const [loadNote, setLoadNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const toolRef = useRef(tool); toolRef.current = tool;
  const colorRef = useRef(color); colorRef.current = color;
  const widthRef = useRef(widthIdx); widthRef.current = widthIdx;
  const fillRef = useRef(fill); fillRef.current = fill;
  const dimStyleRef = useRef(dimStyle); dimStyleRef.current = dimStyle;
  const tipStyleRef = useRef(tipStyle); tipStyleRef.current = tipStyle;
  const lineOptsRef = useRef(lineOpts); lineOptsRef.current = lineOpts;
  const customWRef = useRef(customW); customWRef.current = customW;
  const selRef = useRef(selIds); selRef.current = selIds;
  const multiRef = useRef(multi); multiRef.current = multi;
  const editRef = useRef(editing); editRef.current = editing;
  const bump = () => setTick(n => n + 1);
  const selectedItems = () => items.current.filter(i => selRef.current.includes(i.id));
  const selected = () => (selRef.current.length === 1 ? items.current.find(i => i.id === selRef.current[0]) || null : null);     // exactly one item (it gets handles)
  const setSel = ids => { selRef.current = ids; setSelIds(ids); schedule('live'); };

  const schedule = useCallback((what = 'both') => {
    if (what !== 'live') dirty.current.base = true;
    dirty.current.live = true;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const stage = stageRef.current, base = baseRef.current, live = liveRef.current; if (!stage || !base || !live) return;
      const dpr = window.devicePixelRatio || 1, { x, y, k } = view.current, list = items.current, byId = byIdMap(list);
      if (dirty.current.base) {
        const ctx = base.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, base.width, base.height);
        ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
        if (k >= 0.35) {                                   // a faint dot grid helps to line things up; not part of the picture
          const step = 40; const sx = Math.floor(-x / k / step) * step, sy = Math.floor(-y / k / step) * step;
          const ex = (stage.clientWidth - x) / k, ey = (stage.clientHeight - y) / k;
          ctx.fillStyle = 'rgba(0,0,0,0.13)';
          for (let gx = sx; gx < ex; gx += step) for (let gy = sy; gy < ey; gy += step) ctx.fillRect(gx * k - 0.75, gy * k - 0.75, 1.5, 1.5);
        }
        paintItems(ctx, list, bgRef.current, k, byId, editRef.current && editRef.current.mode !== 'new' ? editRef.current.id : null);
        dirty.current.base = false;
      }
      if (dirty.current.live) {
        const ctx = live.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, live.width, live.height);
        ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
        if (cur.current) drawItem(ctx, cur.current, k, byId);
        if (!editRef.current) {
          const chosen = list.filter(i => selRef.current.includes(i.id));
          if (chosen.length === 1) drawSelection(ctx, chosen[0], k, byId); else if (chosen.length > 1) drawGroupSelection(ctx, chosen, k, byId);
        }
        if (marq.current) drawMarquee(ctx, marq.current, k);
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
    const b = sceneBounds(items.current, bgRef.current, measureText);
    if (!b) { view.current = { x: 24, y: 24, k: 1 }; schedule(); return; }
    const pad = 32, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    const k = clamp(Math.min(stage.clientWidth / w, stage.clientHeight / h), MIN_K, 1.5);
    view.current = { k, x: (stage.clientWidth - (b[2] - b[0]) * k) / 2 - b[0] * k, y: (stage.clientHeight - (b[3] - b[1]) * k) / 2 - b[1] * k };
    schedule(); bump();
  }, [schedule]);

  // ----- load an existing picture (the drawing inside the PNG, or just the picture) + restore a backup -----
  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = [];
      if (imageUrl) {
        try {
          const res = await fetch(imageUrl, { credentials: 'same-origin' });
          if (!res.ok) throw new Error(String(res.status));
          const bytes = new Uint8Array(await res.arrayBuffer());
          const scene = await readScene(bytes);                                 // a PNG drawing (v2 items · v1 strokes)
          const onPhoto = scene ? null : await readFromJpeg(bytes);             // a JPEG: a drawing on a photo
          const list = (onPhoto ? onPhoto.scene : scene)?.items || scene?.strokes;
          if (Array.isArray(list)) loaded = cleanItems(list);
          if (onPhoto?.bg) { const d = await decodePhoto(onPhoto.bg.bytes, onPhoto.bg.mime, false); bgRef.current = d.bg; originalRef.current = d.original; }
          else if (!Array.isArray(list)) {                                      // a plain photo / picture: draw on top of it
            const d = await decodePhoto(bytes, sniffImageType(bytes), true);
            bgRef.current = d.bg; originalRef.current = d.original;
            setLoadNote('เขียนทับรูปได้ — เส้นที่วาดแก้/ลบทีหลังได้ รูปเดิมยังอยู่ครบในไฟล์');
          }
        } catch { if (alive) setError('เปิดรูปไม่สำเร็จ ลองอีกครั้งครับ'); }
      }
      if (!alive) return;
      initialSig.current = sig(loaded);
      items.current = loaded;
      const saved = draftKey ? loadDraft(`sketch:${draftKey}`) : null;
      const backup = cleanItems(saved?.items || saved?.strokes);
      if (backup.length && sig(backup) !== initialSig.current) { items.current = backup; setRestored(true); }
      if (imageUrl && items.current.length) setTool('select');      // an existing drawing is opened to be changed: pick / move / edit text first (✏️ is one tap away)
      setLoading(false); fitView(); bump();
    })();
    return () => { alive = false; if (bgRef.current?.url) URL.revokeObjectURL(bgRef.current.url); };
  }, [imageUrl, draftKey, fitView]);

  // ----- on-device backup while drawing -----
  // saved shortly after each change, AND at once when the page is hidden / left / the pad closes without a successful save
  const closedClean = useRef(false);                    // true once the picture was saved or the drawing was thrown away on purpose
  const writeBackup = useCallback(() => {
    if (!draftKey) return;
    try {
      const json = JSON.stringify({ items: serializeItems(items.current) });
      if (!items.current.length) clearDraft(`sketch:${draftKey}`);
      else if (json.length < MAX_DRAFT_CHARS) saveDraft(`sketch:${draftKey}`, JSON.parse(json));
    } catch { /* ignore */ }
  }, [draftKey]);
  const backupRef = useRef(writeBackup); backupRef.current = writeBackup;
  useEffect(() => {
    if (loading || !draftKey) return undefined;
    const t = setTimeout(() => backupRef.current(), 800);
    return () => clearTimeout(t);
  });                                                           // every render: cheap, and every change re-renders
  useEffect(() => {
    const flush = () => { if (!closedClean.current && !loadingRef.current) backupRef.current(); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  const loadingRef = useRef(loading); loadingRef.current = loading;

  // ----- history -----
  const pushUndo = snapshot => { undo.current.push(snapshot); if (undo.current.length > 200) undo.current.shift(); redo.current = []; version.current++; };
  const commit = next => { pushUndo(items.current); items.current = next; schedule(); bump(); };
  const doUndo = () => { if (!undo.current.length) return; endEdit(false); redo.current.push(items.current); items.current = undo.current.pop(); fixSelection(); version.current++; schedule(); bump(); };
  const doRedo = () => { if (!redo.current.length) return; endEdit(false); undo.current.push(items.current); items.current = redo.current.pop(); fixSelection(); version.current++; schedule(); bump(); };
  const fixSelection = () => { const keep = selRef.current.filter(id => items.current.some(i => i.id === id)); if (keep.length !== selRef.current.length) setSel(keep); };

  // ----- coordinates -----
  const toWorld = (cx, cy) => { const r = stageRef.current.getBoundingClientRect(), { x, y, k } = view.current; return [(cx - r.left - x) / k, (cy - r.top - y) / k]; };
  const tol = () => 12 / view.current.k;
  const pressureOf = e => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5);

  // ----- the text box (new text, a text item, a shape's label) -----
  const openEditor = spec => { setEditing(spec); dirty.current.base = true; schedule(); };
  function endEdit(save = true) {
    const ed = editRef.current; if (!ed) return;
    const text = (taRef.current ? taRef.current.value : ed.text).replace(/\s+$/g, '');
    editRef.current = null; setEditing(null);
    if (!save) { schedule(); return; }
    if (ed.mode === 'new') {
      if (text.trim()) { const it = { k: 'text', id: uid(), c: ed.c, s: ed.size, x: ed.x, y: ed.y, t: text }; commit([...items.current, it]); setSel([it.id]); setTool('select'); }
    } else if (ed.mode === 'text') {
      const it = items.current.find(i => i.id === ed.id);
      if (it) commit(text.trim() ? items.current.map(i => (i.id === ed.id ? { ...i, t: text } : i)) : items.current.filter(i => i.id !== ed.id));
      if (!text.trim()) setSel([]);
    } else if (ed.mode === 'label' || ed.mode === 'dim') {
      commit(items.current.map(i => (i.id === ed.id ? { ...i, t: text } : i)));
    }
    schedule('both');
  }
  useEffect(() => { if (editing && taRef.current) { taRef.current.focus(); taRef.current.setSelectionRange(taRef.current.value.length, taRef.current.value.length); } }, [editing?.id, editing?.mode, editing?.x, editing?.y]);   // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = it => {
    if (it.k === 'text') openEditor({ mode: 'text', id: it.id, x: it.x, y: it.y, text: it.t, size: it.s, c: it.c });
    else if (isShape(it)) openEditor({ mode: 'label', id: it.id, x: it.x, y: it.y, text: it.t || '', size: it.ls || LABEL_SIZE, c: it.c, box: [it.x, it.y, it.bw, it.bh] });
    else if (isDim(it)) { const b = dimLabelBox(it, measureText); const W = Math.max(b[2] - b[0], 140), cx = (b[0] + b[2]) / 2; openEditor({ mode: 'dim', id: it.id, x: cx - W / 2, y: b[1], text: it.t || '', size: dimLabelSize(it), c: it.c, box: [cx - W / 2, b[1], W, b[3] - b[1]] }); }
  };

  // ----- style of the selection (or of what is drawn next) -----
  // `patch` is an object, or a function (item) → object | null, applied to every selected item
  const updateSel = patch => {
    const chosen = selectedItems(); if (!chosen.length) return false;
    const ids = new Set(chosen.map(i => i.id));
    commit(items.current.map(i => { if (!ids.has(i.id)) return i; const p = typeof patch === 'function' ? patch(i) : patch; return p ? { ...i, ...p } : i; }));
    return true;
  };
  const chooseColor = c => { setColor(c); if (selRef.current.length) updateSel({ c }); else if (toolRef.current === 'eraser' || toolRef.current === 'hand') setTool('pen'); };
  const chooseWidth = i => { setWidthIdx(i); setCustomW(null); if (selRef.current.length) updateSel(it => (it.k === 'text' ? { s: Math.round(TEXT_SIZES[i] * unit()) } : isPin(it) ? { r: Math.round(PIN_R[i] * unit()) } : { w: WIDTHS[i] * unit() })); };
  const toggleFill = () => {
    const shapes = selectedItems().filter(isShape);
    if (shapes.length) { const on = !shapes.every(i => i.f); updateSel(i => (isShape(i) ? { f: on } : null)); setFill(on); } else setFill(f => !f);
  };
  const toggleElbow = () => {
    const lines = selectedItems().filter(isLine); if (!lines.length) return;
    const on = !lines.every(i => i.elbow); updateSel(i => (isLine(i) ? { elbow: on } : null));
  };
  const deleteSelected = () => { if (!selRef.current.length) return; commit(removeItems(items.current, selRef.current)); setSel([]); };
  const duplicateSelected = () => {
    if (!selRef.current.length) return;
    const { copies } = duplicateItems(items.current, selRef.current); if (!copies.length) return;
    commit([...items.current, ...copies]); setSel(copies.map(c => c.id));
  };
  const editSelected = () => { const it = selected(); if (editable(it)) startEditing(it); };
  // options that belong to a tool: they apply to the selected items of that kind AND to what is drawn next
  const setDimStyleOpt = v => { updateSel(i => (isDim(i) ? { style: v } : null)); setDimStyle(v); };
  const setTipOpt = v => { updateSel(i => (i.k === 'callout' ? { tipStyle: v } : null)); setTipStyle(v); };
  const setEndsOpt = v => { updateSel(i => (isLine(i) ? { ends: v } : null)); setLineOpts(o => ({ ...o, ends: v })); };
  const setDashOpt = v => { updateSel(i => (isLine(i) ? { dash: v } : null)); setLineOpts(o => ({ ...o, dash: v })); };
  const applySize = v => {
    const val = clamp(v, 1, 200);
    if (selRef.current.length) updateSel(it => (it.k === 'text' ? { s: Math.round(val) } : isPin(it) ? { r: val } : { w: val }));
    if (!selRef.current.length || selectedItems().some(i => i.k !== 'text' && !isPin(i))) setCustomW(val);
  };
  const pickTool = t => { endEdit(); setTool(t); if (t !== 'select') { setSel([]); setMulti(false); } };
  const toggleMulti = () => { endEdit(); const on = !multi; setMulti(on); if (on) setTool('select'); };

  // ----- gestures -----
  const touches = () => [...ptrs.current.values()].filter(v => v.type === 'touch');
  const cancelGesture = () => {                                      // a second finger arrives: whatever one finger had started is abandoned
    const gg = g.current;
    if (gg?.base) { items.current = gg.base; schedule(); }
    cur.current = null; marq.current = null; g.current = null; schedule('live');
  };
  const startPinch = () => {
    const [a, b] = touches();
    g.current = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...view.current } };
  };
  const startPan = e => { g.current = { type: 'pan', pid: e.pointerId, x: e.clientX, y: e.clientY, view: { ...view.current } }; };
  const eraseAt = (cx, cy) => {
    const [wx, wy] = toWorld(cx, cy), r = 14 / view.current.k, list = items.current, byId = byIdMap(list);
    const hit = list.filter(it => hitItem(it, wx, wy, r, byId, measureText));
    if (hit.length) { g.current.base = g.current.base || list; items.current = removeItems(list, hit.map(h => h.id)); fixSelection(); schedule('base'); }
  };
  const startErase = e => { g.current = { type: 'erase', pid: e.pointerId, base: null }; eraseAt(e.clientX, e.clientY); };
  const addPoint = e => {
    const [wx, wy] = toWorld(e.clientX, e.clientY), p = cur.current.p, n = p.length;
    if (n >= 3) { const dx = wx - p[n - 3], dy = wy - p[n - 2]; if (dx * dx + dy * dy < (0.8 / view.current.k) ** 2) return; }
    p.push(Math.round(wx * 10) / 10, Math.round(wy * 10) / 10, Math.round(pressureOf(e) * 100) / 100);
  };
  const unit = () => unitFor(bgRef.current), wNow = () => customWRef.current ?? WIDTHS[widthRef.current] * unit();
  const startDraw = e => {
    cur.current = { k: 'stroke', id: uid(), c: colorRef.current, w: wNow(), tool: toolRef.current === 'marker' ? 'marker' : 'pen', p: [], fromTouch: e.pointerType === 'touch' };
    g.current = { type: 'draw', pid: e.pointerId }; addPoint(e); schedule('live');
  };
  const startShape = e => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    cur.current = { k: toolRef.current, id: uid(), c: colorRef.current, w: wNow(), f: fillRef.current, x, y, bw: 0, bh: 0, t: '', ...(unit() > 1 ? { ls: Math.round(LABEL_SIZE * unit()) } : null), fromTouch: e.pointerType === 'touch' };
    g.current = { type: 'shape', pid: e.pointerId, ox: x, oy: y }; schedule('live');
  };
  const startLine = e => {
    const [x, y] = toWorld(e.clientX, e.clientY), from = shapeAt(items.current, x, y);
    const elbow = toolRef.current === 'elbow';
    cur.current = { k: elbow ? 'arrow' : toolRef.current, id: uid(), c: colorRef.current, w: wNow(), a: [x, y], e: [x, y], from: from ? from.id : null, to: null, elbow, ...(lineOptsRef.current.ends ? { ends: lineOptsRef.current.ends } : null), ...(lineOptsRef.current.dash ? { dash: true } : null), fromTouch: e.pointerType === 'touch' };
    g.current = { type: 'line', pid: e.pointerId, from: from ? from.id : null }; schedule('live');
  };
  // a measured distance: drag from one point to the other, then type what it measures
  const startDim = e => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    cur.current = { k: 'dim', id: uid(), c: colorRef.current, w: wNow(), a: [x, y], e: [x, y], style: dimStyleRef.current, off: Math.round(48 * unit()), t: '', fromTouch: e.pointerType === 'touch' };
    g.current = { type: 'dim', pid: e.pointerId }; schedule('live');
  };
  // a callout: press on the spot to point at, drag to where its box should sit
  const startCallout = e => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    const u = unit(), bw = Math.round(CALLOUT_W * u), bh = Math.round(CALLOUT_H * u);
    cur.current = { k: 'callout', id: uid(), c: colorRef.current, w: wNow(), f: true, x: x - bw / 2, y: y - 80 * u - bh / 2, bw, bh, t: '', ...(u > 1 ? { ls: Math.round(LABEL_SIZE * u) } : null), tip: [x, y], tipStyle: tipStyleRef.current, fromTouch: e.pointerType === 'touch' };
    g.current = { type: 'callout', pid: e.pointerId, tx: x, ty: y, moved: false, bw, bh }; schedule('live');
  };
  const startSelect = e => {
    const [x, y] = toWorld(e.clientX, e.clientY), list = items.current, byId = byIdMap(list), t = 14 / view.current.k;
    const sel = selected();
    if (sel && isShape(sel)) {                                          // a corner handle of the selected shape?
      for (const [which, [hx, hy]] of Object.entries(cornerPoints(sel))) if (Math.hypot(hx - x, hy - y) <= t) { g.current = { type: 'resize', pid: e.pointerId, base: list, id: sel.id, which, orig: sel }; return; }
    }
    if (sel && sel.k === 'callout' && Math.hypot(sel.tip[0] - x, sel.tip[1] - y) <= t) { g.current = { type: 'tip', pid: e.pointerId, base: list, id: sel.id, orig: sel }; return; }
    if (sel && isDim(sel)) {                                            // an end of the measured line, or (plan style) its offset handle
      if (Math.hypot(sel.a[0] - x, sel.a[1] - y) <= t) { g.current = { type: 'dimend', pid: e.pointerId, base: list, id: sel.id, which: 'a', orig: sel }; return; }
      if (Math.hypot(sel.e[0] - x, sel.e[1] - y) <= t) { g.current = { type: 'dimend', pid: e.pointerId, base: list, id: sel.id, which: 'e', orig: sel }; return; }
      if (sel.style === 'plan') { const [hx, hy] = dimOffsetHandle(sel); if (Math.hypot(hx - x, hy - y) <= t) { g.current = { type: 'dimoff', pid: e.pointerId, base: list, id: sel.id, orig: sel }; return; } }
    }
    if (sel && isLine(sel)) {                                           // an end of the selected line / arrow?
      const [ax, ay, ex, ey] = lineEnds(sel, byId);
      if (Math.hypot(ax - x, ay - y) <= t) { g.current = { type: 'endpoint', pid: e.pointerId, base: list, id: sel.id, which: 'a', orig: sel }; return; }
      if (Math.hypot(ex - x, ey - y) <= t) { g.current = { type: 'endpoint', pid: e.pointerId, base: list, id: sel.id, which: 'e', orig: sel }; return; }
    }
    const hit = topItemAt(list, x, y, tol(), measureText) || shapeAt(list, x, y);       // an empty shape can be picked from inside too (double-tap there to type its label)
    const toggle = multiRef.current || e.shiftKey || e.ctrlKey || e.metaKey, ids = selRef.current;
    if (!hit) {
      lastTap.current = { id: null, t: 0 };
      if (multiRef.current || e.pointerType !== 'touch') {                              // mouse / pen / multi mode: drag a box across items (a phone finger drags the board)
        marq.current = [x, y, x, y]; g.current = { type: 'marquee', pid: e.pointerId, add: toggle, keep: ids }; schedule('live'); return;
      }
      setSel([]); startPan(e); return;                                                  // empty space: drag moves the board
    }
    const wasIn = ids.includes(hit.id);
    const double = !toggle && ids.length <= 1 && lastTap.current.id === hit.id && Date.now() - lastTap.current.t < DOUBLE_TAP_MS && editable(hit);
    lastTap.current = { id: hit.id, t: Date.now() };
    let move = ids, narrow = false, toggleOff = false;
    if (toggle) { if (wasIn) toggleOff = true; else move = [...ids, hit.id]; }
    else if (wasIn && ids.length > 1) narrow = true;                                    // a tap on one of several narrows to it; a drag moves them all
    else move = [hit.id];
    if (!narrow && !toggleOff) setSel(move);
    g.current = { type: 'move', pid: e.pointerId, base: list, id: hit.id, ids: move, sx: x, sy: y, moved: false, double, narrow, toggleOff, tapEdit: wasIn && ids.length === 1 && hit.k === 'text' && !toggle };
  };
  // a finger on a tablet that has a pen only taps (a drag moves the board): tap = select, double-tap = edit the text / label
  const tapSelect = e => {
    const [x, y] = toWorld(e.clientX, e.clientY), list = items.current;
    const hit = topItemAt(list, x, y, tol(), measureText) || shapeAt(list, x, y);
    if (!hit) { lastTap.current = { id: null, t: 0 }; if (selRef.current.length && !multiRef.current) setSel([]); return; }
    const double = lastTap.current.id === hit.id && Date.now() - lastTap.current.t < DOUBLE_TAP_MS + 150 && editable(hit);
    lastTap.current = { id: hit.id, t: Date.now() };
    if (double) { setSel([hit.id]); startEditing(hit); return; }
    const ids = selRef.current;
    if (multiRef.current) setSel(ids.includes(hit.id) ? ids.filter(i => i !== hit.id) : [...ids, hit.id]); else setSel([hit.id]);
  };
  const placeText = e => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    openEditor({ mode: 'new', id: 'new', x, y, text: '', size: Math.round(TEXT_SIZES[widthRef.current] * unit()), c: colorRef.current });
  };
  const startTool = e => {
    const tl = toolRef.current;
    if (tl === 'hand' || (e.pointerType === 'mouse' && (e.button === 1 || space.current))) return startPan(e);
    if (tl === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32))) return startErase(e);
    if (tl === 'select') return startSelect(e);
    if (tl === 'rect' || tl === 'ellipse' || tl === 'diamond') return startShape(e);
    if (tl === 'line' || tl === 'arrow' || tl === 'elbow') return startLine(e);
    if (tl === 'dim') return startDim(e);
    if (tl === 'callout') return startCallout(e);
    if (tl === 'pin') { g.current = { type: 'pin', pid: e.pointerId, x: e.clientX, y: e.clientY }; return; }     // placed when the pointer lifts, so a drag / second finger is not a stray pin
    if (tl === 'text') { g.current = { type: 'text', pid: e.pointerId, x: e.clientX, y: e.clientY }; return; }     // the box opens when the finger lifts (a phone only raises the keyboard inside a tap)
    return startDraw(e);
  };

  const onDown = e => {
    e.preventDefault();
    if (loadNote) setLoadNote('');
    if (editRef.current) endEdit(true);
    if (e.pointerType === 'pen') penSeen.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType !== 'touch') {                                  // pen or mouse: always acts, whatever else is on the glass
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      if (g.current) cancelGesture();
      return startTool(e);
    }
    // a finger
    if (g.current?.type === 'draw' && !cur.current?.fromTouch) return;                   // the pen is writing: a resting palm is ignored
    if (penSeen.current) {                                              // tablet with a pen: fingers only move / zoom the board
      if (touches().length >= 2) { if (g.current) cancelGesture(); startPinch(); } else if (touches().length === 1 && !g.current) { startPan(e); if (toolRef.current === 'select') g.current.tap = true; }
      return;
    }
    if (touches().length >= 2) { cancelGesture(); startPinch(); return; }
    if (g.current?.type === 'pinch' || g.current?.type === 'wait') return;
    startTool(e);
  };

  const onMove = e => {
    const rec = ptrs.current.get(e.pointerId); if (!rec) return;
    rec.x = e.clientX; rec.y = e.clientY;
    const gg = g.current; if (!gg) return;
    if (gg.type === 'pinch' && touches().length >= 2) {
      const [a, b] = touches();
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const k = clamp(gg.view.k * d / gg.d, MIN_K, MAX_K), r = stageRef.current.getBoundingClientRect();
      const wx = (gg.cx - r.left - gg.view.x) / gg.view.k, wy = (gg.cy - r.top - gg.view.y) / gg.view.k;       // the world point that was under the fingers
      view.current = { k, x: cx - r.left - wx * k, y: cy - r.top - wy * k }; schedule();
      return;
    }
    if (e.pointerId !== gg.pid) return;
    if (gg.type === 'draw' && cur.current) {
      const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const ev of (list.length ? list : [e])) addPoint(ev);
      schedule('live');
    } else if (gg.type === 'erase') eraseAt(e.clientX, e.clientY);
    else if (gg.type === 'pan') { view.current = { ...view.current, x: gg.view.x + e.clientX - gg.x, y: gg.view.y + e.clientY - gg.y }; schedule(); }
    else if (gg.type === 'shape' && cur.current) {
      const [x, y] = toWorld(e.clientX, e.clientY);
      Object.assign(cur.current, { x: Math.min(gg.ox, x), y: Math.min(gg.oy, y), bw: Math.abs(x - gg.ox), bh: Math.abs(y - gg.oy) }); schedule('live');
    } else if (gg.type === 'line' && cur.current) { cur.current.e = toWorld(e.clientX, e.clientY); schedule('live'); }
    else if (gg.type === 'dim' && cur.current) { cur.current.e = toWorld(e.clientX, e.clientY); schedule('live'); }
    else if (gg.type === 'callout' && cur.current) {
      const [x, y] = toWorld(e.clientX, e.clientY);
      if (Math.hypot(x - gg.tx, y - gg.ty) * view.current.k >= 12) gg.moved = true;
      if (gg.moved) { cur.current.x = x - gg.bw / 2; cur.current.y = y - gg.bh / 2; } schedule('live');
    } else if (gg.type === 'tip') { const [x, y] = toWorld(e.clientX, e.clientY); gg.moved = true; items.current = gg.base.map(i => (i.id === gg.id ? { ...gg.orig, tip: [x, y] } : i)); schedule(); }
    else if (gg.type === 'dimend') { const [x, y] = toWorld(e.clientX, e.clientY); gg.moved = true; items.current = gg.base.map(i => (i.id === gg.id ? { ...gg.orig, [gg.which]: [x, y] } : i)); schedule(); }
    else if (gg.type === 'dimoff') { const [x, y] = toWorld(e.clientX, e.clientY); gg.moved = true; items.current = gg.base.map(i => (i.id === gg.id ? { ...gg.orig, off: Math.round(dimOffsetFor(gg.orig, x, y)) } : i)); schedule(); }
    else if (gg.type === 'marquee' && marq.current) { const [x, y] = toWorld(e.clientX, e.clientY); marq.current = [marq.current[0], marq.current[1], x, y]; schedule('live'); }
    else if (gg.type === 'move') {
      const [x, y] = toWorld(e.clientX, e.clientY), dx = x - gg.sx, dy = y - gg.sy;
      if (!gg.moved && Math.hypot(dx, dy) * view.current.k < 4) return;                   // a tap is not a drag
      gg.moved = true; items.current = translateMany(gg.base, gg.ids, dx, dy); schedule();
    } else if (gg.type === 'resize') {
      const [x, y] = toWorld(e.clientX, e.clientY); gg.moved = true;
      items.current = gg.base.map(i => (i.id === gg.id ? resizeShape(gg.orig, gg.which, x, y) : i)); schedule();
    } else if (gg.type === 'endpoint') {
      const [x, y] = toWorld(e.clientX, e.clientY); gg.moved = true;
      const other = gg.which === 'a' ? gg.orig.to : gg.orig.from, hit = shapeAt(gg.base, x, y, other);
      const patch = gg.which === 'a' ? { a: [x, y], from: hit ? hit.id : null } : { e: [x, y], to: hit ? hit.id : null };
      items.current = gg.base.map(i => (i.id === gg.id ? { ...gg.orig, ...patch } : i)); schedule();
    }
  };

  const onUp = e => {
    ptrs.current.delete(e.pointerId);
    const gg = g.current;
    if (gg && e.pointerId === gg.pid) {
      g.current = null;
      if (gg.type === 'draw' && cur.current) {
        const st = cur.current; cur.current = null;
        if (st.p.length >= 3) { delete st.fromTouch; commit([...items.current, st]); } else schedule('live');
      } else if (gg.type === 'erase') { if (gg.base) { const after = items.current; items.current = gg.base; commit(after); } }
      else if (gg.type === 'shape' && cur.current) {
        const s = cur.current; cur.current = null; delete s.fromTouch;
        if (s.bw < 8 && s.bh < 8) { const bw = s.k === 'diamond' ? 140 : 160, bh = 100; Object.assign(s, { x: gg.ox - bw / 2, y: gg.oy - bh / 2, bw, bh }); }
        s.bw = Math.max(s.bw, 12); s.bh = Math.max(s.bh, 12);
        commit([...items.current, s]); setSel([s.id]); setTool('select');
      } else if (gg.type === 'line' && cur.current) {
        const l = cur.current; cur.current = null; delete l.fromTouch;
        const to = shapeAt(items.current, l.e[0], l.e[1], gg.from);
        if (Math.hypot(l.e[0] - l.a[0], l.e[1] - l.a[1]) * view.current.k < 12) schedule('live');
        else { l.to = to ? to.id : null; commit([...items.current, l]); setSel([l.id]); setTool('select'); }
      } else if (gg.type === 'dim' && cur.current) {
        const d = cur.current; cur.current = null; delete d.fromTouch;
        if (Math.hypot(d.e[0] - d.a[0], d.e[1] - d.a[1]) * view.current.k < 12) schedule('live');
        else { commit([...items.current, d]); setSel([d.id]); setTool('select'); setTimeout(() => startEditing(d), 0); }      // the label is typed straight away
      } else if (gg.type === 'callout' && cur.current) {
        const c = cur.current; cur.current = null; delete c.fromTouch;
        commit([...items.current, c]); setSel([c.id]); setTool('select'); setTimeout(() => startEditing(c), 0);
      } else if (gg.type === 'pin') {
        if (Math.hypot(e.clientX - gg.x, e.clientY - gg.y) < 12) {
          const [x, y] = toWorld(gg.x, gg.y), r = Math.round(PIN_R[widthRef.current] * unit());
          commit([...items.current, { k: 'pin', id: uid(), c: colorRef.current, x, y, n: nextPinNumber(items.current), r }]);          // the tool stays on: tap again for the next number
        }
      } else if (gg.type === 'text') {
        if (Math.hypot(e.clientX - gg.x, e.clientY - gg.y) < 12) placeText(e);
      } else if (gg.type === 'pan' && gg.tap) {
        if (Math.hypot(e.clientX - gg.x, e.clientY - gg.y) < 8) tapSelect(e);
      } else if (gg.type === 'marquee') {
        const r = marq.current; marq.current = null;
        if (r && Math.hypot(r[2] - r[0], r[3] - r[1]) * view.current.k >= 6) {
          const inside = itemsInRect(items.current, r, measureText);
          setSel(gg.add ? [...new Set([...gg.keep, ...inside])] : inside);
        } else if (!gg.add) setSel([]);
      } else if (gg.type === 'move' || gg.type === 'resize' || gg.type === 'endpoint' || gg.type === 'tip' || gg.type === 'dimend' || gg.type === 'dimoff') {
        if (gg.moved) { const after = items.current; items.current = gg.base; commit(after); }
        else if (gg.type === 'move') {
          if (gg.toggleOff) setSel(selRef.current.filter(id => id !== gg.id));
          else if (gg.narrow) setSel([gg.id]);
          else if (gg.double || gg.tapEdit) { const it = items.current.find(i => i.id === gg.id); if (it) startEditing(it); }
        }
      }
    } else if (gg?.type === 'pinch' && touches().length < 2) g.current = touches().length ? { type: 'wait' } : null;
    if (g.current?.type === 'wait' && touches().length === 0) g.current = null;
    schedule('live'); bump();
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
    view.current = { k: nk, x: cx - (cx - x) * nk / k, y: cy - (cy - y) * nk / k }; schedule(); bump();
  };

  // ----- keys / closing -----
  const changed = () => sig(items.current) !== initialSig.current;
  const cancel = () => { if (saving) return; endEdit(false); if (items.current.length && changed() && !confirm('ทิ้งสิ่งที่วาดไว้ใช่ไหมครับ?')) return; if (draftKey) clearDraft(`sketch:${draftKey}`); closedClean.current = true; onCancel(); };
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  useEffect(() => {
    const typing = () => /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    const down = e => {
      if (e.key === ' ' && !typing()) { space.current = true; e.preventDefault(); }
      if (e.key === 'Escape') { if (editRef.current) endEdit(false); else if (selRef.current.length) setSel([]); else cancelRef.current(); }
      if ((e.key === 'Enter' || e.key === 'F2') && !typing() && !editRef.current) { const it = selected(); if (editable(it)) { e.preventDefault(); startEditing(it); } }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing() && selRef.current.length) { e.preventDefault(); deleteSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing()) { e.preventDefault(); setTool('select'); setSel(items.current.map(i => i.id)); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing()) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing() && selRef.current.length) { e.preventDefault(); duplicateSelected(); }
    };
    const up = e => { if (e.key === ' ') space.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  // ----- save -----
  async function save() {
    if (saving) return;
    endEdit(true);
    if (!items.current.length) return;
    setSaving(true); setError('');
    const failed = () => { closedClean.current = false; writeBackup(); setError('บันทึกไม่สำเร็จ — ที่วาดยังอยู่ ลองกด ✓ อีกครั้งครับ'); setSaving(false); };
    try {
      const blob = bgRef.current ? await exportOnPhoto(items.current, bgRef.current, originalRef.current) : await exportPng(items.current, null);
      if (!blob) throw new Error('export');
      closedClean.current = true;                    // set BEFORE handing over: a successful save closes this pad, and the pad must not re-back-up on its way out
      const ok = await onSave(blob);
      if (ok === false) return failed();             // (the drawing is written to the backup right here, whether or not the pad is still on screen)
      if (draftKey) clearDraft(`sketch:${draftKey}`);
    } catch { failed(); }
  }

  if (process.env.NEXT_PUBLIC_MOCK_MODE === '1' && typeof window !== 'undefined') window.__sketchItems = () => serializeItems(items.current);   // test hook (local mock mode only)

  const n = items.current.length, sel = selected(), chosen = selectedItems();
  const chosenShapes = chosen.filter(isShape), chosenLines = chosen.filter(isLine);
  const shownColor = chosen.length ? (chosen.every(i => i.c === chosen[0].c) ? chosen[0].c : null) : color;
  const shownFill = chosenShapes.length ? chosenShapes.every(i => i.f) : fill;
  // ----- the grouped toolbar: groups open while they fit, fold into one button each when they do not -----
  const barRef = useRef(null), groupsRef = useRef(null), barW = useRef(0);
  const [lay, setLay] = useState(ALL_OPEN);
  const [openGroup, setOpenGroup] = useState(null);
  const [lastTool, setLastTool] = useState({ draw: 'pen', shape: 'rect', mark: 'dim', edit: 'select' });
  useEffect(() => { const g = GROUPS.find(x => x.tools.some(t => t[0] === tool)); if (g) setLastTool(m => (m[g.id] === tool ? m : { ...m, [g.id]: tool })); }, [tool]);
  useLayoutEffect(() => {
    const bar = barRef.current, grp = groupsRef.current; if (!bar || !grp) return;
    const w = bar.clientWidth;
    if (barW.current !== w) { barW.current = w; if (lay !== ALL_OPEN) { setLay(ALL_OPEN); return; } }       // the width changed: start again from "everything open"
    if (bar.scrollWidth <= bar.clientWidth + 1 && grp.scrollWidth <= grp.clientWidth + 1) return;               // it fits
    const next = COLLAPSE_ORDER.find(id => lay.expand[id]);
    if (next) { setLay({ ...lay, expand: { ...lay.expand, [next]: false } }); return; }
    if (!lay.wrap) { setLay({ expand: ALL_OPEN.expand, wrap: true, stack: false }); return; }                  // even all folded does not fit: the groups get a second line
    if (!lay.stack) setLay({ ...lay, stack: true });                                                           // still not: the buttons share the line, the name under the icon
  });
  useEffect(() => {                                                          // a tap outside the open group's panel closes it
    if (!openGroup) return undefined;
    const down = e => { if (!(e.target instanceof Element) || !e.target.closest('.sk-pop, .sk-chip')) setOpenGroup(null); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [openGroup]);
  useEffect(() => { if (lay.expand && openGroup && lay.expand[openGroup]) setOpenGroup(null); }, [lay, openGroup]);

  const toolBtn = (key, icon, label, pop) => (
    <button key={key} type="button" className={`sk-btn${tool === key ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={tool === key}
      onClick={() => { pickTool(key); if (pop) setOpenGroup(null); }}>{icon}{pop && <span className="sk-lbl">{label}</span>}</button>
  );
  // what the thin options bar shows: the options of the selected items' kind, else of the tool in hand
  const optKinds = new Set(chosen.map(i => (isDim(i) ? 'dim' : i.k === 'callout' ? 'callout' : isLine(i) ? 'line' : 'other')));
  const toolKind = tool === 'dim' ? 'dim' : tool === 'callout' ? 'callout' : (tool === 'line' || tool === 'arrow' || tool === 'elbow') ? 'line' : null;
  const optKind = chosen.length ? (optKinds.size === 1 && !optKinds.has('other') ? [...optKinds][0] : null) : toolKind;
  const dimNow = chosen.some(isDim) ? (chosen.filter(isDim).every(d => d.style === 'plan') ? 'plan' : 'simple') : dimStyle;
  const tipNow = chosen.some(i => i.k === 'callout') ? (chosen.filter(i => i.k === 'callout').every(d => d.tipStyle === 'dot') ? 'dot' : 'arrow') : tipStyle;
  const toolEnds = tool === 'line' ? 'none' : 'end';
  const endsNow = chosenLines.length ? (chosenLines.every(l => endsOf(l) === endsOf(chosenLines[0])) ? endsOf(chosenLines[0]) : null) : (lineOpts.ends || toolEnds);
  const dashNow = chosenLines.length ? chosenLines.every(l => l.dash) : lineOpts.dash;
  const sizeDerived = chosen.length ? Math.round(chosen[0].k === 'text' ? chosen[0].s : isPin(chosen[0]) ? chosen[0].r : chosen[0].w) : Math.round(customW ?? WIDTHS[widthIdx] * unitFor(bgRef.current));
  const groupBody = (g, pop) => {
    if (g.id === 'style') return (
      <>
        {INK.map(c => <button key={c} type="button" className={`sk-dot${shownColor === c ? ' on' : ''}`} style={{ background: c }} title="สี" aria-label={`สี ${c}`} aria-pressed={shownColor === c} onClick={() => chooseColor(c)} />)}
        {WIDTHS.map((w, i) => <button key={w} type="button" className={`sk-btn${widthIdx === i && customW === null ? ' on' : ''}`} title={`ขนาดเส้น/ตัวอักษร ${i + 1}`} aria-label={`ขนาด ${i + 1}`} aria-pressed={widthIdx === i && customW === null} onClick={() => chooseWidth(i)}><span className="sk-w" style={{ width: 6 + i * 4, height: 6 + i * 4 }} /></button>)}
        <input type="number" className="sk-num" min="1" max="200" inputMode="numeric" title="กำหนดขนาดเส้นเอง (ตัวเลข) — ใช้กับที่เลือกอยู่และที่วาดต่อไป" aria-label="ขนาดเส้น (ตัวเลข)"
          value={sizeText ?? sizeDerived} onChange={e => { setSizeText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 1) applySize(v); }} onBlur={() => setSizeText(null)} />
        <button type="button" className={`sk-btn${shownFill ? ' on' : ''}`} title="เติมสีอ่อนในรูปทรง" aria-label="เติมสี" aria-pressed={!!shownFill} onClick={toggleFill}>{ICON.fill}</button>
        <button type="button" className={`sk-btn${chosenLines.length && chosenLines.every(i => i.elbow) ? ' on' : ''}`} title="เส้น/ลูกศรที่เลือก: หักมุมฉาก ⇄ ตรง" aria-label="หักมุม" aria-pressed={!!(chosenLines.length && chosenLines.every(i => i.elbow))} disabled={!chosenLines.length} onClick={toggleElbow}>⌐</button>
      </>
    );
    const own = g.tools.map(([key, icon, label]) => toolBtn(key, icon, label, pop));
    if (g.id === 'mark') return own;
    if (g.id === 'edit') return (
      <>
        {own}
        <button type="button" className={`sk-btn${multi ? ' on' : ''}`} title="เลือกหลายชิ้น" aria-label="เลือกหลายชิ้น" aria-pressed={multi} onClick={toggleMulti}>☑{pop && <span className="sk-lbl">เลือกหลายชิ้น</span>}</button>
        <button type="button" className="sk-btn" title="แก้ข้อความในรูป/กล่องข้อความที่เลือก" aria-label="แก้ข้อความ" disabled={!editable(sel)} onClick={editSelected}>✎{pop && <span className="sk-lbl">แก้ข้อความ</span>}</button>
        <button type="button" className="sk-btn" title="ทำสำเนา" aria-label="ทำสำเนา" disabled={!chosen.length} onClick={duplicateSelected}>⧉{pop && <span className="sk-lbl">ทำสำเนา</span>}</button>
        <button type="button" className="sk-btn" title="ลบที่เลือก" aria-label="ลบที่เลือก" disabled={!chosen.length} onClick={deleteSelected}>🗑️{pop && <span className="sk-lbl">ลบ</span>}</button>
        <button type="button" className="sk-btn sk-zoom" title="ซูมออก" aria-label="ซูมออก" onClick={() => zoomBy(0.8)}>−</button>
        <button type="button" className="sk-btn sk-zoom" title="ซูมเข้า" aria-label="ซูมเข้า" onClick={() => zoomBy(1.25)}>＋</button>
        <button type="button" className="sk-btn" title="ดูทั้งหมด" aria-label="ดูทั้งหมด" onClick={fitView}>⤢{pop && <span className="sk-lbl">ดูทั้งหมด</span>}</button>
      </>
    );
    return own;
  };
  const chipFace = g => {
    if (g.id === 'style') return <span className="sk-ico"><span className="sk-dotmini" style={{ background: shownColor || color }} /></span>;
    const key = lastTool[g.id] || g.tools[0][0], t = g.tools.find(x => x[0] === key) || g.tools[0];
    return <span className="sk-ico">{t[1]}</span>;
  };

  const stop = e => e.stopPropagation();
  const { x: vx, y: vy, k: vk } = view.current;
  const ta = editing && (() => {
    if (editing.mode === 'dim' && editing.box) {
      const [bx, by, bw, bh] = editing.box, fs = editing.size * vk;
      return { left: vx + bx * vk, top: vy + by * vk, width: bw * vk, height: bh * vk, fontSize: fs, fontWeight: 700, textAlign: 'center', paddingTop: Math.max(2, (bh * vk - fs * 1.3) / 2), color: editing.c };
    }
    if (editing.mode === 'label' && editing.box) {
      const [bx, by, bw, bh] = editing.box, ls = editing.size || LABEL_SIZE, lh = ls * 1.3 * vk;
      return { left: vx + bx * vk, top: vy + by * vk, width: bw * vk, height: bh * vk, fontSize: ls * vk, textAlign: 'center', paddingTop: Math.max(2, (bh * vk - lh) / 2), color: editing.c };
    }
    return { left: vx + editing.x * vk, top: vy + editing.y * vk, minWidth: 80, width: Math.max(120, 260 * vk), height: editing.size * 1.3 * vk * 2.2, fontSize: editing.size * vk, color: editing.c };
  })();
  return createPortal(
    <div className="sketch-overlay" role="dialog" aria-modal="true" aria-label="เขียนด้วยมือ" onMouseDown={stop} onPointerDown={stop} onClick={stop}>
      <div className={`sketch-bar${lay.wrap ? ' wrap' : ''}${lay.stack ? ' stack' : ''}`} ref={barRef}>
        <div className="sk-fixed">
          <button type="button" className="sk-btn" title="ปิด (ทิ้งที่วาด)" aria-label="ปิด" onClick={cancel}>✕</button>
          <button type="button" className="sk-btn" title="เลิกทำ" aria-label="เลิกทำ" disabled={!undo.current.length} onClick={doUndo}>↶</button>
          <button type="button" className="sk-btn" title="ทำซ้ำ" aria-label="ทำซ้ำ" disabled={!redo.current.length} onClick={doRedo}>↷</button>
        </div>
        <div className="sk-groups" ref={groupsRef}>
          {GROUPS.map(g => (lay.expand[g.id]
            ? <div key={g.id} className="sk-grp" role="group" aria-label={g.label} data-group={g.id}>{groupBody(g, false)}</div>
            : (
              <button key={g.id} type="button" className={`sk-chip${openGroup === g.id ? ' open' : ''}${g.tools.some(t => t[0] === tool) ? ' cur' : ''}`} aria-label={`กลุ่ม ${g.label}`} aria-expanded={openGroup === g.id} data-group={g.id}
                onClick={() => setOpenGroup(v => (v === g.id ? null : g.id))}>
                {chipFace(g)}<span className="sk-cap">{g.label}</span><span className="sk-caret" aria-hidden="true">▾</span>
              </button>
            )))}
        </div>
        <button type="button" className="sk-btn sk-save" title="บันทึก" aria-label="บันทึก" disabled={saving || loading || n === 0} onClick={save}>{saving ? '…' : '✓'}</button>
        {openGroup && !lay.expand[openGroup] && (
          <div className="sk-pop" role="group" aria-label={GROUPS.find(g => g.id === openGroup)?.label}>
            <div className="sk-pop-t">{GROUPS.find(g => g.id === openGroup)?.label}</div>
            {groupBody(GROUPS.find(g => g.id === openGroup), true)}
          </div>
        )}
      </div>
      {/* one fixed-height line, so the board never jumps when the tool (and its hint) changes */}
      <div className={`sketch-hint${error ? ' err' : (restored || loadNote) ? ' note' : ''}`} role="status">{error || loadNote || (restored ? '📝 กู้คืนที่วาดค้างไว้ให้แล้ว' : (multi ? HINTS.multi : HINTS[tool]) || '')}</div>
      <div className={`sketch-stage tool-${tool}`} ref={stageRef} data-strokes={n} data-tool={tool} data-selected={sel ? sel.k : ''} data-selcount={chosen.length} data-loading={loading ? '1' : '0'} data-bg={bgRef.current ? '1' : '0'}
        data-view={`${Math.round(vx)},${Math.round(vy)},${vk.toFixed(3)}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
        <canvas ref={baseRef} className="sketch-canvas" />
        <canvas ref={liveRef} className="sketch-canvas sketch-live" />
        {editing && (
          <textarea ref={taRef} className="sketch-text-edit" style={{ ...ta, fontFamily: FONT }} defaultValue={editing.text} placeholder={editing.mode === 'dim' ? 'ตัวเลข + หน่วย เช่น 3.50 ม.' : editing.mode === 'label' ? 'ข้อความในรูปทรง' : 'พิมพ์ข้อความ'}
            aria-label="ข้อความ" onPointerDown={stop} onMouseDown={stop} onClick={stop}
            onBlur={() => endEdit(true)} onKeyDown={ev => { if (ev.key === 'Escape') { ev.stopPropagation(); endEdit(false); } }} />
        )}
        {optKind && (
          <div className="sk-opts" role="group" aria-label="ตัวเลือกของเครื่องมือ" onPointerDown={stop} onMouseDown={stop} onClick={stop}>
            {optKind === 'dim' && (<>
              <span className="sk-opts-t">เส้นวัดระยะ</span>
              <button type="button" className={`sk-opt${dimNow === 'simple' ? ' on' : ''}`} aria-label="วัดระยะแบบง่าย" aria-pressed={dimNow === 'simple'} onClick={() => setDimStyleOpt('simple')}>{ICON.dim}<span>แบบง่าย</span></button>
              <button type="button" className={`sk-opt${dimNow === 'plan' ? ' on' : ''}`} aria-label="วัดระยะแบบแบบแปลน" aria-pressed={dimNow === 'plan'} onClick={() => setDimStyleOpt('plan')}>{ICON.dimPlan}<span>แบบแปลน</span></button>
            </>)}
            {optKind === 'callout' && (<>
              <span className="sk-opts-t">ปลายชี้</span>
              <button type="button" className={`sk-opt${tipNow === 'arrow' ? ' on' : ''}`} aria-label="ปลายชี้เป็นลูกศร" aria-pressed={tipNow === 'arrow'} onClick={() => setTipOpt('arrow')}>{ICON.tipArrow}<span>ลูกศร</span></button>
              <button type="button" className={`sk-opt${tipNow === 'dot' ? ' on' : ''}`} aria-label="ปลายชี้เป็นจุดกลม" aria-pressed={tipNow === 'dot'} onClick={() => setTipOpt('dot')}>{ICON.tipDot}<span>จุดกลม</span></button>
            </>)}
            {optKind === 'line' && (<>
              <span className="sk-opts-t">ปลาย</span>
              {[['none', 'ปลายไม่มีหัว', ICON.endsNone], ['end', 'ปลายลูกศร', ICON.endsEnd], ['both', 'ปลายลูกศรสองข้าง', ICON.endsBoth], ['dot', 'ปลายจุดกลม', ICON.endsDot]].map(([v, label, ic]) => (
                <button key={v} type="button" className={`sk-opt icon${endsNow === v ? ' on' : ''}`} title={label} aria-label={label} aria-pressed={endsNow === v} onClick={() => setEndsOpt(v)}>{ic}</button>
              ))}
              <span className="sk-opts-t sep">เส้น</span>
              <button type="button" className={`sk-opt icon${!dashNow ? ' on' : ''}`} title="เส้นทึบ" aria-label="เส้นทึบ" aria-pressed={!dashNow} onClick={() => setDashOpt(false)}>{ICON.solid}</button>
              <button type="button" className={`sk-opt icon${dashNow ? ' on' : ''}`} title="เส้นประ" aria-label="เส้นประ" aria-pressed={!!dashNow} onClick={() => setDashOpt(true)}>{ICON.dashed}</button>
            </>)}
          </div>
        )}
        {loading && <div className="sketch-loading">กำลังเปิด…</div>}
      </div>
    </div>,
    document.body
  );
}
