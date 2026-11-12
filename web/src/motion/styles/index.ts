/** Style kit registry: built-in kits, "coming soon" kits and the user's own styles (built on a base kit). */
import type { MotionItem, MotionPalette } from '../types';
import { EXPLAINER, frameExplainer } from './explainer';
import { DOCUMENTARY } from './documentary';
import { layer } from './kit';
import type { SceneCtx, StyleKit } from './types';

const STICK_SVG = "<svg viewBox='0 0 200 260'><circle cx='100' cy='50' r='30' fill='none' stroke='#f5f6fa' stroke-width='10'/><path d='M100 80 L100 170 M100 105 L55 140 M100 105 L150 70 M100 170 L65 240 M100 170 L135 240' stroke='#f5f6fa' stroke-width='10' stroke-linecap='round' fill='none'/></svg>";
const BEAN_SVG = "<svg viewBox='0 0 220 280'><ellipse cx='110' cy='80' rx='62' ry='70' fill='#ffd7b0' stroke='#4a2340' stroke-width='8'/><circle cx='88' cy='78' r='9' fill='#4a2340'/><circle cx='132' cy='78' r='9' fill='#4a2340'/><path d='M85 112 Q110 132 135 112' stroke='#4a2340' stroke-width='7' fill='none' stroke-linecap='round'/><path d='M60 150 Q110 135 160 150 L172 262 L48 262 Z' fill='#ff7a45' stroke='#4a2340' stroke-width='8'/></svg>";

/** A teaser scene for the gallery card of a style that is not ready yet. */
const teaser = (svg: string, bg: string[]) => (items: MotionItem[], c: SceneCtx): MotionItem[] => [
  layer(c, { type: 'background', kind: 'gradient', colors: bg }),
  layer(c, { type: 'svg', svg, w: 260, h: 330, y: -10, loop: 'float', in: 'pop' }),
  layer(c, { type: 'widget', widget: 'tag', text: 'COMING SOON', y: 230 }),
  ...items,
];

export const STICK: StyleKit = {
  id: 'stick', name: 'Stick figure story', genre: 'story', status: 'soon',
  description: 'Cinematic stick figures in moody sets — stories and “what if” videos.',
  includes: ['characters with poses', 'expressions & talking', 'moody sets'],
  variants: [{ id: 'dusk', name: 'Dusk', palette: { bg: '#141826', card: '#20263a', text: '#f5f6fa', muted: '#9aa3b2', accents: ['#ff9f43', '#ffd27a', '#5ac8fa'], font: 'Montserrat' } }],
  font: 'Montserrat', templates: [], frameScene: teaser(STICK_SVG, ['#141826', '#3a2a4a']), direction: '', storyShape: 'setup → conflict → turning point → resolution → lesson', preview: [{ template: '', slots: {} }],
};
export const CARTOON: StyleKit = {
  id: 'cartoon', name: 'Cartoon', genre: 'cartoon', status: 'soon',
  description: 'Bean-head cartoon characters with ink outlines in painted sets.',
  includes: ['cartoon cast', 'painted sets', 'playful sound'],
  variants: [{ id: 'day', name: 'Day', palette: { bg: '#8fd3ff', card: '#fff6e5', text: '#2b1a2e', muted: '#6b5a6e', accents: ['#ff7a45', '#ffd23f', '#4caf50'], font: 'Poppins' } }],
  font: 'Poppins', templates: [], frameScene: teaser(BEAN_SVG, ['#8fd3ff', '#fff1c1']), direction: '', storyShape: 'hook fact → setting → 2–4 escalating beats → "But…" → ironic payoff', preview: [{ template: '', slots: {} }],
};

export const BUILTIN_KITS: StyleKit[] = [DOCUMENTARY, EXPLAINER, STICK, CARTOON];

/** A user style: a base kit's scene designs with its own palette, font and art direction. */
export interface MyStyle { id: string; name: string; base: 'explainer' | 'documentary'; palette: MotionPalette; font?: string; direction?: string; createdAt: number }
const KEY = 'myStyles';
export const loadMyStyles = (): MyStyle[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
export const saveMyStyles = (s: MyStyle[]) => localStorage.setItem(KEY, JSON.stringify(s));

export function kitOfMyStyle(m: MyStyle): StyleKit {
  const base = m.base === 'documentary' ? DOCUMENTARY : EXPLAINER;
  return { ...base, id: m.id, name: m.name, genre: 'custom', base: base.id, variants: [{ id: 'mine', name: m.name, palette: m.palette }], font: m.font ?? base.font, direction: m.direction ? `${base.direction}\n${m.direction}` : base.direction, frameScene: base.frameScene === frameExplainer ? frameExplainer : base.frameScene };
}

export const allKits = (): StyleKit[] => [...BUILTIN_KITS, ...loadMyStyles().map(kitOfMyStyle)];
export const getKit = (id?: string): StyleKit => allKits().find((k) => k.id === id) ?? DOCUMENTARY;
export const variantOf = (kit: StyleKit, id?: string) => kit.variants.find((v) => v.id === id) ?? kit.variants[0];

/** The most common colours of a picture (k-means on a small copy) → a palette for "From a picture". */
export function paletteFromPixels(data: Uint8ClampedArray, k = 5): string[] {
  const px: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 16) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return ['#111111', '#222222', '#ff6b4a', '#ffd23f', '#ffffff'];
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor((i / k) * px.length)]);
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let b = 0, bd = Infinity;
      cs.forEach((c, j) => {
        const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
        if (d < bd) (bd = d), (b = j);
      });
      sum[b][0] += p[0], sum[b][1] += p[1], sum[b][2] += p[2], sum[b][3]++;
    }
    cs = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cs[j]) as [number, number, number]);
  }
  const lum = (c: number[]) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  return cs.sort((a, b) => lum(a) - lum(b)).map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
/** Palette roles from extracted colours: darkest = background, lightest = text, the most saturated ones = accents. */
export function paletteFromColors(cols: string[]): MotionPalette {
  const sat = (h: string) => {
    const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return Math.max(...v) - Math.min(...v);
  };
  const acc = cols.slice(1, -1).sort((a, b) => sat(b) - sat(a));
  return { bg: cols[0], card: cols[1] ?? cols[0], text: cols[cols.length - 1], muted: cols[Math.max(0, cols.length - 2)], accents: acc.length ? acc : ['#ff6b4a', '#ffd23f'], font: 'Montserrat' };
}
