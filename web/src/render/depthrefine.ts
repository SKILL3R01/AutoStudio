/**
 * Clean depth maps for the 3D move without touching the picture:
 * 1. median 3×3 removes speckles and small holes;
 * 2. joint bilateral filter guided by the picture's brightness pulls depth edges onto the real outlines;
 * 3. the foreground is grown a little (max filter) so a subject moves as one piece — the stretch happens in the
 *    background just outside the outline instead of tearing the subject's edge;
 * 4. a light blur softens the step.
 * Works on gray Uint8 arrays (one value per pixel); `guide` = picture luminance at the same size.
 */
export function refineDepth(depth: Uint8ClampedArray, guide: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  let d = median3(depth, w, h);
  d = jointBilateral(d, guide, w, h, Math.max(2, Math.round(Math.max(w, h) / 160)), 18);
  d = maxFilter(d, w, h, Math.max(1, Math.round(Math.max(w, h) * 0.012)));
  return boxBlur(d, w, h, Math.max(1, Math.round(Math.max(w, h) / 300)));
}

export function median3(src: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(src.length), win = new Uint8Array(9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) win[n++] = src[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
    win.sort();
    out[y * w + x] = win[4];
  }
  return out;
}

/** Spatial Gaussian × range Gaussian on the guide's brightness (sigma in 0..255 units). */
export function jointBilateral(src: Uint8ClampedArray, guide: Uint8ClampedArray, w: number, h: number, r: number, sigmaR: number) {
  const out = new Uint8ClampedArray(src.length);
  const sw: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sw.push(Math.exp(-(dx * dx + dy * dy) / (2 * (r / 2) ** 2)));
  const rw = new Float32Array(256).map((_, i) => Math.exp(-(i * i) / (2 * sigmaR * sigmaR)));
  const step = r > 4 ? 2 : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g0 = guide[y * w + x];
    let acc = 0, wsum = 0, k = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++, k++) {
      if ((dx | dy) & (step - 1)) continue;
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      const i = yy * w + xx, wt = sw[k] * rw[Math.abs(guide[i] - g0)];
      acc += src[i] * wt;
      wsum += wt;
    }
    out[y * w + x] = wsum ? acc / wsum : src[y * w + x];
  }
  return out;
}

/** Separable max filter (grows bright = near areas by r pixels). */
export function maxFilter(src: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dx = -r; dx <= r; dx++) m = Math.max(m, src[y * w + Math.min(w - 1, Math.max(0, x + dx))]);
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -r; dy <= r; dy++) m = Math.max(m, tmp[Math.min(h - 1, Math.max(0, y + dy)) * w + x]);
    out[y * w + x] = m;
  }
  return out;
}

export function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length), out = new Uint8ClampedArray(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dx = -r; dx <= r; dx++) s += src[y * w + Math.min(w - 1, Math.max(0, x + dx))];
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = -r; dy <= r; dy++) s += tmp[Math.min(h - 1, Math.max(0, y + dy)) * w + x];
    out[y * w + x] = s / n;
  }
  return out;
}

/**
 * Depth spread of a map: the 98th minus the 2nd percentile (0..1). A camera offset `off` moves near pixels by
 * `off · depth`, so the most near and far can slide apart is about `off · spread` (fraction of the frame).
 */
export function depthSpread(depth: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (const v of depth) hist[v]++;
  const pick = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= depth.length * q) return i;
    return 255;
  };
  return Math.max(0, pick(0.98) - pick(0.02)) / 255;
}

/**
 * Largest near / far slide allowed (fraction of the frame width) per quality. Beyond about 3 % the stretched band
 * next to an outline becomes visible; layers can move freely.
 */
export const SHIFT_LIMIT = { safe: 0.03, strong: 0.06, layers: 1 } as const;
export function safetyFactor(spread: number, maxOffset: number, maxPush: number, quality: keyof typeof SHIFT_LIMIT = 'safe') {
  const shift = spread * (maxOffset + maxPush * 0.5);
  return shift <= 0 ? 1 : Math.min(1, SHIFT_LIMIT[quality] / shift);
}

/** Gray values (R channel) and luminance of RGBA data. */
export const grayOf = (rgba: Uint8ClampedArray) => {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
};
export const lumaOf = (rgba: Uint8ClampedArray) => {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return out;
};
