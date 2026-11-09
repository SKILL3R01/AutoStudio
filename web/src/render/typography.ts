import type { TypoBlock, TypoRole } from '../types';
import { FONT_PAIRS, TYPO_PALETTES } from '../lib/typography';
import { drawOutlineWrite, drawPenWrite, penDuration } from './handdrawn';
import { clamp, easeInOut, easeOutBack, isRtl } from '../lib/util';

interface Item {
  word: number;
  text: string;
  family: string;
  weight: number;
  size: number;
  /** Centre in block-local pixels. */
  x: number;
  y: number;
  rot: number;
  w: number;
  role: TypoRole;
  color: string;
  outline?: boolean;
  marker?: boolean;
}

interface Layout {
  items: Item[];
  /** Bounding box in block-local pixels (centred on 0,0). */
  w: number;
  h: number;
}

let fontsVersion = 0;
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => void fontsVersion++);

/** Load every typography font so canvas measuring is right (call before export). */
export function ensureTypoFonts() {
  const fams = new Set<string>();
  Object.values(FONT_PAIRS).forEach((p) => [p.main, p.minor, p.script, p.side].forEach((f) => fams.add(`${f.weight} 40px "${f.family}"`)));
  return Promise.all([...fams].map((f) => document.fonts.load(f).catch(() => []))).then(() => document.fonts.ready);
}

const cache = new WeakMap<TypoBlock, { key: string; layout: Layout }>();
let mctx: CanvasRenderingContext2D | undefined;
const measure = (text: string, family: string, weight: number, size: number) => {
  mctx ??= document.createElement('canvas').getContext('2d')!;
  mctx.font = `${weight} ${size}px "${family}", sans-serif`;
  return mctx.measureText(text).width;
};

/** Lay out a block according to its template (pure geometry, cached per block + frame size). */
/** Palette / font pair with the block's own design overrides applied. */
export const palOf = (b: TypoBlock) => ({ ...(TYPO_PALETTES[b.palette] ?? TYPO_PALETTES['mono-yellow']), ...b.style?.colors });
export const pairOf = (b: TypoBlock) => ({ ...(FONT_PAIRS[b.fontPair] ?? FONT_PAIRS['spartan-pacifico']), ...b.style?.fonts });

let beatTimes: number[] = [];
const snapBeat = (t: number) => {
  let best = t, d = 0.3;
  for (const x of beatTimes) if (Math.abs(x - t) < d) (d = Math.abs(x - t)), (best = x);
  return best;
};

export function layoutBlock(b: TypoBlock, W: number, H: number): Layout {
  const key = `${W}x${H}:${fontsVersion}`;
  const hit = cache.get(b);
  if (hit && hit.key === key) return hit.layout;
  const pair = pairOf(b);
  const pal = palOf(b);
  const F = Math.min(W, (H * 16) / 9) * 0.07;
  const Wt = F * 5.2;
  const rtl = isRtl(b.words.map((w) => w.text).join(' '));
  const items: Item[] = [];
  const fontOf = (role: TypoRole) => (role === 'script' || role === 'accent' ? pair.script : role === 'side' ? pair.side : role === 'minor' ? pair.minor : pair.main);
  /** Script words are lowercase handwriting, everything else is caps (RTL scripts are left as typed). */
  const label = (i: number) => {
    const w = b.words[i];
    const caps = b.style?.caps ?? 'auto';
    if (rtl || caps === 'none') return w.text;
    if (caps === 'upper') return w.text.toLocaleUpperCase();
    return w.role === 'script' || w.role === 'accent' ? w.text.toLocaleLowerCase() : w.text.toLocaleUpperCase();
  };
  const colorOf = (i: number, fallback?: string) => b.words[i].color ?? fallback ?? (b.words[i].role === 'script' || b.words[i].role === 'accent' ? pal.accent : b.words[i].role === 'main' ? pal.text : pal.minor);
  const add = (i: number, size: number, x: number, y: number, extra: Partial<Item> = {}) => {
    const f = b.words[i].font ? { family: b.words[i].font!, weight: fontOf(b.words[i].role).weight } : fontOf(b.words[i].role);
    const text = label(i);
    items.push({ word: i, text, family: f.family, weight: f.weight, size, x, y, rot: 0, w: measure(text, f.family, f.weight, size), role: b.words[i].role, color: colorOf(i), ...extra });
  };
  /** Font size so `text` spans exactly `width`. */
  const fit = (i: number, width: number, lo = 0.5, hi = 2.6) => {
    const f = b.words[i].font ? { family: b.words[i].font!, weight: fontOf(b.words[i].role).weight } : fontOf(b.words[i].role);
    const w = measure(label(i), f.family, f.weight, F);
    return clamp((F * width) / Math.max(1, w), F * lo, F * hi);
  };
  const idx = b.words.map((_, i) => i);
  const by = (roles: TypoRole[]) => idx.filter((i) => roles.includes(b.words[i].role));

  switch (b.template) {
    case 'stack':
    case 'stackSide': {
      const stackWords = b.template === 'stackSide' ? by(['main', 'minor']) : by(['main', 'minor', 'side']);
      let y = 0;
      const rows: { i: number; size: number; y: number }[] = [];
      for (const i of stackWords) {
        const size = b.words[i].role === 'minor' ? F * 0.62 : fit(i, Wt);
        rows.push({ i, size, y: y + size * 0.43 });
        y += size * 0.86;
      }
      const sh = y;
      rows.forEach((r) => {
        const w = measure(label(r.i), fontOf(b.words[r.i].role).family, fontOf(b.words[r.i].role).weight, r.size);
        add(r.i, r.size, -Wt / 2 + w / 2, r.y - sh / 2);
      });
      let left = -Wt / 2;
      for (const i of by(['script', 'accent'])) {
        const size = b.template === 'stackSide' ? Math.max(F * 0.6, sh * 0.32) : F * 0.95;
        if (b.template === 'stackSide') {
          add(i, size, left - size * 0.42, sh * 0.12, { rot: -Math.PI / 2 });
          left -= size * 0.85;
        } else add(i, size, -Wt / 2 + measure(label(i), pair.script.family, pair.script.weight, size) / 2 - F * 0.2, -sh / 2 - size * 0.25, { rot: -0.12 });
      }
      for (const i of b.template === 'stackSide' ? by(['side']) : []) {
        const f = fontOf('side');
        const w = measure(label(i), f.family, f.weight, F);
        const size = clamp((F * sh * 0.98) / Math.max(1, w), F * 0.3, F * 1.2);
        add(i, size, left - size * 0.55, 0, { rot: -Math.PI / 2 });
        left -= size * 1.1;
      }
      break;
    }
    case 'mixed': {
      // Big lines, the 2nd outlined, the 3rd in the accent colour; small words ride on the right of the line above.
      let y = 0, line = 0;
      const placed: { i: number; size: number; y: number; small?: boolean; prevRight?: number }[] = [];
      let lastRight = 0, lastTop = 0;
      for (const i of idx) {
        const big = b.words[i].role === 'main' || b.words[i].role === 'side';
        if (big || !placed.length) {
          const width = line === 2 ? Wt * 0.72 : Wt * (line === 1 ? 0.92 : 1);
          const size = fit(i, width);
          placed.push({ i, size, y: y + size * 0.43 });
          lastTop = y;
          lastRight = -Wt / 2 + width;
          y += size * 0.86;
          line++;
        } else {
          placed.push({ i, size: F * 0.5, y: lastTop + F * 0.3, small: true, prevRight: lastRight });
        }
      }
      const sh = y;
      placed.forEach((r) => {
        if (r.small) {
          const w = measure(label(r.i), fontOf('minor').family, fontOf('minor').weight, r.size);
          add(r.i, r.size, r.prevRight! + w / 2 + F * 0.08, r.y - sh / 2, { color: colorOf(r.i, pal.minor) });
        } else {
          const n = placed.filter((x) => !x.small).indexOf(r);
          const f = fontOf(b.words[r.i].role);
          const w = measure(label(r.i), f.family, f.weight, r.size);
          add(r.i, r.size, -Wt / 2 + w / 2, r.y - sh / 2, n === 1 ? { outline: true } : n === 2 ? { color: colorOf(r.i, pal.accent) } : {});
        }
      });
      break;
    }
    case 'scriptCaps': {
      const scripts = by(['script', 'accent']);
      const caps = by(['main', 'minor', 'side']);
      const capText = caps.map(label).join(' ');
      const fm = pair.main;
      const capSize = caps.length ? clamp((F * Wt) / Math.max(1, measure(capText, fm.family, fm.weight, F)), F * 0.6, F * 2.4) : 0;
      const sSize = F * 1.15;
      const total = (scripts.length ? sSize * 0.95 : 0) + capSize * 0.86;
      let x = -Wt / 2;
      scripts.forEach((i) => {
        const w = measure(label(i), pair.script.family, pair.script.weight, sSize);
        add(i, sSize, x + w / 2, -total / 2 + sSize * 0.45, { rot: -0.06 });
        x += w + sSize * 0.25;
      });
      x = -Wt / 2;
      const capY = -total / 2 + (scripts.length ? sSize * 0.95 : 0) + capSize * 0.43;
      caps.forEach((i) => {
        const f = fontOf(b.words[i].role);
        const w = measure(label(i), f.family, f.weight, capSize);
        add(i, capSize, x + w / 2, capY);
        x += w + capSize * 0.22;
      });
      break;
    }
    case 'punch': {
      const mains = by(['main', 'side']);
      const rest = by(['minor', 'script', 'accent']);
      let y = 0;
      rest.forEach((i) => {
        add(i, F * 0.55, 0, y + F * 0.3);
        y += F * 0.62;
      });
      mains.forEach((i, k) => {
        const size = fit(i, Wt * 1.05, 0.8, 3);
        add(i, size, 0, y + size * 0.43, k === mains.length - 1 ? { marker: true } : {});
        y += size * 0.9;
      });
      items.forEach((it) => (it.y -= y / 2));
      break;
    }
  }
  if (rtl) items.forEach((it) => (it.x = -it.x));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) {
    const vertical = Math.abs(Math.abs(it.rot) - Math.PI / 2) < 0.1;
    const hw = (vertical ? it.size * 0.45 : it.w / 2), hh = (vertical ? it.w / 2 : it.size * 0.45);
    x0 = Math.min(x0, it.x - hw); x1 = Math.max(x1, it.x + hw); y0 = Math.min(y0, it.y - hh); y1 = Math.max(y1, it.y + hh);
  }
  // Re-centre so the visual box is centred on (0,0).
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  items.forEach((it) => ((it.x -= cx), (it.y -= cy)));
  const layout = { items, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  cache.set(b, { key, layout });
  return layout;
}

/** Scale that keeps the block inside the frame, times the user's scale. */
const fitScale = (L: Layout, b: TypoBlock, W: number, H: number) => Math.min(1, (W * 0.9) / L.w, (H * 0.78) / L.h) * b.scale;

/** Frame-space box of a block (for hit-testing and the selection frame), as fractions of W/H. */
export function blockBox(b: TypoBlock, W: number, H: number) {
  const L = layoutBlock(b, W, H);
  const s = fitScale(L, b, W, H);
  return { x: b.x, y: b.y, w: (L.w * s) / W + 0.02, h: (L.h * s) / H + 0.02 };
}

export function drawTypography(ctx: CanvasRenderingContext2D, blocks: TypoBlock[], t: number, W: number, H: number, beats: number[] = []) {
  beatTimes = beats;
  for (const b of blocks) if (t >= b.start - 0.05 && t <= b.end + 0.3 && b.words.length) drawBlock(ctx, b, t, W, H);
}

function drawBlock(ctx: CanvasRenderingContext2D, b: TypoBlock, t: number, W: number, H: number) {
  const L = layoutBlock(b, W, H);
  const pal = palOf(b);
  const speed = b.speed ?? 1;
  const exitMode = b.exit ?? 'auto';
  const exit = exitMode === 'none' ? (t > b.end ? 1 : 0) : clamp((t - b.end) / (0.3 / speed), 0, 1);
  const enter = clamp((t - b.start + 0.05) / 0.2, 0, 1);
  const ex = easeInOut(exit);
  const exitScale = exitMode === 'auto' ? 1 + 0.06 * ex : exitMode === 'zoomOut' ? 1 - 0.4 * ex : 1;
  const s = fitScale(L, b, W, H) * exitScale;
  const alpha = enter * (1 - exit);
  if (alpha <= 0) return;
  ctx.save();
  if (b.bg === 'frame') {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pal.frame;
    ctx.fillRect(0, 0, W, H);
  }
  const half = (L.w * s) / 2, halfH = (L.h * s) / 2;
  ctx.translate(clamp(b.x * W, Math.min(W / 2, half + W * 0.02), Math.max(W / 2, W - half - W * 0.02)), clamp(b.y * H, Math.min(H / 2, halfH + H * 0.02), Math.max(H / 2, H - halfH - H * 0.02)) - (exitMode === 'slideOut' ? ex * H * 0.08 : 0));
  ctx.rotate((b.rotate * Math.PI) / 180);
  ctx.scale(s, s);
  if (b.bg === 'card') {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pal.card;
    const pad = L.h * 0.12;
    ctx.beginPath();
    ctx.roundRect(-L.w / 2 - pad, -L.h / 2 - pad, L.w + pad * 2, L.h + pad * 2, pad * 0.8);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const it of L.items) {
    const w = b.words[it.word];
    // Stagger > 0 reveals words at a fixed rhythm from the block start instead of when they are spoken.
    const ws = b.stagger ? b.start + it.word * b.stagger : b.timing === 'lead' ? w.start - 0.15 : b.timing === 'beat' ? snapBeat(w.start) : w.start;
    if (t < ws - 0.02) continue;
    const a = clamp(((t - ws + 0.02) * speed) / 0.26, 0, 1);
    const anim = w.anim ?? b.enter ?? 'auto';
    let sc = 1, dx = 0, dy = 0, al = a;
    let reveal = anim === 'auto' ? (it.role === 'script' || it.role === 'accent' ? easeInOut(a) : 1) : 1;
    if (anim === 'auto') {
      if (it.role === 'main') {
        sc = 1 + (1 - easeOutBack(a)) * 0.35;
        al = clamp(a * 2, 0, 1);
      } else if (it.role === 'minor') dy = (1 - easeInOut(a)) * it.size * 0.45;
      else if (it.role === 'side') dx = (1 - easeInOut(a)) * it.size * 1.2;
    } else if (anim === 'pop') {
      sc = 0.3 + 0.7 * easeOutBack(a);
      al = clamp(a * 3, 0, 1);
    } else if (anim === 'slam') {
      sc = 1 + (1 - a) * (1 - a) * 1.4;
      al = clamp(a * 3, 0, 1);
    } else if (anim === 'slide') dx = (1 - easeInOut(a)) * it.size * 1.4;
    else if (anim === 'drop') dy = -(1 - easeOutBack(a)) * it.size * 0.9;
    else if (anim === 'zoom') sc = 0.55 + 0.45 * easeInOut(a);
    else if (anim === 'draw') {
      reveal = easeInOut(a);
      al = 1;
    } else if (anim === 'typewriter') {
      const n = Math.max(1, w.text.length);
      reveal = Math.ceil(a * n) / n;
      al = 1;
    } else if (anim === 'outline' || anim === 'pen') al = 1;
    // Hand-drawn words take as long as a pen would need for the word.
    const written = clamp(((t - ws) * speed) / penDuration(it.text), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * al;
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.translate(dx, dy);
    ctx.scale(sc, sc);
    ctx.font = `${it.weight} ${it.size}px "${it.family}", sans-serif`;
    ctx.letterSpacing = it.role === 'main' || it.role === 'side' ? `${-it.size * 0.02}px` : '0px';
    if (reveal < 1) {
      // Hand-drawn / typewriter reveal: the word is uncovered left to right.
      ctx.beginPath();
      ctx.rect(-it.w / 2 - it.size * 0.3, -it.size, (it.w + it.size * 0.6) * reveal, it.size * 2);
      ctx.clip();
    }
    if (b.bg === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = it.size * 0.12;
      ctx.shadowOffsetY = it.size * 0.04;
    }
    if (b.style?.glow) {
      ctx.shadowColor = it.color;
      ctx.shadowBlur = it.size * 0.45 * b.style.glow;
      ctx.shadowOffsetY = 0;
    }
    if (it.marker) {
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = pal.accent;
      ctx.fillRect(-it.w / 2, it.size * 0.36, it.w * easeInOut(clamp((t - w.start - 0.15) / 0.3, 0, 1)), it.size * 0.11);
      ctx.restore();
    }
    if (anim === 'pen') {
      drawPenWrite(ctx, it.text, 0, 0, written, it.color, it.size, b.penFont ?? (it.role === 'script' || it.role === 'accent' ? 'allure' : 'readability'), it.w * 1.15);
    } else if (anim === 'outline') {
      drawOutlineWrite(ctx, it.text, 0, 0, written, it.color, it.size);
    } else if (it.outline) {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = Math.max(2, it.size * 0.035);
      ctx.strokeText(it.text, 0, 0);
    } else {
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, 0, 0);
    }
    ctx.restore();
  }
  ctx.restore();
}
