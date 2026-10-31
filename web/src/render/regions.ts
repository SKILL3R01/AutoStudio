import type { Clip, Region } from '../types';
import { hash } from '../lib/util';
import type { Drawable, FrameSource, RenderModel } from './renderer';

const MAX = 1280;

interface MaskInfo {
  /** Mask scaled to the working size, alpha = selection. */
  canvas: HTMLCanvasElement;
  cx: number;
  cy: number;
  bbox: [number, number, number, number];
  points: [number, number][];
}

const maskCache = new WeakMap<object, Map<string, MaskInfo>>();
const pool: HTMLCanvasElement[] = [];

function scratch(i: number, w: number, h: number) {
  const c = (pool[i] ??= document.createElement('canvas'));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d', { willReadFrequently: false })!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.clearRect(0, 0, w, h);
  return { c, g };
}

const dims = (d: Drawable) => (d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight } : { w: d.width, h: d.height });

function maskInfo(mask: Drawable, w: number, h: number): MaskInfo {
  let byKey = maskCache.get(mask);
  if (!byKey) maskCache.set(mask, (byKey = new Map()));
  const key = `${w}x${h}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(mask, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  let sx = 0, sy = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  const points: [number, number][] = [];
  const step = Math.max(2, Math.floor(Math.sqrt((w * h) / 20000)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        sx += x; sy += y; n++;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        if (hash(x * 7.1 + y * 3.3) > 0.9 && points.length < 500) points.push([x, y]);
      }
    }
  }
  const info: MaskInfo = { canvas, cx: n ? sx / n : w / 2, cy: n ? sy / n : h / 2, bbox: [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)], points };
  byKey.set(key, info);
  return info;
}

/** Strength 0..1 of a region at time t, depending on its trigger. */
function envelope(r: Region, t: number, m: RenderModel) {
  if (r.trigger === 'loop') return 1;
  const hits = r.trigger === 'beats' ? m.beats : m.project.keywords.map((k) => k.start);
  let last = -Infinity;
  for (const b of hits) if (b <= t && b > last) last = b;
  return Math.exp(-(t - last) * (3 + r.speed * 3));
}

/** Draw `src` masked by `mask` into a scratch canvas. */
function masked(slot: number, src: Drawable, mask: HTMLCanvasElement, w: number, h: number, filter = 'none') {
  const s = scratch(slot, w, h);
  s.g.filter = filter;
  s.g.drawImage(src, 0, 0, w, h);
  s.g.filter = 'none';
  s.g.globalCompositeOperation = 'destination-in';
  s.g.drawImage(mask, 0, 0);
  return s.c;
}

/** Apply each region's animation to the clip's source pixels. Returns a canvas at (capped) source size. */
export function animateRegions(d: Drawable, clip: Clip, t: number, m: RenderModel, src: FrameSource, index: number): Drawable {
  const { w: sw, h: sh } = dims(d);
  const k = Math.min(1, MAX / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const out = scratch(0, w, h);
  out.g.drawImage(d, 0, 0, w, h);
  for (const r of clip.regions ?? []) {
    const mk = src.image(r.maskId);
    if (!mk) continue;
    const mi = maskInfo(mk, w, h);
    const env = envelope(r, t, m);
    const a = r.intensity * env;
    if (a <= 0.01) continue;
    const g = out.g;
    const ph = t * r.speed * 2 + index;
    g.save();
    switch (r.effect) {
      case 'glow': {
        const layer = masked(1, d, mi.canvas, w, h, `blur(${Math.round(w / 120)}px) brightness(1.6)`);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = a * (r.trigger === 'loop' ? 0.45 + 0.4 * Math.sin(ph * 2) : 0.9);
        g.drawImage(layer, 0, 0);
        break;
      }
      case 'flicker': {
        const f = hash(Math.floor(t * (8 + r.speed * 10)) + index);
        const layer = masked(1, d, mi.canvas, w, h, `brightness(${0.6 + f * 0.9})`);
        g.globalAlpha = a;
        g.drawImage(layer, 0, 0);
        break;
      }
      case 'hue': {
        const layer = masked(1, d, mi.canvas, w, h, `hue-rotate(${(t * r.speed * 120) % 360}deg) saturate(1.3)`);
        g.globalAlpha = a;
        g.drawImage(layer, 0, 0);
        break;
      }
      case 'blink': {
        const layer = masked(1, d, mi.canvas, w, h, 'brightness(0.15)');
        g.globalAlpha = a * (0.5 + 0.5 * Math.sin(ph * 3)) ** 4;
        g.drawImage(layer, 0, 0);
        break;
      }
      case 'shimmer': {
        const s = scratch(1, w, h);
        const [bx, , bw] = mi.bbox;
        const pos = bx + ((ph * 0.35) % 1.4 - 0.2) * bw;
        const grad = s.g.createLinearGradient(pos - bw * 0.15, 0, pos + bw * 0.15, h * 0.2);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, r.color);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        s.g.fillStyle = grad;
        s.g.fillRect(0, 0, w, h);
        s.g.globalCompositeOperation = 'destination-in';
        s.g.drawImage(mi.canvas, 0, 0);
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = a;
        g.drawImage(s.c, 0, 0);
        break;
      }
      case 'pop': {
        const layer = masked(1, d, mi.canvas, w, h);
        const sc = 1 + 0.09 * a * (r.trigger === 'loop' ? 0.5 + 0.5 * Math.sin(ph * 2) : 1);
        g.translate(mi.cx, mi.cy);
        g.scale(sc, sc);
        g.translate(-mi.cx, -mi.cy);
        g.shadowColor = 'rgba(0,0,0,0.5)';
        g.shadowBlur = w / 80;
        g.drawImage(layer, 0, 0);
        break;
      }
      case 'sway':
      case 'ripple': {
        // Fill the hole with a blurred copy, then redraw the selection in displaced strips.
        g.drawImage(masked(1, d, mi.canvas, w, h, `blur(${Math.round(w / 90)}px)`), 0, 0);
        const layer = masked(2, d, mi.canvas, w, h);
        const [bx, by, bw, bh] = mi.bbox;
        const strips = 28;
        const amp = (r.effect === 'sway' ? bw * 0.035 : bh * 0.012) * a;
        for (let i = 0; i < strips; i++) {
          if (r.effect === 'sway') {
            const y = by + (i * bh) / strips, sh2 = bh / strips + 1;
            const lever = 1 - i / strips; // tips (top) move most, base stays put
            g.drawImage(layer, bx, y, bw, sh2, bx + Math.sin(ph * 1.5 + i * 0.12) * amp * lever * 2, y, bw, sh2);
          } else {
            const x = bx + (i * bw) / strips, sw2 = bw / strips + 1;
            g.drawImage(layer, x, by, sw2, bh, x, by + Math.sin(ph * 3 + i * 0.6) * amp, sw2, bh);
          }
        }
        break;
      }
      case 'sparkle': {
        g.globalCompositeOperation = 'lighter';
        const n = mi.points.length;
        for (let i = 0; i < n; i++) {
          const tw = Math.sin(ph * 3 + hash(i) * 40);
          if (tw < 0.6) continue;
          const [x, y] = mi.points[i];
          const rad = (w / 220) * (0.5 + hash(i + 3)) * ((tw - 0.6) / 0.4);
          g.globalAlpha = a;
          const grad = g.createRadialGradient(x, y, 0, x, y, rad * 3);
          grad.addColorStop(0, r.color);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.fillRect(x - rad * 3, y - rad * 3, rad * 6, rad * 6);
        }
        break;
      }
    }
    g.restore();
  }
  return out.c;
}
