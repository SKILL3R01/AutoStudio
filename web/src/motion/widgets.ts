/**
 * Motion widgets: ready animated components drawn from the recipe fields (palette-aware, deterministic in t).
 * Each draws around the origin (already placed / scaled by the item transform), in recipe pixels.
 */
import type { MotionItem, MotionPalette } from './types';
import { ease } from './anim';
import { PALETTES } from './recipe';

export interface WidgetApi {
  pal: MotionPalette;
  frame: { w: number; h: number };
  /** Draw a text layer (all text features: wrapping, RTL, highlights, in-animations) at local time t. */
  text: (props: Partial<MotionItem>, t: number) => void;
  icon: (name: string, color: string, size: number, style?: string) => void;
  /** Narration words inside the widget's time (t relative to the widget start). */
  words: { w: string; t: number }[];
  shade: (hex: string, k: number) => string;
  /** One of my files by name / id (loaded picture), if any. */
  image: (ref: string) => CanvasImageSource | undefined;
  /** Draw a picture covering w×h around the origin. */
  cover: (img: CanvasImageSource, w: number, h: number, r?: number) => void;
}
type W = (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Eased 0..1 progress of a step starting at `at` lasting `d` seconds. */
const k = (t: number, at: number, d = 0.5, e = 'fast-slow') => ease(e, clamp((t - at) / d));
const rnd = (i: number, s = 1) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const str = (v: unknown, d = '') => (v === undefined || v === null ? d : String(v));
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : d);
const RTL = /[\u0590-\u08ff]/;

/** The widget's own palette (a name or the recipe palette). */
const palOf = (it: MotionItem, a: WidgetApi): MotionPalette => (typeof it.palette === 'string' && PALETTES[it.palette] ? PALETTES[it.palette] : a.pal);
const accent = (it: MotionItem, p: MotionPalette, i = 0) => (typeof it.color === 'string' && i === 0 ? it.color : p.accents[i % p.accents.length]);
const font = (p: MotionPalette, it?: MotionItem) => str(it?.font ?? p.font, 'Montserrat');
const isLight = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 150;
};

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number | string, fam: string, txt = '') {
  ctx.font = `${weight} ${Math.round(size)}px "${fam}"`;
  ctx.direction = RTL.test(txt) ? 'rtl' : 'ltr';
}
function label(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number, size: number, color: string, o: { weight?: number; fam?: string; align?: CanvasTextAlign; max?: number; spacing?: number; fit?: boolean } = {}) {
  setFont(ctx, size, o.weight ?? 700, o.fam ?? 'Montserrat', txt);
  // fit: shrink the size (down to 45 %) before cutting the text.
  if (o.fit && o.max) for (let s0 = size; s0 > size * 0.45 && ctx.measureText(txt).width > o.max; s0 *= 0.92) setFont(ctx, s0, o.weight ?? 700, o.fam ?? 'Montserrat', txt);
  ctx.fillStyle = color;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (o.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${o.spacing}px`;
  let s = txt;
  if (o.max) while (s.length > 3 && ctx.measureText(s).width > o.max) s = s.slice(0, -2);
  ctx.fillText(s === txt ? s : s + '…', x, y);
  if (o.spacing) (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
}
/** Premium card surface: soft contact shadow, body, a top sheen and a hairline edge. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, o: { border?: string[]; shadow?: boolean } = {}) {
  ctx.save();
  if (o.shadow !== false) (ctx.shadowColor = 'rgba(0,0,0,0.28)'), (ctx.shadowBlur = 40), (ctx.shadowOffsetY = 16);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const g = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  g.addColorStop(0, isLight(fill) ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fill();
  if (o.border?.length) {
    const b = ctx.createLinearGradient(x, y, x + w, y + h);
    o.border.forEach((c, i) => b.addColorStop(i / Math.max(1, o.border!.length - 1), c));
    ctx.strokeStyle = b;
    ctx.lineWidth = 3;
  } else (ctx.strokeStyle = isLight(fill) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'), (ctx.lineWidth = 1.5);
  ctx.stroke();
  ctx.restore();
}
/** "+1,200" / "$2.4M" / "95%" counting up: the number part animates, prefix and suffix stay. */
export function countUp(value: string, p: number): string {
  const m = /^([^0-9\-]*)(-?[0-9][0-9,]*\.?[0-9]*)(.*)$/.exec(value.trim());
  if (!m) return value;
  const target = parseFloat(m[2].replace(/,/g, ''));
  const dec = (m[2].split('.')[1] ?? '').length;
  const v = target * clamp(p);
  const s = v.toFixed(dec);
  const withCommas = m[2].includes(',') ? Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s;
  return m[1] + withCommas + m[3];
}
/** Staggered entrance: alpha + rise for element i. */
function enter(ctx: CanvasRenderingContext2D, t: number, i: number, stagger = 0.12, delay = 0.1, dist = 30) {
  const e = k(t, delay + i * stagger, 0.5);
  ctx.globalAlpha *= e;
  ctx.translate(0, (1 - e) * dist);
  return e;
}

/* ---------- titles ---------- */
const headline: W = (ctx, it, t, a) => {
  const p = palOf(it, a);
  const size = n(it.size, 96), align = str(it.align, 'center');
  const grad = arr<string>(it.gradient).length ? arr<string>(it.gradient) : ['#fbe3a6', '#c9822e'];
  const sub = str(it.sub);
  const ty = sub ? -size * 0.25 : 0;
  a.text({ text: str(it.title), size, weight: 900, color: str(it.textColor, p.text), font: font(p, it), align, width: n(it.width, 1500), y: ty, in: it.reveal === 'blur' ? 'blur-in' : 'saas-words', highlight: it.gold ? [{ word: str(it.gold), style: 'color', gradient: grad, at: 0.35 }] : undefined, dur: it.dur }, t);
  if (sub) {
    ctx.save();
    ctx.globalAlpha *= k(t, 0.55, 0.6);
    label(ctx, sub.toUpperCase(), align === 'left' ? -n(it.width, 1500) / 2 : align === 'right' ? n(it.width, 1500) / 2 : 0, ty + size * 0.85, size * 0.22, p.muted, { weight: 700, fam: font(p, it), spacing: size * 0.08, align: align as CanvasTextAlign });
    ctx.restore();
  }
};
const kinetic: W = (_ctx, it, t, a) => {
  const p = palOf(it, a), lines = arr<string>(it.lines);
  if (!lines.length) return;
  const slot = it.dur / lines.length, i = Math.min(lines.length - 1, Math.floor(t / slot));
  a.text({ text: lines[i], size: n(it.size, 120), weight: 900, color: p.text, font: font(p, it), in: i % 2 ? 'stomp' : 'pop-up', out: i < lines.length - 1 ? 'fade-out' : undefined, dur: slot, highlight: arr<string>(it.highlight).map((w) => ({ word: w, style: 'color', color: accent(it, p), at: 0.15 })) }, t - i * slot);
};
const say: W = (ctx, it, t, a) => {
  const p = palOf(it, a), size = n(it.size, 110);
  const own = arr<{ w: string; t: number }>(it.words);
  const ws = own.length ? own : str(it.text) ? str(it.text).split(/\s+/).map((w, i, all) => ({ w, t: (i / all.length) * it.dur * 0.7 })) : a.words;
  if (!ws.length) return;
  const keys = arr<string>(it.key).map((s) => s.toLowerCase());
  // Show the current phrase (up to 6 words) word by word as each is spoken.
  const shown = ws.filter((w) => w.t <= t);
  if (!shown.length) return;
  const start = Math.floor((shown.length - 1) / 6) * 6;
  const phrase = ws.slice(start, start + 6);
  setFont(ctx, size, 900, font(p, it), phrase.map((w) => w.w).join(' '));
  const widths = phrase.map((w) => ctx.measureText(w.w + ' ').width);
  const total = widths.reduce((x, y) => x + y, 0);
  const rtl = RTL.test(phrase[0].w);
  let x = rtl ? total / 2 : -total / 2;
  if (it.pill) card(ctx, -total / 2 - 40, -size * 0.75, total + 80, size * 1.5, size * 0.75, 'rgba(10,10,14,0.72)', { shadow: false });
  phrase.forEach((w, i) => {
    const e = k(t, w.t - 0.05, 0.25, 'overshoot');
    const ww = widths[i];
    const cx = rtl ? x - ww / 2 : x + ww / 2;
    ctx.save();
    ctx.globalAlpha *= clamp(e * 1.5);
    ctx.translate(cx, 0);
    ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e);
    const key = keys.some((kk) => w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').includes(kk));
    label(ctx, w.w, 0, 0, size, key ? '#e8b86a' : p.text, { weight: 900, fam: font(p, it) });
    ctx.restore();
    x += rtl ? -ww : ww;
  });
};
const tag: W = (ctx, it, t, a) => {
  const p = palOf(it, a), txt = str(it.text, 'NEW').toUpperCase();
  setFont(ctx, 26, 800, font(p, it), txt);
  const w = ctx.measureText(txt).width + 80;
  card(ctx, -w / 2, -26, w, 52, 26, p.card, { shadow: false });
  ctx.fillStyle = accent(it, p);
  ctx.beginPath();
  ctx.arc(-w / 2 + 28, 0, 7 * (1 + Math.max(0, Math.sin(t * 5)) * 0.25), 0, Math.PI * 2);
  ctx.fill();
  label(ctx, txt, 16, 1, 26, p.text, { weight: 800, fam: font(p, it), spacing: 3 });
};
const quote: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 1100), h = n(it.h, 420);
  card(ctx, -w / 2, -h / 2, w, h, 36, p.card);
  ctx.save();
  ctx.translate(-w / 2 + 120, -h / 2 + 100);
  ctx.globalAlpha *= k(t, 0.1, 0.4);
  a.icon('quote', accent(it, p), 70, 'line');
  ctx.restore();
  a.text({ text: str(it.text), size: n(it.size, 54), weight: 700, color: p.text, font: font(p, it), width: w - 200, y: -30, in: 'saas-words', highlight: arr<string>(it.highlight).map((x) => ({ word: x, style: 'marker', bg: accent(it, p, 1), at: 0.9 })), dur: it.dur }, t);
  ctx.save();
  ctx.globalAlpha *= k(t, 0.8, 0.5);
  if (it.avatar !== false) {
    ctx.fillStyle = accent(it, p, 2);
    ctx.beginPath();
    ctx.arc(-w / 2 + 110, h / 2 - 80, 34, 0, Math.PI * 2);
    ctx.fill();
    a.icon('user', '#ffffff', 34);
  }
  label(ctx, str(it.name), -w / 2 + 165, h / 2 - 92, 30, p.text, { align: 'left', weight: 800, fam: font(p, it) });
  label(ctx, str(it.role), -w / 2 + 165, h / 2 - 58, 24, p.muted, { align: 'left', weight: 500, fam: font(p, it) });
  ctx.restore();
};

/* ---------- cards / lists ---------- */
type CardItem = { icon?: string; title?: string; sub?: string; color?: string };
const cards: W = (ctx, it, t, a) => {
  const p = palOf(it, a), items = arr<CardItem>(it.items);
  if (!items.length) return;
  const W0 = n(it.w, Math.min(1500, items.length * 400)), gap = 40, cw = (W0 - gap * (items.length - 1)) / items.length, ch = n(it.cardH, 260);
  items.forEach((c, i) => {
    ctx.save();
    const x = -W0 / 2 + i * (cw + gap);
    enter(ctx, t, i, 0.15, 0.1, 60);
    card(ctx, x, -ch / 2, cw, ch, 28, p.card);
    const c0 = str(c.color, p.accents[i % p.accents.length]);
    ctx.save();
    ctx.translate(x + 70, -ch / 2 + 75);
    ctx.scale(0.5 + 0.5 * k(t, 0.3 + i * 0.15, 0.5, 'overshoot'), 0.5 + 0.5 * k(t, 0.3 + i * 0.15, 0.5, 'overshoot'));
    a.icon(str(c.icon, 'star'), c0, 48, 'squircle');
    ctx.restore();
    label(ctx, str(c.title), x + 34, ch / 2 - (c.sub ? 92 : 60), Math.min(44, cw / 7), p.text, { align: 'left', weight: 800, fam: font(p, it), max: cw - 60 });
    if (c.sub) label(ctx, str(c.sub), x + 34, ch / 2 - 46, Math.min(28, cw / 11), p.muted, { align: 'left', weight: 500, fam: font(p, it), max: cw - 60 });
    ctx.restore();
  });
};
const chips: W = (ctx, it, t, a) => {
  const p = palOf(it, a), items = arr<CardItem>(it.items);
  setFont(ctx, 32, 800, font(p, it));
  const widths = items.map((c) => Math.max(ctx.measureText(str(c.title)).width, c.sub ? ctx.measureText(str(c.sub)).width * 0.7 : 0) + 120);
  const gap = 28, total = widths.reduce((x, y) => x + y, 0) + gap * (items.length - 1);
  let x = -total / 2;
  items.forEach((c, i) => {
    ctx.save();
    enter(ctx, t, i, 0.1, 0.1, 40);
    const h = c.sub ? 96 : 72;
    card(ctx, x, -h / 2, widths[i], h, h / 2, p.card, { shadow: false });
    ctx.save();
    ctx.translate(x + 44, 0);
    a.icon(str(c.icon, 'check'), str(c.color, p.accents[i % p.accents.length]), 34);
    ctx.restore();
    label(ctx, str(c.title), x + 80, c.sub ? -14 : 1, 32, p.text, { align: 'left', weight: 800, fam: font(p, it) });
    if (c.sub) label(ctx, str(c.sub), x + 80, 22, 22, p.muted, { align: 'left', weight: 500, fam: font(p, it) });
    ctx.restore();
    x += widths[i] + gap;
  });
};
const checklist: W = (ctx, it, t, a) => {
  const p = palOf(it, a), items = arr<string>(it.items), w = n(it.w, 900), rh = 96;
  const top = (-items.length * rh) / 2 + rh / 2;
  items.forEach((s, i) => {
    ctx.save();
    const y = top + i * rh;
    enter(ctx, t, i, 0.35, 0.1, 20);
    card(ctx, -w / 2, y - 38, w, 76, 20, p.card, { shadow: false });
    const tick = k(t, 0.45 + i * 0.35, 0.35);
    ctx.strokeStyle = accent(it, p);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 26, y - 20, 40, 40, 10);
    ctx.stroke();
    if (tick > 0) {
      ctx.fillStyle = accent(it, p);
      ctx.globalAlpha *= tick;
      ctx.fill();
      ctx.globalAlpha /= Math.max(tick, 1e-3);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 36, y);
      const m = [-w / 2 + 43, y + 9], e = [-w / 2 + 58, y - 10];
      if (tick < 0.5) ctx.lineTo(-w / 2 + 36 + (m[0] - (-w / 2 + 36)) * tick * 2, y + 9 * tick * 2);
      else (ctx.lineTo(m[0], m[1]), ctx.lineTo(m[0] + (e[0] - m[0]) * (tick - 0.5) * 2, m[1] + (e[1] - m[1]) * (tick - 0.5) * 2));
      ctx.stroke();
    }
    label(ctx, s, -w / 2 + 92, y + 1, 36, p.text, { align: 'left', weight: 700, fam: font(p, it), max: w - 120 });
    ctx.restore();
  });
};
const steps: W = (ctx, it, t, a) => {
  const p = palOf(it, a), items = arr<string>(it.items), w = n(it.w, 1400);
  if (!items.length) return;
  const rtl = it.dir === 'rtl', gapX = items.length > 1 ? w / (items.length - 1) : 0;
  const xs = items.map((_, i) => (rtl ? w / 2 - i * gapX : -w / 2 + i * gapX));
  ctx.save();
  ctx.setLineDash([4, 18]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.muted;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(xs[0], 0);
  ctx.lineTo(xs[0] + (xs[xs.length - 1] - xs[0]) * k(t, 0.1, 1.2, 'ease'), 0);
  ctx.stroke();
  ctx.restore();
  const active = Math.min(items.length - 1, Math.floor(clamp(t / Math.max(0.1, it.dur * 0.85)) * items.length));
  items.forEach((s, i) => {
    ctx.save();
    const e = k(t, 0.2 + i * 0.25, 0.45, 'overshoot');
    ctx.translate(xs[i], 0);
    ctx.globalAlpha *= clamp(e * 2);
    ctx.scale(e, e);
    const on = it.highlight !== false && i === active;
    ctx.fillStyle = on ? accent(it, p) : p.card;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fill();
    if (on) (ctx.strokeStyle = accent(it, p)), (ctx.lineWidth = 4), ctx.beginPath(), ctx.arc(0, 0, 74 + Math.sin(t * 4) * 4, 0, Math.PI * 2), ctx.stroke();
    label(ctx, String(i + 1), 0, 2, 50, on ? '#ffffff' : p.text, { weight: 900, fam: font(p, it) });
    label(ctx, s, 0, 112, 34, p.text, { weight: 800, fam: font(p, it), max: Math.max(160, gapX - 30) });
    ctx.restore();
  });
};
const compare: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 1400), h = n(it.h, 440), cw = (w - 140) / 2;
  const L = (it.left ?? {}) as { title?: string; items?: string[] }, R = (it.right ?? {}) as { title?: string; items?: string[] };
  const side = (x: number, s: typeof L, good: boolean, i0: number) => {
    ctx.save();
    const e = k(t, 0.1 + i0 * 0.25, 0.55);
    ctx.globalAlpha *= e;
    ctx.translate((1 - e) * (good ? 80 : -80), 0);
    card(ctx, x, -h / 2, cw, h, 30, p.card);
    const c = good ? '#19c39c' : '#e5484d';
    label(ctx, str(s.title).toUpperCase(), x + cw / 2, -h / 2 + 60, 40, c, { weight: 900, fam: font(p, it), spacing: 4 });
    arr<string>(s.items).forEach((txt, i) => {
      ctx.save();
      const y = -h / 2 + 140 + i * 80;
      ctx.globalAlpha *= k(t, 0.45 + i0 * 0.25 + i * 0.15, 0.35);
      ctx.translate(x + 60, y);
      a.icon(good ? 'check' : 'x', c, 36);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= k(t, 0.45 + i0 * 0.25 + i * 0.15, 0.35);
      label(ctx, txt, x + 100, -h / 2 + 141 + i * 80, 34, p.text, { align: 'left', weight: 600, fam: font(p, it), max: cw - 130 });
      ctx.restore();
    });
    ctx.restore();
  };
  side(-w / 2, L, false, 0);
  side(w / 2 - cw, R, true, 1);
  const e = k(t, 0.6, 0.45, 'overshoot');
  ctx.save();
  ctx.scale(e, e);
  ctx.fillStyle = accent(it, p);
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, str(it.vs, 'VS'), 0, 2, 40, '#ffffff', { weight: 900, fam: font(p, it) });
  ctx.restore();
};

/* ---------- data ---------- */
const stat: W = (ctx, it, t, a) => {
  const p = palOf(it, a), size = n(it.size, 200), v = str(it.value, '100%');
  const e = k(t, 0.1, 1.3, 'fast-slow');
  ctx.save();
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, accent(it, p));
  setFont(ctx, size, 900, font(p, it));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isLight(p.bg) ? accent(it, p) : g;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 20;
  ctx.scale(0.85 + 0.15 * k(t, 0, 0.5, 'overshoot'), 0.85 + 0.15 * k(t, 0, 0.5, 'overshoot'));
  ctx.fillText(countUp(v, e), 0, 0);
  ctx.restore();
  if (it.label) (ctx.globalAlpha *= k(t, 0.5, 0.5)), label(ctx, str(it.label).toUpperCase(), 0, size * 0.72, size * 0.17, p.muted, { weight: 700, fam: font(p, it), spacing: 6 });
};
function linePath(values: number[], w: number, h: number) {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  return values.map((v, i) => [-w / 2 + (i / Math.max(1, values.length - 1)) * w, h / 2 - ((v - lo) / span) * h] as [number, number]);
}
const chartLine: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 760), h = n(it.h, 440), c = accent(it, p);
  const vals = arr<number>(it.values).map((v) => n(v, 0));
  if (it.card !== false) card(ctx, -w / 2, -h / 2, w, h, 30, p.card);
  label(ctx, str(it.label).toUpperCase(), -w / 2 + 44, -h / 2 + 52, 24, p.muted, { align: 'left', weight: 700, fam: font(p, it), spacing: 3 });
  label(ctx, countUp(str(it.value), k(t, 0.2, 1.4)), -w / 2 + 44, -h / 2 + 110, 64, p.text, { align: 'left', weight: 900, fam: font(p, it) });
  if (it.delta) {
    const up = !str(it.delta).trim().startsWith('-');
    ctx.save();
    ctx.globalAlpha *= k(t, 1, 0.4);
    setFont(ctx, 26, 800, font(p, it));
    const dw = ctx.measureText(str(it.delta)).width + 40;
    card(ctx, w / 2 - dw - 40, -h / 2 + 34, dw, 44, 22, up ? '#19c39c' : '#e5484d', { shadow: false });
    label(ctx, str(it.delta), w / 2 - dw / 2 - 40, -h / 2 + 57, 26, '#ffffff', { weight: 800, fam: font(p, it) });
    ctx.restore();
  }
  if (vals.length < 2) return;
  const pw = w - 88, ph = h - 220, oy = 60;
  const pts = linePath(vals, pw, ph).map(([x, y]) => [x, y + oy] as [number, number]);
  const prog = k(t, 0.3, 1.4, 'ease');
  const upto = 1 + prog * (pts.length - 1);
  const shown: [number, number][] = pts.slice(0, Math.floor(upto));
  const fr = upto - Math.floor(upto), last = pts[Math.min(pts.length - 1, Math.floor(upto))];
  if (fr > 0 && shown.length < pts.length) {
    const prev = shown[shown.length - 1];
    shown.push([prev[0] + (last[0] - prev[0]) * fr, prev[1] + (last[1] - prev[1]) * fr]);
  }
  const area = ctx.createLinearGradient(0, -ph / 2 + oy, 0, ph / 2 + oy);
  area.addColorStop(0, c + '66');
  area.addColorStop(1, c + '00');
  ctx.beginPath();
  shown.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineTo(shown[shown.length - 1][0], ph / 2 + oy);
  ctx.lineTo(shown[0][0], ph / 2 + oy);
  ctx.fillStyle = area;
  ctx.fill();
  ctx.beginPath();
  shown.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = c;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  const [ex, ey] = shown[shown.length - 1];
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(ex, ey, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha *= 0.35 * (1 - ((t * 1.2) % 1));
  ctx.beginPath();
  ctx.arc(ex, ey, 10 + ((t * 1.2) % 1) * 26, 0, Math.PI * 2);
  ctx.fill();
};
const bars: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 800), h = n(it.h, 460);
  const vals = arr<number>(it.values).map((v) => n(v, 0)), labels = arr<string>(it.labels), hi = Math.max(1, ...vals);
  if (it.card !== false) card(ctx, -w / 2, -h / 2, w, h, 30, p.card);
  const n0 = vals.length || 1, gap = 30, bw = (w - 100 - gap * (n0 - 1)) / n0, base = h / 2 - 70, top = -h / 2 + 80;
  vals.forEach((v, i) => {
    const e = k(t, 0.2 + i * 0.12, 0.8, 'overshoot');
    const bh = ((base - top) * v * e) / hi, x = -w / 2 + 50 + i * (bw + gap);
    const g = ctx.createLinearGradient(0, base - bh, 0, base);
    const c = i === vals.indexOf(hi) ? accent(it, p) : a.shade(accent(it, p), isLight(p.card) ? 0.45 : -0.35);
    g.addColorStop(0, c);
    g.addColorStop(1, a.shade(c, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, base - bh, bw, Math.max(2, bh), [14, 14, 4, 4]);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha *= clamp(e);
    label(ctx, `${Math.round(v * clamp(e))}${str(it.suffix)}`, x + bw / 2, base - bh - 26, 28, p.text, { weight: 800, fam: font(p, it) });
    ctx.restore();
    if (labels[i]) label(ctx, labels[i], x + bw / 2, base + 36, 24, p.muted, { weight: 600, fam: font(p, it), max: bw + gap });
  });
};
const donut: W = (ctx, it, t, a) => {
  const p = palOf(it, a), size = n(it.size, 360), v = clamp(n(it.value, 75) / 100), e = k(t, 0.15, 1.4, 'fast-slow');
  const r = size / 2, lw = size * 0.11;
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = isLight(p.bg) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, accent(it, p));
  g.addColorStop(1, accent(it, p, 1));
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v * e);
  ctx.stroke();
  label(ctx, `${Math.round(n(it.value, 75) * e)}%`, 0, it.label ? -size * 0.04 : 0, size * 0.24, p.text, { weight: 900, fam: font(p, it) });
  if (it.label) label(ctx, str(it.label), 0, size * 0.16, size * 0.07, p.muted, { weight: 600, fam: font(p, it), max: size * 0.7 });
};
const progress: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 900), v = clamp(n(it.value, 70) / 100), e = k(t, 0.2, 1.4, 'fast-slow');
  label(ctx, str(it.label), -w / 2, -48, 32, p.text, { align: 'left', weight: 700, fam: font(p, it) });
  label(ctx, `${Math.round(n(it.value, 70) * e)}%`, w / 2, -48, 32, accent(it, p), { align: 'right', weight: 900, fam: font(p, it) });
  ctx.fillStyle = isLight(p.bg) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -14, w, 28, 14);
  ctx.fill();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, accent(it, p, 1));
  g.addColorStop(1, accent(it, p));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -14, Math.max(28, w * v * e), 28, 14);
  ctx.fill();
};
const bento: W = (ctx, it, t, a) => {
  const p = palOf(it, a), cells = arr<Record<string, unknown>>(it.cells), w = n(it.w, 1500), h = n(it.h, 460);
  if (!cells.length) return;
  const cols = cells.length <= 4 ? cells.length : Math.ceil(cells.length / 2), rows = Math.ceil(cells.length / cols), gap = 24;
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  cells.forEach((c, i) => {
    const x = -w / 2 + (i % cols) * (cw + gap), y = -h / 2 + Math.floor(i / cols) * (ch + gap);
    ctx.save();
    const e = k(t, 0.1 + i * 0.1, 0.5, 'overshoot');
    ctx.translate(x + cw / 2, y + ch / 2);
    ctx.scale(0.8 + 0.2 * e, 0.8 + 0.2 * e);
    ctx.globalAlpha *= clamp(e * 2);
    const fill = i % 3 === 0 ? accent(it, p, i) : p.card;
    const ink = isLight(fill) ? '#141414' : '#ffffff';
    card(ctx, -cw / 2, -ch / 2, cw, ch, 26, fill);
    const sub: MotionItem = { ...(c as object), id: 'b', type: 'widget', start: 0, dur: it.dur } as MotionItem;
    if (c.type === 'stat') label(ctx, countUp(str(c.value), k(t, 0.3 + i * 0.1, 1.2)), 0, -12, Math.min(84, ch / 3), ink, { weight: 900, fam: font(p, it) }), label(ctx, str(c.label), 0, ch * 0.24, Math.min(26, ch / 8), ink, { weight: 600, fam: font(p, it), max: cw - 30 });
    else if (c.type === 'chart') ctx.scale(Math.min(cw / 760, ch / 440), Math.min(cw / 760, ch / 440)), chartLine(ctx, { ...sub, card: false, label: '', value: '', color: ink }, t, a);
    else if (c.type === 'bars') ctx.scale(Math.min(cw / 800, ch / 460), Math.min(cw / 800, ch / 460)), bars(ctx, { ...sub, card: false, color: isLight(fill) ? p.accents[0] : ink }, t, a);
    else if (c.type === 'phone') ctx.scale(ch / 760, ch / 760), phone(ctx, { ...sub, w: 330, messages: arr(c.messages).length ? c.messages : [{ text: '👋' }, { text: 'On it!', me: true }] }, t, a);
    else if (c.type === 'icon') a.icon(str(c.icon, 'sparkles'), ink, Math.min(cw, ch) * 0.4, 'line');
    else label(ctx, str(c.text ?? c.title ?? ''), 0, 0, Math.min(56, cw / 8), ink, { weight: 900, fam: font(p, it), max: cw - 40, fit: true });
    ctx.restore();
  });
};

/* ---------- interface ---------- */
const windowW: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 900), h = n(it.h, 560);
  card(ctx, -w / 2, -h / 2, w, h, 26, p.card, { border: arr<string>(it.border) });
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => ((ctx.fillStyle = c), ctx.beginPath(), ctx.arc(-w / 2 + 36 + i * 30, -h / 2 + 34, 9, 0, Math.PI * 2), ctx.fill()));
  label(ctx, str(it.title), 0, -h / 2 + 35, 24, p.muted, { weight: 600, fam: font(p, it), max: w - 260 });
  ctx.fillStyle = isLight(p.card) ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  ctx.fillRect(-w / 2, -h / 2 + 68, w, 1.5);
  const lines = arr<string>(it.lines), code = !!it.code;
  if (it.image) {
    ctx.save();
    ctx.globalAlpha *= k(t, 0.2, 0.5);
    ctx.fillStyle = a.shade(accent(it, p), isLight(p.card) ? 0.7 : -0.5);
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 30, -h / 2 + 96, w - 60, h - 126, 16);
    ctx.fill();
    a.icon('image', accent(it, p), 80);
    ctx.restore();
    return;
  }
  const rows = lines.length ? lines : ['', '', '', '', ''];
  const chars = rows.join('').length || 1;
  const typed = Math.floor(k(t, 0.2, Math.max(0.8, it.dur * 0.6), 'linear') * chars);
  let used = 0;
  rows.forEach((s, i) => {
    const y = -h / 2 + 116 + i * 58;
    if (y > h / 2 - 30) return;
    if (!s) {
      ctx.save();
      ctx.globalAlpha *= k(t, 0.15 + i * 0.1, 0.4);
      ctx.fillStyle = i === 0 ? accent(it, p) : isLight(p.card) ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 40, y - 12, (w - 80) * [0.45, 0.85, 0.7, 0.9, 0.6][i % 5], 24, 12);
      ctx.fill();
      ctx.restore();
      return;
    }
    const show = s.slice(0, Math.max(0, typed - used));
    used += s.length;
    label(ctx, show, -w / 2 + 40, y, code ? 30 : 32, code ? [p.text, accent(it, p), p.muted][i % 3] : p.text, { align: 'left', weight: code ? 500 : 600, fam: code ? 'Consolas' : font(p, it) });
  });
};
type Msg = { text?: string; me?: boolean; name?: string };
function bubbles(ctx: CanvasRenderingContext2D, msgs: Msg[], t: number, w: number, top: number, p: MotionPalette, it: MotionItem, size = 28) {
  let y = top;
  msgs.forEach((m, i) => {
    const e = k(t, 0.25 + i * 0.55, 0.4, 'overshoot');
    if (e <= 0) return;
    setFont(ctx, size, 600, font(p, it), str(m.text));
    const tw = Math.min(w * 0.72, ctx.measureText(str(m.text)).width + 44), bh = size * 2;
    const x = m.me ? w / 2 - tw - 18 : -w / 2 + 18;
    ctx.save();
    ctx.globalAlpha *= clamp(e * 2);
    ctx.translate(x + (m.me ? tw : 0), y + bh / 2);
    ctx.scale(e, e);
    ctx.translate(-(x + (m.me ? tw : 0)), -(y + bh / 2));
    ctx.fillStyle = m.me ? accent(it, p) : isLight(p.card) ? '#eceef2' : '#ffffff22';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, bh, [bh / 2, bh / 2, m.me ? 6 : bh / 2, m.me ? bh / 2 : 6]);
    ctx.fill();
    label(ctx, str(m.text), x + 22, y + bh / 2 + 1, size, m.me ? '#ffffff' : p.text, { align: 'left', weight: 600, fam: font(p, it), max: tw - 40 });
    ctx.restore();
    y += bh + 18;
  });
}
const phone: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 330), h = w * 2.05;
  card(ctx, -w / 2, -h / 2, w, h, w * 0.16, '#0d0f14');
  ctx.fillStyle = p.bg;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, w * 0.13);
  ctx.fill();
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.roundRect(-w * 0.16, -h / 2 + 22, w * 0.32, 26, 13);
  ctx.fill();
  if (it.title) label(ctx, str(it.title), 0, -h / 2 + 86, w * 0.075, p.text, { weight: 800, fam: font(p, it), max: w - 60 });
  if (it.image) {
    ctx.fillStyle = a.shade(accent(it, p), -0.4);
    ctx.fillRect(-w / 2 + 12, -h / 2 + 120, w - 24, h * 0.5);
    ctx.save();
    ctx.translate(0, -h / 2 + 120 + h * 0.25);
    a.icon('image', '#ffffff', 60);
    ctx.restore();
  }
  bubbles(ctx, arr<Msg>(it.messages), t, w - 24, -h / 2 + (it.image ? 140 + h * 0.5 : 130), p, it, w * 0.068);
};
const chat: W = (ctx, it, t, a) => {
  const p = palOf(it, a), msgs = arr<Msg>(it.messages), w = n(it.w, 900);
  bubbles(ctx, msgs, t, w, -(msgs.length * 74) / 2, p, it, 32);
};
const typing: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 1000), h = 110, txt = str(it.text);
  const typeEnd = Math.min(it.dur * 0.7, 0.4 + txt.length * 0.06);
  const shown = txt.slice(0, Math.floor(k(t, 0.4, typeEnd - 0.4, 'linear') * txt.length));
  card(ctx, -w / 2, -h / 2, w, h, h / 2, p.card, { border: [accent(it, p), accent(it, p, 1)] });
  ctx.save();
  ctx.translate(-w / 2 + 60, 0);
  a.icon(str(it.icon, 'search'), p.muted, 40);
  ctx.restore();
  setFont(ctx, 40, 600, font(p, it), shown);
  if (shown) label(ctx, shown, -w / 2 + 104, 2, 40, p.text, { align: 'left', weight: 600, fam: font(p, it) });
  else label(ctx, str(it.placeholder, 'Ask anything…'), -w / 2 + 104, 2, 40, p.muted, { align: 'left', weight: 500, fam: font(p, it) });
  if (Math.floor(t * 2.2) % 2 === 0 || t < typeEnd) {
    const cx = -w / 2 + 108 + (shown ? ctx.measureText(shown).width : 0);
    ctx.fillStyle = accent(it, p);
    ctx.fillRect(cx, -24, 4, 48);
  }
  if (it.button) {
    const pr = k(t, typeEnd + 0.15, 0.25);
    const bw = 170, s = 1 - 0.08 * Math.sin(pr * Math.PI);
    ctx.save();
    ctx.translate(w / 2 - bw / 2 - 16, 0);
    ctx.scale(s, s);
    card(ctx, -bw / 2, -38, bw, 76, 38, accent(it, p), { shadow: false });
    label(ctx, typeof it.button === 'string' ? it.button : 'Send', 0, 2, 32, '#ffffff', { weight: 800, fam: font(p, it) });
    ctx.restore();
  }
};
const button: W = (ctx, it, t, a) => {
  const p = palOf(it, a), txt = str(it.text, 'Get started'), press = n(it.press, it.dur * 0.6);
  setFont(ctx, 40, 800, font(p, it), txt);
  const w = n(it.w, ctx.measureText(txt).width + (it.icon ? 150 : 110)), h = 100;
  const pr = clamp((t - press) / 0.3), s = 1 - 0.07 * Math.sin(pr * Math.PI);
  ctx.save();
  ctx.scale(s, s);
  ctx.shadowColor = accent(it, p);
  ctx.shadowBlur = 30 + Math.sin(t * 3) * 10;
  card(ctx, -w / 2, -h / 2, w, h, h / 2, accent(it, p), { shadow: false });
  ctx.shadowColor = 'transparent';
  label(ctx, txt, it.icon ? -24 : 0, 2, 40, '#ffffff', { weight: 800, fam: font(p, it) });
  if (it.icon) (ctx.translate(w / 2 - 60, 0), a.icon(str(it.icon), '#ffffff', 40));
  ctx.restore();
  if (pr > 0 && pr < 1) {
    ctx.strokeStyle = accent(it, p);
    ctx.globalAlpha *= 1 - pr;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - pr * 40, -h / 2 - pr * 40, w + pr * 80, h + pr * 80, h / 2 + pr * 40);
    ctx.stroke();
  }
};
const logoReveal: W = (ctx, it, t, a) => {
  const p = palOf(it, a), size = n(it.size, 220), grad = arr<string>(it.gradient).length ? arr<string>(it.gradient) : [accent(it, p), accent(it, p, 1)];
  const ring = k(t, 0.1, 0.9, 'ease');
  const g = ctx.createLinearGradient(-size, -size, size, size);
  g.addColorStop(0, grad[0]);
  g.addColorStop(1, grad[grad.length - 1]);
  ctx.save();
  ctx.translate(0, -size * 0.35);
  ctx.shadowColor = grad[0];
  ctx.shadowBlur = 50 * ring;
  ctx.strokeStyle = g;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
  ctx.stroke();
  const e = k(t, 0.6, 0.5, 'overshoot');
  ctx.scale(e, e);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.36, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, str(it.name, 'Logo').slice(0, 2).toUpperCase(), 0, 4, size * 0.3, '#ffffff', { weight: 900, fam: font(p, it) });
  ctx.restore();
  a.text({ text: str(it.name), size: size * 0.42, weight: 900, color: p.text, font: font(p, it), y: size * 0.55, in: 'cinematic-rise', dur: it.dur }, t - 0.8);
  if (it.tagline) (ctx.globalAlpha *= k(t, 1.3, 0.5)), label(ctx, str(it.tagline), 0, size * 0.98, size * 0.13, p.muted, { weight: 600, fam: font(p, it), spacing: 2 });
};

export const CONTENT_WIDGETS: Record<string, W> = {
  headline, kinetic, say, tag, quote, cards, chips, checklist, steps, compare, bento, stat, 'chart-line': chartLine, bars, donut, progress,
  window: windowW, phone, chat, typing, button, 'logo-reveal': logoReveal, 'cta-orb': button, 'prompt-bar': typing, 'star-list': checklist, 'choice-pills': chips, 'neon-caption': headline, 'brand-type': logoReveal,
};
/** Approximate box of a widget (for selection on the preview). */
export function widgetBox(it: MotionItem): { w: number; h: number } {
  const id = String(it.widget);
  const items = Array.isArray(it.items) ? it.items.length : 3;
  const box: Record<string, [number, number]> = {
    headline: [n(it.width, 1500), n(it.size, 96) * 2.2], kinetic: [1400, n(it.size, 120) * 1.4], say: [1400, n(it.size, 110) * 1.5], tag: [300, 56], quote: [n(it.w, 1100), n(it.h, 420)],
    cards: [n(it.w, Math.min(1500, items * 400)), n(it.cardH, 260)], chips: [Math.min(1600, items * 300), 96], checklist: [n(it.w, 900), items * 96], steps: [n(it.w, 1400) + 160, 260],
    compare: [n(it.w, 1400), n(it.h, 440)], bento: [n(it.w, 1500), n(it.h, 460)], stat: [n(it.size, 200) * 3, n(it.size, 200) * 1.5], 'chart-line': [n(it.w, 760), n(it.h, 440)],
    bars: [n(it.w, 800), n(it.h, 460)], donut: [n(it.size, 360) * 1.15, n(it.size, 360) * 1.15], progress: [n(it.w, 900), 130], window: [n(it.w, 900), n(it.h, 560)], phone: [n(it.w, 330), n(it.w, 330) * 2.05],
    chat: [n(it.w, 900), Math.max(1, Array.isArray(it.messages) ? it.messages.length : 2) * 74], cutout: [n(it.w, 520) + 32, n(it.h, 380) + 32], 'graph-panel': [n(it.w, 900), n(it.h, 560)],
    slam: [Math.min(1700, str(it.text).length * n(it.size, 130) * 0.5), n(it.size, 130)], 'typewriter-tag': [str(it.text).length * 18 + 40, 52], tally: [Math.ceil(n(it.count, 7) / 5) * 170, 130], tape: [n(it.w, 220), 46], typing: [n(it.w, 1000), 110], button: [n(it.w, 420), 100], 'logo-reveal': [n(it.size, 220) * 2.5, n(it.size, 220) * 2.2],
  };
  const [w, h] = box[id] ?? [n(it.w, 520), n(it.h, 300)];
  return { w, h };
}
export { k as stepK, rnd, arr, n as num, str, clamp, accent, palOf, card, label };
