/**
 * Single-line "pen" fonts (SVG fonts from the EMS collection, SIL OFL) for real handwriting animation:
 * each letter is a list of strokes, drawn progressively so the text appears to be written by a pen.
 */
import allure from '../assets/strokefonts/EMSAllure.svg?raw';
import readability from '../assets/strokefonts/EMSReadability.svg?raw';
import felix from '../assets/strokefonts/EMSFelix.svg?raw';
import tech from '../assets/strokefonts/EMSTech.svg?raw';

export const PEN_FONTS = { allure: 'Script (Allure)', readability: 'Handwriting', felix: 'Marker (Felix)', tech: 'Technical' } as const;
export type PenFont = keyof typeof PEN_FONTS;
const SOURCES: Record<PenFont, string> = { allure, readability, felix, tech };

type Pt = [number, number];
interface Glyph {
  adv: number;
  strokes: Pt[][];
}
export interface StrokeFont {
  em: number;
  ascent: number;
  glyphs: Map<string, Glyph>;
  missing: number;
}

/** Parse an SVG path with M / L / C (cubics are flattened) into polylines. */
export function parsePath(d: string): Pt[][] {
  const tok = d.match(/[MLCmlc]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [], cmd = 'M', i = 0, x = 0, y = 0;
  const num = () => +tok[i++];
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      x = (rel ? x : 0) + num();
      y = (rel ? y : 0) + num();
      if (cur.length > 1) out.push(cur);
      cur = [[x, y]];
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      x = (rel ? x : 0) + num();
      y = (rel ? y : 0) + num();
      cur.push([x, y]);
    } else if (C === 'C') {
      const ox = rel ? x : 0, oy = rel ? y : 0;
      const p1: Pt = [ox + num(), oy + num()], p2: Pt = [ox + num(), oy + num()], p3: Pt = [ox + num(), oy + num()];
      const p0: Pt = [x, y];
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t;
        cur.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
      }
      [x, y] = p3;
    } else i++;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function parseSvgFont(svg: string): StrokeFont {
  const face = svg.match(/<font-face[\s\S]*?\/>/)?.[0] ?? '';
  const font = svg.match(/<font\s[^>]*>/)?.[0] ?? '';
  const glyphs = new Map<string, Glyph>();
  for (const g of svg.match(/<glyph[\s\S]*?\/>/g) ?? []) {
    const u = attr(g, 'unicode');
    if (u === undefined) continue;
    glyphs.set(decode(u), { adv: +(attr(g, 'horiz-adv-x') ?? attr(font, 'horiz-adv-x') ?? 500), strokes: parsePath(attr(g, 'd') ?? '') });
  }
  return { em: +(attr(face, 'units-per-em') ?? 1000), ascent: +(attr(face, 'ascent') ?? 800), glyphs, missing: +(attr(font, 'horiz-adv-x') ?? 400) };
}

const cache = new Map<PenFont, StrokeFont>();
export const penFont = (id: PenFont) => {
  let f = cache.get(id);
  if (!f) cache.set(id, (f = parseSvgFont(SOURCES[id] ?? SOURCES.readability)));
  return f;
};

export interface PenLayout {
  /** Strokes in pixels, origin = left end of the baseline, y down. */
  strokes: Pt[][];
  /** Cumulative length at the end of each stroke. */
  ends: number[];
  length: number;
  width: number;
}

/** Lay out a line of text at a font size in px (y flipped to canvas coordinates). Unknown characters are skipped. */
export function layoutPen(text: string, id: PenFont, size: number, letterSpacing = 0): PenLayout {
  const f = penFont(id);
  const k = size / f.em;
  const strokes: Pt[][] = [];
  let x = 0;
  for (const ch of text) {
    const g = f.glyphs.get(ch) ?? f.glyphs.get(ch.toLowerCase());
    if (g) for (const s of g.strokes) strokes.push(s.map(([px, py]) => [x + px * k, -py * k]));
    x += (g?.adv ?? f.missing) * k + letterSpacing;
  }
  const ends: number[] = [];
  let total = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    ends.push(total);
  }
  return { strokes, ends, length: total, width: x };
}

/** Draw the first `progress` (0..1) of the strokes — like a pen writing at constant speed. Returns the pen tip. */
export function drawPen(ctx: CanvasRenderingContext2D, L: PenLayout, progress: number): Pt | null {
  const target = L.length * Math.max(0, Math.min(1, progress));
  let done = 0, tip: Pt | null = null;
  ctx.beginPath();
  for (let s = 0; s < L.strokes.length && done < target; s++) {
    const pts = L.strokes[s];
    ctx.moveTo(pts[0][0], pts[0][1]);
    tip = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (done + seg >= target) {
        const f = seg ? (target - done) / seg : 1;
        tip = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
        ctx.lineTo(tip[0], tip[1]);
        done = target;
        break;
      }
      ctx.lineTo(pts[i][0], pts[i][1]);
      tip = pts[i];
      done += seg;
    }
  }
  ctx.stroke();
  return tip;
}
