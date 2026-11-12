/** Style kit registry: built-in kits and the user's own styles (built on a base kit). */
import type { MotionPalette } from '../types';
import { EXPLAINER, frameExplainer } from './explainer';
import { DOCUMENTARY } from './documentary';
import { STICK } from './stick';
import { CARTOON } from './cartoon';
import type { StyleKit } from './types';

export const BUILTIN_KITS: StyleKit[] = [DOCUMENTARY, EXPLAINER, STICK, CARTOON];
export { STICK, CARTOON };

/** A user style: a base kit's scene designs with its own palette, font and art direction. */
export interface MyStyle { id: string; name: string; base: 'explainer' | 'documentary' | 'stick' | 'cartoon'; palette: MotionPalette; font?: string; direction?: string; createdAt: number }
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
  const base = m.base === 'documentary' ? DOCUMENTARY : m.base === 'stick' ? STICK : m.base === 'cartoon' ? CARTOON : EXPLAINER;
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
