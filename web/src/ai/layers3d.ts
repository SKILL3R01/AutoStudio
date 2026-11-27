import type { Asset, Clip } from '../types';
import { media } from '../render/media';
import { probe } from '../lib/project';
import { clipStill } from './jobs';
import { inpaint512 } from './vision';
import { boxBlur, grayOf, maxFilter } from '../render/depthrefine';

/** Otsu threshold of a gray histogram: the split between near (subject) and far. */
export function otsu(gray: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB || wB === total) continue;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) (best = between), (thr = t);
  }
  return thr;
}

/** Fill unknown pixels from their surroundings (pyramid push-pull). `known[i]` = 1 for kept pixels. */
export function pushPullFill(rgba: Uint8ClampedArray, known: Uint8Array, w: number, h: number) {
  if (w <= 2 || h <= 2) return;
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2);
  const d2 = new Uint8ClampedArray(w2 * h2 * 4), k2 = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let n = 0;
    const acc = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = Math.min(w - 1, x * 2 + dx), yy = Math.min(h - 1, y * 2 + dy), i = yy * w + xx;
      if (!known[i]) continue;
      n++;
      for (let c = 0; c < 3; c++) acc[c] += rgba[i * 4 + c];
    }
    const j = y * w2 + x;
    if (n) (k2[j] = 1), acc.forEach((v, c) => (d2[j * 4 + c] = v / n)), (d2[j * 4 + 3] = 255);
  }
  if (k2.some((v) => !v)) pushPullFill(d2, k2, w2, h2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (known[i]) continue;
    const j = (y >> 1) * w2 + (x >> 1);
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = d2[j * 4 + c];
    rgba[i * 4 + 3] = 255;
  }
}

/** Shrink near areas back (min filter = max filter on the inverse). */
const minFilter = (g: Uint8ClampedArray, w: number, h: number, r: number) => maxFilter(g.map((v) => 255 - v), w, h, r).map((v) => 255 - v);

/**
 * Layers mode: the subject (near part of the depth map) becomes a cut-out with a soft edge, and the background
 * behind it is filled in (LaMa when available, else from the surrounding colours). Returns two hidden assets.
 */
export async function makeLayers(clip: Clip, asset: Asset, depthId: string, onStep: (msg: string) => void): Promise<{ bg: Asset; fg: Asset; filled: boolean }> {
  onStep('Cutting out the subject…');
  const [still, depthBlob] = await Promise.all([clipStill(clip, asset), media.blob(depthId)]);
  if (!still || !depthBlob) throw new Error('Make the depth map first');
  const [sb, db] = await Promise.all([createImageBitmap(still), createImageBitmap(depthBlob)]);
  const s = Math.min(1, 1600 / Math.max(sb.width, sb.height));
  const w = Math.round(sb.width * s), h = Math.round(sb.height * s);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(db, 0, 0, w, h);
  const depth = grayOf(g.getImageData(0, 0, w, h).data);
  g.clearRect(0, 0, w, h);
  g.drawImage(sb, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  sb.close();
  db.close();
  const thr = otsu(depth), r = Math.max(1, Math.round(Math.max(w, h) * 0.012));
  let mask = depth.map((v) => (v > thr ? 255 : 0));
  mask = minFilter(mask, w, h, r);
  const soft = boxBlur(mask, w, h, Math.max(1, Math.round(r / 2)));
  // Foreground: the picture with the soft mask as alpha.
  const fg = new ImageData(new Uint8ClampedArray(px.data), w, h);
  for (let i = 0; i < soft.length; i++) fg.data[i * 4 + 3] = soft[i];
  // Hole to fill: the subject plus a margin (covers the halo when the layers move apart).
  const hole = maxFilter(mask, w, h, r * 3);
  const bg = new ImageData(new Uint8ClampedArray(px.data), w, h);
  let filled = false;
  try {
    onStep('Filling in the background (first time: downloading the fill-in model)…');
    filled = await lamaFill(bg, hole, w, h);
  } catch {
    filled = false;
  }
  if (!filled) pushPullFill(bg.data, Uint8Array.from(hole, (v) => (v ? 0 : 1)), w, h);
  const png = async (img: ImageData) => {
    const cc = new OffscreenCanvas(w, h);
    cc.getContext('2d')!.putImageData(img, 0, 0);
    return cc.convertToBlob({ type: 'image/png' });
  };
  onStep('Saving layers…');
  const [bgA, fgA] = await Promise.all([probe(await png(bg), `__bg_${asset.name}`, 'image'), probe(await png(fg), `__fg_${asset.name}`, 'image')]);
  return { bg: bgA, fg: fgA, filled };
}

/** LaMa on the hole's bounding box (scaled to 512²), pasted back only inside the hole. */
async function lamaFill(img: ImageData, hole: Uint8ClampedArray, w: number, h: number): Promise<boolean> {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hole[y * w + x]) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  if (x1 <= x0 || y1 <= y0) return true;
  const side = Math.min(Math.max(w, h), Math.round(Math.max(x1 - x0, y1 - y0) * 1.4));
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  const bx = Math.max(0, Math.min(w - Math.min(side, w), cx - side / 2)), by = Math.max(0, Math.min(h - Math.min(side, h), cy - side / 2));
  const bw = Math.min(side, w), bh = Math.min(side, h);
  const src = new OffscreenCanvas(w, h);
  src.getContext('2d')!.putImageData(img, 0, 0);
  const crop = new OffscreenCanvas(512, 512), cg = crop.getContext('2d', { willReadFrequently: true })!;
  cg.drawImage(src, bx, by, bw, bh, 0, 0, 512, 512);
  const imgBlob = await crop.convertToBlob({ type: 'image/png' });
  const mc = new OffscreenCanvas(w, h), mg = mc.getContext('2d')!;
  const md = mg.createImageData(w, h);
  for (let i = 0; i < hole.length; i++) (md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = hole[i]), (md.data[i * 4 + 3] = 255);
  mg.putImageData(md, 0, 0);
  cg.drawImage(mc, bx, by, bw, bh, 0, 0, 512, 512);
  const maskBlob = await crop.convertToBlob({ type: 'image/png' });
  const out = await createImageBitmap(await inpaint512(imgBlob, maskBlob));
  const back = new OffscreenCanvas(w, h), bgc = back.getContext('2d', { willReadFrequently: true })!;
  bgc.drawImage(out, 0, 0, 512, 512, bx, by, bw, bh);
  out.close();
  const f = bgc.getImageData(0, 0, w, h).data;
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    const i = y * w + x;
    if (hole[i]) for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = f[i * 4 + ch];
  }
  return true;
}
