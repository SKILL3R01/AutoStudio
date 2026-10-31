import type { Motion, Transition } from '../types';
import { TRANSITIONS } from '../types';
import { easeInOut, hash, lerp } from '../lib/util';

export interface Xform {
  scale: number;
  dx: number;
  dy: number;
}

const RANDOM_POOL: Motion[] = ['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'tiltUp', 'tiltDown', 'diagonal', 'drift'];

export function resolveMotion(m: Motion, index: number): Motion {
  if (m === 'alternate') return index % 2 ? 'zoomOut' : 'zoomIn';
  if (m === 'random') return RANDOM_POOL[Math.floor(hash(index + 1) * RANDOM_POOL.length)];
  return m;
}

export function resolveTransition(t: Transition, index: number): Transition {
  if (t !== 'random') return t;
  const pool = TRANSITIONS.filter((x) => x !== 'none' && x !== 'random');
  return pool[Math.floor(hash(index * 7 + 3) * pool.length)];
}

/** Camera transform for a clip. `p` is clip progress 0..1, `local` is seconds since the clip started. */
export function motionXform(m: Motion, p: number, local: number, depth: number, index: number): Xform {
  const e = easeInOut(Math.min(1, Math.max(0, p)));
  const d = depth;
  const dir = hash(index + 11) > 0.5 ? 1 : -1;
  switch (m) {
    case 'zoomIn': return { scale: lerp(1, 1 + d, e), dx: 0, dy: 0 };
    case 'zoomOut': return { scale: lerp(1 + d, 1, e), dx: 0, dy: 0 };
    case 'panLeft': return { scale: 1 + d, dx: lerp(d / 2, -d / 2, e), dy: 0 };
    case 'panRight': return { scale: 1 + d, dx: lerp(-d / 2, d / 2, e), dy: 0 };
    case 'tiltUp': return { scale: 1 + d, dx: 0, dy: lerp(-d / 2, d / 2, e) };
    case 'tiltDown': return { scale: 1 + d, dx: 0, dy: lerp(d / 2, -d / 2, e) };
    case 'diagonal': return { scale: lerp(1 + d * 0.8, 1 + d * 1.2, e), dx: lerp(-d / 2, d / 2, e) * dir, dy: lerp(-d / 3, d / 3, e) };
    case 'drift': return { scale: 1 + d, dx: Math.sin(local * 0.5 + index) * d * 0.35, dy: Math.cos(local * 0.4 + index) * d * 0.25 };
    case 'breathe': return { scale: 1 + d / 2 + Math.sin(local * 1.6) * d / 2, dx: 0, dy: 0 };
    // Depth motions move the camera inside the parallax shader; only a small zoom hides edge stretching here.
    case 'parallaxZoom':
    case 'parallaxOrbit':
    case 'dollyZoom': return { scale: 1.04, dx: 0, dy: 0 };
    default: return { scale: 1, dx: 0, dy: 0 };
  }
}

export const isDepthMotion = (m: Motion) => m === 'parallaxZoom' || m === 'parallaxOrbit' || m === 'dollyZoom';

/** Virtual camera for the 2.5D parallax shader. */
export interface ParallaxCamera {
  /** Horizontal / vertical camera offset (fraction of the frame). */
  ox: number;
  oy: number;
  /** Push-in amount: near pixels grow faster than far ones. */
  push: number;
  /** Overall zoom of the far plane (used by dolly zoom). */
  zoom: number;
  strength: number;
}

export function parallaxCamera(m: Motion, p: number, local: number, depth: number, index: number): ParallaxCamera {
  const e = easeInOut(Math.min(1, Math.max(0, p)));
  const k = Math.max(0.05, depth) / 0.12;
  const dir = hash(index + 5) > 0.5 ? 1 : -1;
  if (m === 'parallaxOrbit') return { ox: Math.sin(local * 0.6 + index) * 0.03 * k, oy: Math.cos(local * 0.45 + index) * 0.015 * k, push: 0.02 * k, zoom: 1, strength: 1 };
  if (m === 'dollyZoom') return { ox: 0, oy: 0, push: lerp(0, 0.12, e) * k, zoom: lerp(1.08, 1, e), strength: 1 };
  return { ox: lerp(-0.02, 0.02, e) * dir * k, oy: 0, push: lerp(0, 0.08, e) * k, zoom: 1, strength: 1 };
}
