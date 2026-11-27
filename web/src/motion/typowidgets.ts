/**
 * Kinetic typography widgets (v6.1).
 * - `ktype`: words appear on their spoken time, each letter animated (wave, scramble, mask, blur, elastic, flip,
 *   track, stroke, slam, type) in a style (fill, outline, outlineFill, image = picture inside the letters, extrude).
 * - `kphoto`: a picture covering w×h with a slow push and an optional dark veil.
 */
import type { MotionItem } from './types';
import type { WidgetApi } from './widgets';

export const LETTER_ANIMS = ['wave', 'scramble', 'mask', 'blur', 'elastic', 'flip', 'track', 'stroke', 'slam', 'type'] as const;
export type LetterAnim = (typeof LETTER_ANIMS)[number];
export const TEXT_STYLES = ['fill', 'outline', 'outlineFill', 'image', 'extrude'] as const;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const outBack = (x: number) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const elastic = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@';
const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

/** When each word appears (seconds from the widget start): narration timing if it matches, else evenly spread. */
export function wordTimes(words: string[], spoken: { w: string; t: number }[], start: number, spread: number): number[] {
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const out: number[] = [];
  let j = 0;
  words.forEach((w, i) => {
    const k = spoken.findIndex((x, idx) => idx >= j && norm(x.w) === norm(w));
    if (k >= 0) (out.push(spoken[k].t), (j = k + 1));
    else out.push(start + (spread * i) / Math.max(1, words.length));
  });
  return out;
}

const patternCache = new WeakMap<CanvasImageSource, { key: string; pat: CanvasPattern }>();

function drawKtype(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) {
  const raw = s(it.text, '');
  const text = it.upper === false ? raw : raw.toUpperCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const size = n(it.size, 120), font = s(it.font, a.pal.font ?? 'Montserrat'), weight = n(it.weight, 900);
  const anim = s(it.anim, 'wave') as LetterAnim, style = s(it.style, 'fill');
  const color = s(it.color, a.pal.text), accent = s(it.accent, a.pal.accents[0]);
  const keys = new Set((Array.isArray(it.key) ? it.key : [it.key]).filter(Boolean).map((k) => String(k).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')));
  const maxW = n(it.width, 1500), lh = size * n(it.lineHeight, 1.02), stagger = n(it.stagger, 0.035), letterDur = n(it.letterDur, 0.45);
  ctx.font = `${weight} ${size}px "${font}"`;
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;
  // Lay out lines.
  const lines: { w: string; i: number; width: number }[][] = [[]];
  let lw = 0;
  words.forEach((w, i) => {
    const ww = ctx.measureText(w).width;
    if (lw && lw + space + ww > maxW) (lines.push([]), (lw = 0));
    lines[lines.length - 1].push({ w, i, width: ww });
    lw += (lw ? space : 0) + ww;
  });
  const times = wordTimes(words, a.words, n(it.textStart, 0.1), n(it.spread, Math.max(0.6, it.dur * 0.6)));
  const totalH = lines.length * lh, align = s(it.align, 'center');
  // Picture inside the letters: one pattern covering the text block.
  let pat: CanvasPattern | null = null;
  const img = style === 'image' && it.asset ? a.image(String(it.asset)) : undefined;
  if (img) {
    const bw = maxW, bh = totalH + size * 0.4, key = `${bw}x${bh}`;
    const hit = patternCache.get(img);
    if (hit?.key === key) pat = hit.pat;
    else {
      const c = document.createElement('canvas');
      c.width = Math.ceil(bw);
      c.height = Math.ceil(bh);
      const g = c.getContext('2d')!;
      const iw = (img as HTMLImageElement).width || 1, ih = (img as HTMLImageElement).height || 1, sc = Math.max(bw / iw, bh / ih);
      g.drawImage(img, (bw - iw * sc) / 2, (bh - ih * sc) / 2, iw * sc, ih * sc);
      pat = ctx.createPattern(c, 'no-repeat');
      if (pat) patternCache.set(img, { key, pat });
    }
    pat?.setTransform(new DOMMatrix().translate(-bw / 2, -bh / 2));
  }
  // Slam shake: a few frames of camera shake after each word lands.
  if (anim === 'slam') {
    const since = Math.min(...times.map((tw) => (t >= tw + 0.12 ? t - tw - 0.12 : 9)));
    if (since < 0.18) ctx.translate(Math.sin(since * 120) * size * 0.04 * (1 - since / 0.18), Math.cos(since * 97) * size * 0.03 * (1 - since / 0.18));
  }
  lines.forEach((ln, li) => {
    const width = ln.reduce((x, w) => x + w.width, 0) + space * (ln.length - 1);
    let x = align === 'left' ? -maxW / 2 : align === 'right' ? maxW / 2 - width : -width / 2;
    const y = -totalH / 2 + lh * (li + 0.5);
    for (const wd of ln) {
      const local = t - times[wd.i];
      const isKey = keys.has(wd.w.replace(/[^\p{L}\p{N}]/gu, ''));
      const outline = style === 'outline' || (style === 'outlineFill' && wd.i % 2 === 1);
      const fill = isKey ? accent : color;
      let cx = x;
      for (let k = 0; k < wd.w.length; k++) {
        const ch = wd.w[k], cw = ctx.measureText(ch).width;
        const e = clamp((local - k * stagger) / letterDur);
        if (anim === 'type' ? local - k * stagger < 0 : e <= 0) {
          cx += cw;
          continue;
        }
        ctx.save();
        ctx.translate(cx + cw / 2, y);
        let glyph = ch, alpha = 1;
        const oe = outCubic(e);
        switch (anim) {
          case 'wave': ctx.translate(0, (1 - oe) * size * 0.7 + Math.sin(t * 3 + k * 0.6 + wd.i) * size * 0.02); alpha = oe; break;
          case 'scramble': if (e < 1) glyph = GLYPHS[Math.floor((t * 24 + k * 7 + wd.i * 3) % GLYPHS.length)]; break;
          case 'mask': ctx.beginPath(); ctx.rect(-cw, -size * 0.55, cw * 2, size * 1.1); ctx.clip(); ctx.translate(0, (1 - oe) * size * 1.05); break;
          case 'blur': ctx.filter = `blur(${((1 - oe) * size * 0.15).toFixed(1)}px)`; alpha = oe; ctx.scale(1 + (1 - oe) * 0.3, 1 + (1 - oe) * 0.3); break;
          case 'elastic': { const sc = Math.max(0, elastic(e)); ctx.scale(sc, sc); break; }
          case 'flip': ctx.scale(1, Math.max(0.02, Math.sin(oe * Math.PI / 2))); alpha = clamp(e * 2); break;
          case 'track': ctx.translate((k - wd.w.length / 2) * (1 - oe) * size * 0.5, 0); alpha = oe; break;
          case 'slam': { const sc = 1 + (1 - outBack(clamp(e * 1.4))) * 1.6; ctx.scale(sc, sc); alpha = clamp(e * 3); break; }
          case 'stroke': break;
          case 'type': break;
        }
        ctx.globalAlpha *= alpha;
        if (style === 'extrude') {
          const depth = Math.max(3, Math.round(size * 0.08));
          ctx.fillStyle = a.shade(fill, -0.55);
          for (let d = depth; d > 0; d--) ctx.fillText(glyph, -cw / 2 + d * 0.7, d * 0.7);
        }
        if (anim === 'stroke') {
          ctx.strokeStyle = fill;
          ctx.lineWidth = Math.max(2, size * 0.035);
          ctx.save();
          ctx.beginPath();
          ctx.rect(-cw / 2 - 4, -size, (cw + 8) * clamp(e * 1.6), size * 2);
          ctx.clip();
          ctx.strokeText(glyph, -cw / 2, 0);
          ctx.restore();
          if (!outline) (ctx.globalAlpha *= clamp((e - 0.6) / 0.4)), (ctx.fillStyle = pat && !isKey ? pat : fill), pat && !isKey && ctx.translate(-(cx + cw / 2), -y), pat && !isKey ? ctx.fillText(glyph, cx, y) : ctx.fillText(glyph, -cw / 2, 0);
        } else if (outline) {
          ctx.strokeStyle = fill;
          ctx.lineWidth = Math.max(2, size * 0.035);
          ctx.strokeText(glyph, -cw / 2, 0);
        } else if (pat && !isKey) {
          // Pattern space = text block space: undo the per-letter translate.
          ctx.translate(-(cx + cw / 2), -y);
          ctx.fillStyle = pat;
          ctx.fillText(glyph, cx, y);
        } else {
          ctx.fillStyle = fill;
          ctx.fillText(glyph, -cw / 2, 0);
        }
        ctx.restore();
        cx += cw;
      }
      if (anim === 'type' && local >= 0 && local < wd.w.length * stagger + 0.3 && Math.floor(t * 4) % 2 === 0) (ctx.fillStyle = accent), ctx.fillRect(cx + 4, y - size * 0.4, size * 0.06, size * 0.8);
      x += wd.width + space;
    }
  });
}

function drawKphoto(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) {
  const w = n(it.w, a.frame.w), h = n(it.h, a.frame.h);
  const img = it.asset ? a.image(String(it.asset)) : undefined;
  ctx.save();
  if (img) {
    const z = 1 + n(it.push, 0.08) * clamp(t / Math.max(0.5, it.dur));
    ctx.scale(z, z);
    a.cover(img, w, h, n(it.radius, 0));
  } else {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, a.pal.card);
    g.addColorStop(1, a.shade(a.pal.card, -0.3));
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
  const veil = n(it.veil, 0);
  if (veil > 0) (ctx.fillStyle = `rgba(0,0,0,${veil})`), ctx.fillRect(-w / 2, -h / 2, w, h);
}

export const TYPO_WIDGETS: Record<string, (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void> = {
  ktype: drawKtype,
  kphoto: drawKphoto,
};
