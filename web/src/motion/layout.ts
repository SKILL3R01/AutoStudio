/**
 * Layout correction (engine, not AI): texts fit their width, everything stays in the safe area, content layers that
 * show at the same time do not overlap (the less important one moves, then shrinks). Returns what it changed.
 */
import type { MotionItem } from './types';
import { widgetBox } from './widgets';

const SKIP = new Set(['background', 'light', 'camera', 'marker']);
const DECOR = new Set(['rays', 'sparkles', 'arrow', 'circle-draw', 'tape', 'cursor', 'click-pulse', 'light-streaks', 'speed-lines', 'confetti', 'burst', 'wipe', 'slices', 'band-wipe', 'spotlight', 'hud-rings', 'plus-badge', 'starburst', 'set']);
/** Story staging that must not move (a character, its props and its speech bubbles are composed together). */
const PINNED = new Set(['character', 'prop', 'bubble']);
const TEXTY = new Set(['headline', 'kinetic', 'say', 'slam', 'quote']);

let mctx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, size: number, font: string, weight: unknown): number {
  if (mctx === undefined) mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!mctx) return text.length * size * 0.56;
  mctx.font = `${weight ?? 800} ${size}px "${font}"`;
  return mctx.measureText(text).width;
}

export interface Box { it: MotionItem; x: number; y: number; w: number; h: number; pri: number }

/** Approximate on-screen box of a content layer at rest (recipe px around the frame centre). */
export function boxOf(it: MotionItem): Box | null {
  if (SKIP.has(it.type) || (it.type === 'widget' && DECOR.has(String(it.widget)))) return null;
  const sc = typeof it.scale === 'number' ? it.scale : 1;
  let w = 0, h = 0, pri = 1;
  if (it.type === 'text') {
    const size = typeof it.size === 'number' ? it.size : 80;
    const tw = textWidth(String(it.text ?? ''), size, String(it.font ?? 'Montserrat'), it.weight);
    const maxW = typeof it.width === 'number' ? it.width : 1600;
    const lines = Math.max(1, Math.ceil(tw / maxW));
    w = Math.min(tw, maxW);
    h = lines * size * (typeof it.lineHeight === 'number' ? it.lineHeight : 1.15);
    pri = 3;
  } else if (it.type === 'widget') {
    ({ w, h } = widgetBox(it));
    pri = TEXTY.has(String(it.widget)) ? 3 : String(it.widget) === 'tag' || String(it.widget) === 'typewriter-tag' ? 1 : 2;
  } else if (it.type === 'icon') (w = h = (typeof it.size === 'number' ? it.size : 120) * 1.4), (pri = 1);
  else (w = it.w ?? 200), (h = it.h ?? w), (pri = it.type === 'shape' ? 0 : 2);
  return { it, x: it.x ?? 0, y: it.y ?? 0, w: w * sc, h: h * sc, pri };
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)) * Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
const together = (a: MotionItem, b: MotionItem) => a.start < b.start + b.dur - 0.1 && b.start < a.start + a.dur - 0.1;

export function fixLayout(items: MotionItem[], frame: { w: number; h: number }, avoid: { x: number; y: number; w: number; h: number }[] = []): { items: MotionItem[]; fixes: string[] } {
  const fixes: string[] = [];
  const safe = { w: frame.w * 0.92, h: frame.h * 0.88 };
  const out = items.map((x) => ({ ...x }));
  // 1. Texts fit: wrap long single lines, then shrink tall blocks.
  for (const it of out) {
    if (it.type !== 'text') continue;
    const size = typeof it.size === 'number' ? it.size : 80;
    const tw = textWidth(String(it.text ?? ''), size, String(it.font ?? 'Montserrat'), it.weight);
    if (typeof it.width !== 'number' || it.width > safe.w) if (tw > safe.w) (it.width = safe.w), fixes.push('wrapped a long line');
    const b = boxOf(it)!;
    if (b.h > safe.h * 0.6) (it.size = Math.max(28, size * ((safe.h * 0.6) / b.h))), fixes.push('shrank a tall text');
  }
  // 2. Inside the safe area (shrink anything wider / taller than it, then move it in).
  const clamp = (it: MotionItem) => {
    const b = boxOf(it);
    if (!b) return;
    const k = Math.min(1, safe.w / b.w, safe.h / b.h);
    if (k < 0.98) (it.scale = (typeof it.scale === 'number' ? it.scale : 1) * k), fixes.push(`scaled ${it.widget ?? it.type} to fit`);
    const bb = boxOf(it)!;
    const mx = Math.max(0, safe.w / 2 - bb.w / 2), my = Math.max(0, safe.h / 2 - bb.h / 2);
    const nx = Math.max(-mx, Math.min(mx, bb.x)), ny = Math.max(-my, Math.min(my, bb.y));
    if (Math.abs(nx - bb.x) > 2 || Math.abs(ny - bb.y) > 2) (it.x = Math.round(nx)), (it.y = Math.round(ny)), fixes.push(`moved ${it.widget ?? it.type} inside the frame`);
  };
  out.forEach(clamp);
  // 3. No overlaps between content shown together (and none over the zones to avoid, e.g. faces).
  const portrait = frame.h > frame.w * 1.1;
  for (let pass = 0; pass < 3; pass++) {
    const boxes = out.map(boxOf).filter((b): b is Box => !!b && b.pri > 0);
    let moved = false;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (!together(a.it, b.it)) continue;
        const ov = overlap(a, b);
        if (ov < Math.min(a.w * a.h, b.w * b.h) * 0.08) continue;
        const pa = a.it.type === 'widget' && PINNED.has(String(a.it.widget)), pb = b.it.type === 'widget' && PINNED.has(String(b.it.widget));
        if (pa && pb) continue;
        const lo = pa ? b : pb ? a : a.pri >= b.pri ? b : a, hi = lo === a ? b : a;
        // Move the less important one away along the axis that needs the smallest move.
        const dxNeed = (hi.w + lo.w) / 2 + 24 - Math.abs(lo.x - hi.x), dyNeed = (hi.h + lo.h) / 2 + 24 - Math.abs(lo.y - hi.y);
        const vertical = portrait ? dyNeed < dxNeed * 1.6 : dyNeed < dxNeed * 0.6;
        if (vertical) lo.it.y = Math.round((lo.it.y ?? 0) + (lo.y >= hi.y ? 1 : -1) * dyNeed);
        else lo.it.x = Math.round((lo.it.x ?? 0) + (lo.x >= hi.x ? 1 : -1) * dxNeed);
        clamp(lo.it);
        const after = boxOf(lo.it)!;
        if (overlap(after, hi) > Math.min(after.w * after.h, hi.w * hi.h) * 0.08) lo.it.scale = (typeof lo.it.scale === 'number' ? lo.it.scale : 1) * 0.85;
        fixes.push(`moved ${lo.it.widget ?? lo.it.type} away from ${hi.it.widget ?? hi.it.type}`);
        moved = true;
      }
    for (const z of avoid)
      for (const b of boxes) {
        const zb: Box = { it: b.it, ...z, pri: 9 };
        if (overlap(b, zb) < b.w * b.h * 0.05) continue;
        const dx = (z.w + b.w) / 2 + 30 - Math.abs(b.x - z.x);
        b.it.x = Math.round((b.it.x ?? 0) + (b.x >= z.x ? 1 : -1) * dx);
        clamp(b.it);
        fixes.push(`moved ${b.it.widget ?? b.it.type} off a face`);
        moved = true;
      }
    if (!moved) break;
  }
  return { items: out, fixes: [...new Set(fixes)] };
}
