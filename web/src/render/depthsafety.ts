import type { Clip, Motion } from '../types';
import { parallaxCamera, type ParallaxCamera } from './motion';
import { depthSpread, grayOf, safetyFactor } from './depthrefine';

const steepCache = new WeakMap<object, number>();
/** Depth spread of a depth image (measured once on a 256 px copy). */
export function spreadOf(depth: CanvasImageSource & { width: number; height: number }): number {
  const hit = steepCache.get(depth);
  if (hit !== undefined) return hit;
  const s = 256 / Math.max(depth.width, depth.height);
  const w = Math.max(8, Math.round(depth.width * s)), h = Math.max(8, Math.round(depth.height * s));
  let v = 0;
  try {
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(depth, 0, 0, w, h);
    v = depthSpread(grayOf(g.getImageData(0, 0, w, h).data));
  } catch {
    v = 0;
  }
  steepCache.set(depth, v);
  return v;
}

const limitCache = new Map<string, { factor: number; over: number }>();
/**
 * Keep a clip's 3D move under the visible-stretch limit: scales the camera (offset + push) by `factor`, and zooms in
 * by `over` so the move never shows past the picture's edge (no smeared borders).
 */
export function depthLimits(clip: Clip, motion: Motion, span: number, depthAmt: number, index: number, spread: number) {
  const quality = clip.depth?.quality ?? 'safe';
  const key = `${clip.id}:${motion}:${span.toFixed(2)}:${depthAmt.toFixed(3)}:${quality}:${spread.toFixed(2)}`;
  const hit = limitCache.get(key);
  if (hit) return hit;
  let maxOff = 0, maxPush = 0;
  for (let k = 0; k <= 24; k++) {
    const c = parallaxCamera(motion, k / 24, (k / 24) * span, depthAmt, index);
    maxOff = Math.max(maxOff, Math.abs(c.ox), Math.abs(c.oy));
    maxPush = Math.max(maxPush, c.push);
  }
  const factor = safetyFactor(spread, maxOff, maxPush, quality);
  const over = Math.min(1.12, 1 / Math.max(0.5, 1 - 2 * maxOff * factor));
  const r = { factor, over };
  if (limitCache.size > 500) limitCache.clear();
  limitCache.set(key, r);
  return r;
}

export const applyLimits = (c: ParallaxCamera, l: { factor: number; over: number }): ParallaxCamera => ({ ...c, ox: c.ox * l.factor, oy: c.oy * l.factor, push: c.push * l.factor, zoom: c.zoom * l.over });

/** Preview-only views of one clip (never used by export): its depth map, or the flat picture (before / after). */
export const depthView: { clipId: string | null; mode: 'map' | 'flat' | null } = { clipId: null, mode: null };
