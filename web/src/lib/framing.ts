/** v3.3 framing: which part of a clip stays in frame, per output format. */
import type { Aspect, Clip } from '../types';

export interface Focus { x: number; y: number; zoom?: number }

export const ASPECTS: [Aspect, string][] = [['16:9', '16:9 · YouTube'], ['9:16', '9:16 · Shorts'], ['1:1', '1:1 · Square'], ['4:5', '4:5 · Feed']];
export const aspectRatio = (a: Aspect) => {
  const [w, h] = a.split(':').map(Number);
  return w / h;
};

export const focusOf = (c: Clip, a: Aspect): Focus => c.focus?.[a] ?? { x: 0.5, y: 0.5, zoom: 1 };

/**
 * Pixel shift for an image of w×h drawn at scale s (covering W×H) so the focus point sits as close to the frame
 * centre as possible without showing an edge.
 */
export function focusShift(w: number, h: number, W: number, H: number, s: number, f: Focus) {
  const ox = Math.max(0, (w * s - W) / 2), oy = Math.max(0, (h * s - H) / 2);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  return { dx: clamp((0.5 - f.x) * w * s, ox), dy: clamp((0.5 - f.y) * h * s, oy) };
}

/** The visible part of the image (fractions of its width / height) for an image aspect `ia` in a frame aspect `fa`. */
export function cropRect(ia: number, fa: number, f: Focus) {
  const z = Math.max(1, f.zoom ?? 1);
  const w = (fa > ia ? 1 : fa / ia) / z, h = (fa > ia ? ia / fa : 1) / z;
  const x = Math.max(0, Math.min(1 - w, f.x - w / 2)), y = Math.max(0, Math.min(1 - h, f.y - h / 2));
  return { x, y, w, h };
}
