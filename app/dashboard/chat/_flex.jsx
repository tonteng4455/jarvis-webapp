'use client';
// app/dashboard/chat/_flex.jsx — draws the bot's LINE messages in the web chat.
//   <BotMessage message onAction />  : a LINE message object ({ type: 'text' | 'flex', quickReply? }) → bubbles
//   <QuickReplies items onAction />  : the buttons under the last answer
// Only what the bot actually uses is drawn: flex bubble / carousel, box (vertical · horizontal · baseline), text, button, image, separator,
// filler; actions postback / message / uri / datetimepicker. onAction({ kind: 'postback' | 'message' | 'uri', ... }) tells the chat what was tapped.

const TEXT_PX = { xxs: 11, xs: 12.5, sm: 14, md: 16, lg: 18.5, xl: 21, xxl: 27, '3xl': 33, '4xl': 38, '5xl': 44 };
const SPACE_PX = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const RADIUS_PX = { none: 0, xs: 3, sm: 6, md: 10, lg: 15, xl: 20, xxl: 25 };
const BUBBLE_W = { nano: 120, micro: 160, kilo: 210, mega: 300, giga: 340 };
const IMG_W = { xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, '3xl': 180, '4xl': 200, '5xl': 220 };

const px = (v, table) => (v === undefined || v === null ? undefined : typeof v === 'number' ? v : table && v in table ? table[v] : /^-?\d+(\.\d+)?px$/.test(String(v)) ? parseFloat(v) : /%$/.test(String(v)) ? v : undefined);

// the page the bot's LIFF link points at ("…?to=%2Fdashboard%2Ftoday") → a path of this app; anything else stays a normal link
export function uriTarget(uri) {
  try {
    const u = new URL(uri);
    if (/liff\.line\.me$/.test(u.hostname)) { const to = u.searchParams.get('to'); return to && to.startsWith('/') ? { path: to } : { path: '/dashboard/chat' }; }
    if (typeof window !== 'undefined' && u.origin === window.location.origin) return { path: u.pathname + u.search };
  } catch { /* not a URL */ }
  return { url: uri };
}

function actionOf(action, onAction) {
  if (!action) return null;
  if (action.type === 'postback') return () => onAction({ kind: 'postback', data: action.data, label: action.displayText || action.label || '', silent: !(action.displayText || action.label) });
  if (action.type === 'message') return () => onAction({ kind: 'message', text: action.text });
  if (action.type === 'uri') return () => onAction({ kind: 'uri', ...uriTarget(action.uri) });
  return null;
}

function Text({ n, parentLayout, onAction }) {
  const style = {
    fontSize: px(n.size || 'md', TEXT_PX), color: n.color, fontWeight: n.weight === 'bold' ? 700 : undefined, textAlign: { start: 'left', center: 'center', end: 'right' }[n.align],
    textDecoration: n.decoration === 'underline' ? 'underline' : n.decoration === 'line-through' ? 'line-through' : undefined, margin: undefined, minWidth: 0,
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    lineHeight: 1.35, alignSelf: n.gravity === 'center' ? 'center' : n.gravity === 'bottom' ? 'flex-end' : undefined,
  };
  if (n.maxLines) { style.display = '-webkit-box'; style.WebkitLineClamp = n.maxLines; style.WebkitBoxOrient = 'vertical'; style.overflow = 'hidden'; style.whiteSpace = 'pre-wrap'; }
  const spans = Array.isArray(n.contents) && n.contents.length ? n.contents.map((s, i) => <span key={i} style={{ fontSize: px(s.size, TEXT_PX), color: s.color, fontWeight: s.weight === 'bold' ? 700 : undefined }}>{s.text}</span>) : n.text;
  const fn = actionOf(n.action, onAction);
  return <div style={style} onClick={fn || undefined} role={fn ? 'button' : undefined}>{spans}</div>;
}

function Button({ n, onAction }) {
  const kind = n.style || 'link';
  const h = n.height === 'sm' ? 40 : 52;
  const base = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: h, padding: '0 10px', borderRadius: 8, border: 0, fontSize: 15, fontWeight: kind === 'primary' ? 700 : 600, cursor: 'pointer', textAlign: 'center', width: '100%', fontFamily: 'inherit' };
  if (kind === 'primary') { base.background = n.color || '#1DB4A6'; base.color = '#fff'; }
  else if (kind === 'secondary') { base.background = n.color || '#E8E8E8'; base.color = '#222'; }
  else { base.background = 'transparent'; base.color = n.color || '#3B6FD4'; }
  const fn = actionOf(n.action, onAction);
  if (n.action?.type === 'datetimepicker') return <DateTimeButton n={n} base={base} onAction={onAction} />;
  return <button type="button" data-flex="button" style={base} onClick={fn || undefined}>{n.action?.label || ''}</button>;
}

// LINE's date / time / date-and-time picker button → the browser's own picker; the chosen value goes back as the postback's params
function DateTimeButton({ n, base, onAction }) {
  const a = n.action, type = a.mode === 'time' ? 'time' : a.mode === 'datetime' ? 'datetime-local' : 'date';
  const key = a.mode === 'time' ? 'time' : a.mode === 'datetime' ? 'datetime' : 'date';
  return (
    <label style={{ ...base, position: 'relative', overflow: 'hidden' }} data-flex="picker">
      <span>{a.label}</span>
      <input type={type} aria-label={a.label} defaultValue={a.initial || ''} min={a.min} max={a.max}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        onChange={e => { if (e.target.value) onAction({ kind: 'postback', data: a.data, label: a.label, params: { [key]: e.target.value } }); }} />
    </label>
  );
}

function Img({ n, onAction }) {
  const [w, h] = String(n.aspectRatio || '1:1').split(':').map(Number);
  const fn = actionOf(n.action, onAction);
  const style = { width: n.size === 'full' || !n.size ? '100%' : IMG_W[n.size] || '100%', aspectRatio: w && h ? `${w} / ${h}` : undefined, objectFit: n.aspectMode === 'cover' ? 'cover' : 'contain', display: 'block', cursor: fn ? 'pointer' : undefined };
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={n.url} alt="" style={style} loading="lazy" referrerPolicy="no-referrer" onClick={fn || undefined} />;
}

function Node({ n, parent, onAction }) {
  if (!n) return null;
  const inRow = parent === 'horizontal' || parent === 'baseline';
  let el;
  if (n.type === 'box') el = <Box n={n} onAction={onAction} />;
  else if (n.type === 'text') el = <Text n={n} onAction={onAction} />;
  else if (n.type === 'button') el = <Button n={n} onAction={onAction} />;
  else if (n.type === 'image') el = <Img n={n} onAction={onAction} />;
  else if (n.type === 'separator') el = <div style={{ height: 1, background: n.color || '#E0E0E0', alignSelf: 'stretch' }} />;
  else if (n.type === 'filler') el = <div />;
  else if (n.type === 'spacer') el = <div style={{ height: px(n.size, SPACE_PX) || 8 }} />;
  else return null;
  const wrapStyle = { marginTop: !inRow ? px(n.margin, SPACE_PX) : undefined, marginLeft: inRow ? px(n.margin, SPACE_PX) : undefined, minWidth: 0 };
  if (inRow) wrapStyle.flex = n.type === 'filler' ? '1 1 0' : n.flex === 0 ? '0 0 auto' : `${n.flex ?? 1} 1 0`;
  return <div style={wrapStyle}>{el}</div>;
}

// A header / body / footer block of a bubble: LINE leaves text flush with the edge unless the card asks for space. On the web that looks
// cramped, so these blocks always keep a comfortable inner margin (never less than 14px at the sides, 10px above and below).
const SIDE_MIN = 14, VERT_MIN = 10;
function roomy(n) {
  const all = px(n.paddingAll, SPACE_PX) || 0;
  const side = k => px(n[k], SPACE_PX) ?? all;
  return {
    padding: undefined,
    paddingLeft: Math.max(side('paddingStart'), SIDE_MIN), paddingRight: Math.max(side('paddingEnd'), SIDE_MIN),
    paddingTop: Math.max(side('paddingTop'), VERT_MIN), paddingBottom: Math.max(side('paddingBottom'), VERT_MIN),
  };
}

function Box({ n, onAction, edge }) {
  const layout = n.layout || 'vertical';
  const pad = px(n.paddingAll, SPACE_PX);
  const style = {
    display: 'flex', flexDirection: layout === 'vertical' ? 'column' : 'row', alignItems: layout === 'baseline' ? 'baseline' : { start: 'flex-start', center: 'center', end: 'flex-end' }[n.alignItems] || (layout === 'vertical' ? 'stretch' : undefined),
    justifyContent: { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly' }[n.justifyContent],
    gap: px(n.spacing, SPACE_PX), background: n.backgroundColor, borderRadius: px(n.cornerRadius, RADIUS_PX), border: n.borderWidth ? `${px(n.borderWidth, { none: 0, light: 0.5, normal: 1, medium: 2, 'semi-bold': 3, bold: 4 }) || 1}px solid ${n.borderColor || '#ccc'}` : undefined,
    padding: pad, paddingTop: px(n.paddingTop, SPACE_PX), paddingBottom: px(n.paddingBottom, SPACE_PX), paddingLeft: px(n.paddingStart, SPACE_PX), paddingRight: px(n.paddingEnd, SPACE_PX),
    ...(edge ? roomy(n) : {}),
    width: px(n.width), height: px(n.height), minWidth: 0, boxSizing: 'border-box', cursor: n.action ? 'pointer' : undefined,
  };
  const fn = actionOf(n.action, onAction);
  return <div style={style} onClick={fn || undefined} role={fn ? 'button' : undefined}>{(n.contents || []).map((c, i) => <Node key={i} n={c} parent={layout} onAction={onAction} />)}</div>;
}

function Block({ n, onAction }) {
  if (!n) return null;
  return <Box n={n} onAction={onAction} edge />;
}

function Bubble({ b, onAction }) {
  const w = BUBBLE_W[b.size || 'mega'] || 300;
  const fn = actionOf(b.action, onAction);
  return (
    <div data-flex="bubble" style={{ width: w, maxWidth: 'calc(100vw - 64px)', flex: '0 0 auto', background: b.styles?.body?.backgroundColor || '#fff', color: '#111', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.18)', cursor: fn ? 'pointer' : undefined, direction: b.direction === 'rtl' ? 'rtl' : undefined }} onClick={fn || undefined}>
      {b.hero && (b.hero.type === 'image' ? <Img n={b.hero} onAction={onAction} /> : <Box n={b.hero} onAction={onAction} />)}
      <Block n={b.header} onAction={onAction} />
      <Block n={b.body} onAction={onAction} />
      <Block n={b.footer} onAction={onAction} />
    </div>
  );
}

export function Flex({ contents, onAction }) {
  if (!contents) return null;
  if (contents.type === 'carousel') return <div data-flex="carousel" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x proximity', paddingBottom: 6, maxWidth: '100%' }}>{(contents.contents || []).map((b, i) => <div key={i} style={{ scrollSnapAlign: 'start', display: 'flex' }}><Bubble b={b} onAction={onAction} /></div>)}</div>;
  return <Bubble b={contents} onAction={onAction} />;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;
function Linkified({ text }) {
  return String(text).split(URL_RE).map((part, i) => (/^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part));
}

export function BotMessage({ message, onAction }) {
  if (message.type === 'flex') return <Flex contents={message.contents} onAction={onAction} />;
  if (message.type === 'text') return <div className="chat-bubble bot" data-chat="bot-text"><Linkified text={message.text} /></div>;
  return <div className="chat-bubble bot muted">[ข้อความชนิดที่แสดงบนเว็บไม่ได้]</div>;
}

export function QuickReplies({ items, onAction, disabled }) {
  if (!items?.length) return null;
  return (
    <div className="chat-quick" data-chat="quick">
      {items.map((it, i) => {
        const a = it.action || {};
        if (a.type === 'datetimepicker') return <DateTimeButton key={i} n={{ action: a }} base={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.38rem 0.85rem', whiteSpace: 'nowrap', flex: '0 0 auto', borderRadius: 999, border: '1px solid var(--accent)', background: 'var(--surface-muted)', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }} onAction={onAction} />;
        const fn = actionOf(a, onAction);
        if (!fn) return null;
        return <button key={i} type="button" className="chat-chip" disabled={disabled} onClick={fn}>{a.label}</button>;
      })}
    </div>
  );
}
