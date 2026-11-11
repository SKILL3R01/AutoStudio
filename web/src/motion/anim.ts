/** Motion animation engine: eases, keyframes, in / out / loop presets (mapped by name), reveals and the camera. */
import type { MotionItem, MotionKey } from './types';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const EASES: Record<string, (x: number) => number> = {
  linear: (x) => x,
  ease: (x) => x * x * (3 - 2 * x),
  'ease-in': (x) => x * x * x,
  'ease-out': (x) => 1 - (1 - x) ** 3,
  strong: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  'fast-slow': (x) => 1 - (1 - x) ** 4,
  overshoot: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  bounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
  spring: (x) => 1 - Math.cos(x * Math.PI * 2.5) * Math.exp(-x * 6),
  hold: (x) => (x < 1 ? 0 : 1),
};
export const ease = (name: string | undefined, x: number) => (EASES[name ?? 'ease'] ?? EASES.ease)(clamp(x));

/** Value of a keyed property at local time t (keys hold absolute values; missing keys use `base`). */
export function keyed(keys: MotionKey[] | undefined, prop: keyof MotionKey, t: number, base: number): number {
  const ks = (keys ?? []).filter((k) => typeof k[prop] === 'number').sort((a, b) => a.t - b.t);
  if (!ks.length) return base;
  if (t <= ks[0].t) return ks[0][prop] as number;
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i].t) {
      const a = ks[i - 1], b = ks[i];
      return (a[prop] as number) + ((b[prop] as number) - (a[prop] as number)) * ease(b.ease, (t - a.t) / Math.max(1e-6, b.t - a.t));
    }
  }
  return ks[ks.length - 1][prop] as number;
}

export interface Pose { dx: number; dy: number; scale: number; sx: number; sy: number; rot: number; alpha: number; blur: number; reveal: number; letters: number; jitter: number; glow: number }
const BASE: Pose = { dx: 0, dy: 0, scale: 1, sx: 1, sy: 1, rot: 0, alpha: 1, blur: 0, reveal: 1, letters: 1, jitter: 0, glow: 0 };

export type Family = 'fade' | 'rise' | 'drop' | 'pop' | 'blur' | 'wipe' | 'letters' | 'words' | 'slideL' | 'slideR' | 'flicker' | 'stomp' | 'spin' | 'zoomOut' | 'glow';
/** Map any preset name from the recipe vocabulary onto an animation family. */
export function familyOf(name = ''): Family {
  const n = name.toLowerCase();
  if (/typewriter|type-reveal|letter|backspace/.test(n)) return 'letters';
  if (/words|saas-words|falling-words|bounce-words/.test(n)) return 'words';
  if (/glitch|flicker|flash/.test(n)) return 'flicker';
  if (/stomp|slam|punch|kinetic-punch/.test(n)) return 'stomp';
  if (/glow/.test(n)) return 'glow';
  if (/blur|focus|defocus/.test(n)) return 'blur';
  if (/wipe|mask|reveal|marker|draw/.test(n)) return 'wipe';
  if (/spin|rotate|swing|flip/.test(n)) return 'spin';
  if (/slide-left|from-right|slide-to-left|skew|whip/.test(n)) return 'slideL';
  if (/slide-right|from-left|slide-to-right/.test(n)) return 'slideR';
  if (/drop|fall|rain|from-top|slide-down|sink/.test(n)) return 'drop';
  if (/zoom-out|scale-down|shrink|squeeze/.test(n)) return 'zoomOut';
  if (/pop|bounce|elastic|jelly|squash|burst|zoom|scale|overshoot|stretch|snap|punch/.test(n)) return 'pop';
  if (/rise|up|lift|from-bottom|cinematic/.test(n)) return 'rise';
  return 'fade';
}

/** Pose for entering (`p` 0→1) or leaving (`p` 1→0) with a family. */
function famPose(f: Family, p: number, size: number): Partial<Pose> {
  const e = ease('fast-slow', p), o = ease('overshoot', p);
  switch (f) {
    case 'rise': return { alpha: e, dy: (1 - e) * size * 0.5 };
    case 'drop': return { alpha: e, dy: -(1 - ease('bounce', p)) * size * 0.8 };
    case 'pop': return { alpha: clamp(p * 3), scale: 0.4 + 0.6 * o };
    case 'stomp': return { alpha: clamp(p * 4), scale: 1 + (1 - ease('ease-out', p)) * 1.2 };
    case 'blur': return { alpha: e, blur: (1 - e) * 18 };
    case 'glow': return { alpha: e, dy: (1 - e) * size * 0.3, glow: 1 - e, blur: (1 - e) * 8 };
    case 'wipe': return { reveal: e };
    case 'letters': return { letters: p };
    case 'words': return { letters: p, dy: 0 };
    case 'slideL': return { alpha: e, dx: (1 - e) * size * 2 };
    case 'slideR': return { alpha: e, dx: -(1 - e) * size * 2 };
    case 'flicker': return { alpha: p >= 1 ? 1 : Math.sin(p * 40) > 0 ? p : 0.1, jitter: (1 - p) * 6 };
    case 'spin': return { alpha: e, rot: (1 - o) * -25 };
    case 'zoomOut': return { alpha: e, scale: 1 + (1 - e) * 0.6 };
    default: return { alpha: e };
  }
}

const IN_DUR = 0.6, OUT_DUR = 0.4;

/** Full pose of an item at local time t (0 … dur): in, out, loop, keys and reveal combined. */
export function poseAt(it: MotionItem, t: number, size = 100): Pose {
  const p: Pose = { ...BASE };
  const apply = (q: Partial<Pose>) => {
    if (q.dx !== undefined) p.dx += q.dx;
    if (q.dy !== undefined) p.dy += q.dy;
    if (q.scale !== undefined) p.scale *= q.scale;
    if (q.rot !== undefined) p.rot += q.rot;
    if (q.alpha !== undefined) p.alpha *= q.alpha;
    if (q.blur !== undefined) p.blur += q.blur;
    if (q.reveal !== undefined) p.reveal = Math.min(p.reveal, q.reveal);
    if (q.letters !== undefined) p.letters = Math.min(p.letters, q.letters);
    if (q.jitter !== undefined) p.jitter += q.jitter;
    if (q.glow !== undefined) p.glow = Math.max(p.glow, q.glow);
  };
  if (it.in && it.in !== 'none') {
    const fam = familyOf(it.in), d = fam === 'letters' || fam === 'words' ? Math.min(it.dur * 0.6, 1.2) : IN_DUR;
    if (t < d) apply(famPose(fam, t / d, size));
  }
  if (it.out && it.out !== 'none') {
    const left = it.dur - t;
    if (left < OUT_DUR) apply(famPose(familyOf(it.out), left / OUT_DUR, size));
  }
  if (it.loop) {
    const l = it.loop.toLowerCase();
    if (/float|hop/.test(l)) apply({ dy: Math.sin(t * 2) * size * 0.06 });
    else if (/pulse|heartbeat/.test(l)) apply({ scale: 1 + Math.max(0, Math.sin(t * 5)) * 0.05 });
    else if (/rotate/.test(l)) apply({ rot: t * 12 });
    else if (/shake|handheld|wiggle/.test(l)) apply({ dx: Math.sin(t * 23) * 2, dy: Math.cos(t * 19) * 2 });
    else if (/swing|wave|wobble|jelly/.test(l)) apply({ rot: Math.sin(t * 3) * 4 });
    else if (/ken-burns/.test(l)) apply({ scale: 1 + (t / Math.max(1, it.dur)) * 0.06 });
  }
  if (it.reveal) {
    const a = typeof it.revealAt === 'number' ? it.revealAt : 0, d = typeof it.revealDur === 'number' ? it.revealDur : 0.8;
    apply({ reveal: ease('fast-slow', (t - a) / d) });
  }
  // Keys hold absolute values relative to the item's own x / y / scale.
  if (it.keys?.length) {
    p.dx += keyed(it.keys, 'x', t, it.x ?? 0) - (it.x ?? 0);
    p.dy += keyed(it.keys, 'y', t, it.y ?? 0) - (it.y ?? 0);
    p.scale *= keyed(it.keys, 'scale', t, 1);
    p.sx *= keyed(it.keys, 'sx', t, 1);
    p.sy *= keyed(it.keys, 'sy', t, 1);
    p.rot += keyed(it.keys, 'rotation', t, 0);
    p.alpha *= keyed(it.keys, 'opacity', t, 1);
    p.blur += keyed(it.keys, 'blur', t, 0);
  }
  p.alpha *= typeof it.opacity === 'number' ? it.opacity : 1;
  return p;
}

/** Camera of a group at local time t: zoom around a look-at point (frame coords), plus rotation and shake. */
export function cameraAt(items: MotionItem[], t: number): { zoom: number; x: number; y: number; rot: number } {
  const cam = items.find((i) => i.type === 'camera' && t >= i.start && t < i.start + i.dur);
  if (!cam) return { zoom: 1, x: 0, y: 0, rot: 0 };
  const lt = t - cam.start, ks = cam.keys ?? [];
  const shake = typeof cam.shake === 'number' ? cam.shake : 0;
  return {
    zoom: Math.max(0.2, keyed(ks, 'zoom', lt, 1)),
    x: keyed(ks, 'x', lt, 0) + (shake ? Math.sin(lt * 31) * shake * 6 : 0),
    y: keyed(ks, 'y', lt, 0) + (shake ? Math.cos(lt * 27) * shake * 6 : 0),
    rot: keyed(ks, 'rotation', lt, 0),
  };
}
