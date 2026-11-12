/** Small builders for scene templates (frame-aware: landscape side by side, portrait stacked). */
import type { MotionItem } from '../types';
import type { SceneCtx } from './types';

let seq = 0;
const id = (p: string) => `${p}${(seq = (seq + 1) % 1e6).toString(36)}`;

/** A layer that lasts the whole scene unless told otherwise. */
export const layer = (c: SceneCtx, o: Partial<MotionItem> & { type: MotionItem['type'] }): MotionItem => ({ id: id(String(o.widget ?? o.type)), start: 0, dur: c.dur, ...o }) as MotionItem;
export const W = (c: SceneCtx, widget: string, o: Partial<MotionItem> = {}) => layer(c, { type: 'widget', widget, ...o });
export const T = (c: SceneCtx, text: string, o: Partial<MotionItem> = {}) => layer(c, { type: 'text', text, size: 96, weight: 900, font: c.font, color: c.pal.text, in: 'cinematic-rise', ...o });

export const portrait = (c: SceneCtx) => c.frame.h > c.frame.w * 1.1;
/** Unit: 1 at 1080p landscape height; widths scale with the frame. */
export const u = (c: SceneCtx) => Math.min(c.frame.w, c.frame.h) / 1080;
/** Usable width (safe area). */
export const safeW = (c: SceneCtx) => c.frame.w * 0.86;

/** Two-part composition: [visual position, text position] — left / right in landscape, top / bottom in portrait. */
export function pair(c: SceneCtx, flip = false) {
  if (portrait(c)) {
    const a = { x: 0, y: -c.frame.h * 0.17 }, b = { x: 0, y: c.frame.h * 0.2 };
    return { vis: flip ? b : a, txt: flip ? a : b, visW: c.frame.w * 0.82, txtW: c.frame.w * 0.84 };
  }
  const a = { x: -c.frame.w * 0.2, y: 0 }, b = { x: c.frame.w * 0.24, y: 0 };
  return { vis: flip ? b : a, txt: flip ? a : b, visW: c.frame.w * 0.4, txtW: c.frame.w * 0.36 };
}

/** Title size that keeps a phrase readable in the given width. */
export const titleSize = (text: string, width: number, max = 110) => Math.max(44, Math.min(max, (width / Math.max(6, text.length * 0.55)) * 1.05));

export const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');
/** A picture for this scene: the slot, else one of the project's images. */
export const pic = (c: SceneCtx, ref?: string, n = 0) => ref || (c.images.length ? c.images[(c.k + n) % c.images.length] : undefined);
