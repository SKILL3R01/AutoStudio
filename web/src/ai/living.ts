/**
 * Living illustration · analysis on this PC: SlimSAM finds the pieces (grid of single-point prompts, duplicates merged),
 * CLIP labels each piece from a word list, the depth map orders them, and shape rules give pivots / parents / motions.
 */
import { clipEmbedImages, clipEmbedText, estimateDepth, prepareSegment, segmentGrid, useVision } from './vision';
import { KINDS, MOTION_OF, WEATHER, WORDS, kindFromScores, maskStats, parentOf, pivotFor, refineChild, type LivingPart, type PartKind } from '../living/model';

export interface AnalysedPart extends Omit<LivingPart, 'maskId'> { mask: Blob }
export interface LivingAnalysis { parts: AnalysedPart[]; weather?: 'rain' | 'snow' | 'dust'; size: { w: number; h: number } }

type M = { w: number; h: number; data: Uint8Array; score: number };
const area = (m: M) => { let n = 0; for (let i = 0; i < m.data.length; i++) n += m.data[i]; return n / m.data.length; };
const iou = (a: M, b: M) => { let i = 0, u = 0; for (let k = 0; k < a.data.length; k++) { const x = a.data[k], y = b.data[k]; i += x & y; u += x | y; } return u ? i / u : 0; };
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

let textVecs: Promise<Float32Array[]> | undefined;
const texts = () => (textVecs ??= clipEmbedText([...WORDS.map((w) => w[0]), ...WEATHER.map((w) => w[0]), 'a clear calm picture']));

async function bitmapOf(b: Blob) { return createImageBitmap(b); }
/** The piece alone (rest black) cropped to its box, for CLIP. */
function crop(img: ImageBitmap, m: M, box: [number, number, number, number]) {
  const [bx, by, bw, bh] = box, S = 224, c = new OffscreenCanvas(S, S), g = c.getContext('2d')!;
  const mk = new OffscreenCanvas(m.w, m.h), mg = mk.getContext('2d')!, id = mg.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) id.data[i * 4 + 3] = m.data[i] ? 255 : 0;
  mg.putImageData(id, 0, 0);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const k = S / Math.max(bw * img.width, bh * img.height), dw = bw * img.width * k, dh = bh * img.height * k, ox = (S - dw) / 2, oy = (S - dh) / 2;
  const tmp = new OffscreenCanvas(S, S), tg = tmp.getContext('2d')!;
  tg.drawImage(img, bx * img.width, by * img.height, bw * img.width, bh * img.height, ox, oy, dw, dh);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(mk, bx * m.w, by * m.h, bw * m.w, bh * m.h, ox, oy, dw, dh);
  g.drawImage(tmp, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
/** Mask as a PNG (white, alpha = piece) for the renderer. */
async function maskPng(m: M) {
  const c = new OffscreenCanvas(m.w, m.h), g = c.getContext('2d')!, id = g.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) (id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255), (id.data[i * 4 + 3] = m.data[i] ? 255 : 0);
  g.putImageData(id, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
async function depthOf(still: Blob, w: number, h: number) {
  try {
    const bmp = await createImageBitmap(await estimateDepth(still));
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
    return out;
  } catch {
    return undefined;
  }
}

/** Analyse one image (a still of the clip). `key` caches the SAM embedding. */
export async function analyseLiving(key: string, still: Blob, opts: { grid?: [number, number]; max?: number } = {}): Promise<LivingAnalysis> {
  const [gx, gy] = opts.grid ?? [8, 6];
  useVision.setState({ label: 'Looking at the picture…', value: 0.05 });
  await prepareSegment(key, still);
  const pts: [number, number][] = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) pts.push([(i + 0.5) / gx, (j + 0.5) / gy]);
  useVision.setState({ label: 'Finding the pieces…', value: 0.2 });
  const { masks } = await segmentGrid(key, pts, 480);
  // keep confident, not tiny, not the whole picture; merge duplicates (keep the more confident one)
  const cand = masks.map((m) => ({ m, a: area(m) })).filter((x) => x.m.score >= 0.7 && x.a >= 0.003 && x.a <= 0.9).sort((a, b) => b.m.score - a.m.score);
  const kept: { m: M; a: number }[] = [];
  for (const c of cand) if (!kept.some((k) => iou(k.m, c.m) > 0.8)) kept.push(c);
  const pieces = kept.sort((a, b) => b.a * b.m.score - a.a * a.m.score).slice(0, opts.max ?? 24);
  if (!pieces.length) return { parts: [], size: { w: 0, h: 0 } };
  const img = await bitmapOf(still), { w, h } = pieces[0].m;
  const stats = pieces.map((p) => maskStats(p.m.data, p.m.w, p.m.h));
  useVision.setState({ label: 'Recognising each piece…', value: 0.5 });
  const [tv, iv, whole] = await Promise.all([texts(), clipEmbedImages(await Promise.all(pieces.map((p, i) => crop(img, p.m, stats[i].bbox)))), clipEmbedImages([still])]);
  const nW = WORDS.length, labels = iv.map((v) => kindFromScores(tv.slice(0, nW).map((t) => dot(v, t))));
  // weather: the whole picture vs the weather phrases and a neutral phrase
  const ws = WEATHER.map((_, i) => dot(whole[0], tv[nW + i])), neutral = dot(whole[0], tv[tv.length - 1]);
  const wi = ws.indexOf(Math.max(...ws));
  const weather = ws[wi] > neutral + 0.015 ? WEATHER[wi][1] : undefined;
  useVision.setState({ label: 'Measuring depth…', value: 0.75 });
  const depth = await depthOf(still, w, h);
  const kinds: PartKind[] = labels.map((l, i) => (l.kind === 'oar' && stats[i].elong < 3 ? 'rigid' : l.kind));
  const parents = pieces.map((_, i) => parentOf(i, stats.map((s) => s.bbox), kinds));
  // mean brightness of each piece (sails are light, the storm sky behind them is dark)
  const lc = new OffscreenCanvas(w, h), lg = lc.getContext('2d', { willReadFrequently: true })!;
  lg.drawImage(img, 0, 0, w, h);
  const lpx = lg.getImageData(0, 0, w, h).data;
  const lums = pieces.map((p) => { let sum = 0, n = 0; for (let k = 0; k < p.m.data.length; k += 2) if (p.m.data[k]) (sum += (lpx[k * 4] * 0.299 + lpx[k * 4 + 1] * 0.587 + lpx[k * 4 + 2] * 0.114) / 255), n++; return n ? sum / n : 0.5; });
  // Shape rules when CLIP is unsure: a big low piece holding others = the main vessel; wide pieces on the bottom edge = waves;
  // large pieces near the top = clouds.
  kinds.forEach((k, i) => {
    if (parents[i] !== undefined || (k !== 'rigid' && k !== 'animal' && k !== 'boat')) return;
    const [, by, bw, bh] = stats[i].bbox, kids = parents.filter((p) => p === i).length, a = pieces[i].a;
    if (kids >= 2 && a > 0.08 && a < 0.45 && by + bh > 0.6) kinds[i] = 'boat';
    else if (a >= 0.45 && k === 'rigid') kinds[i] = lums[i] < 0.5 ? 'water' : 'sky';
    else if (k === 'rigid' && by + bh > 0.95 && bw > 0.35) kinds[i] = 'wave';
    else if (k === 'rigid' && stats[i].cy < 0.35 && a > 0.05 && !kids) kinds[i] = 'cloud';
  });
  const motions = kinds.map((k) => MOTION_OF[k]);
  parents.forEach((pi, i) => {
    if (pi === undefined) return;
    const r = refineChild(kinds[i], stats[i], kinds[pi], pivotFor(kinds[pi], stats[pi])[1], lums[i]);
    kinds[i] = r.kind;
    motions[i] = r.motion ?? MOTION_OF[r.kind];
  });
  const ids = pieces.map((_, i) => `lp${i}_${Date.now().toString(36)}`);
  const parts: AnalysedPart[] = await Promise.all(pieces.map(async (p, i) => {
    let ds = 0, n = 0;
    if (depth) for (let k = 0; k < p.m.data.length; k += 3) if (p.m.data[k]) (ds += depth[k]), n++;
    const pi = parents[i], kind = kinds[i];
    return {
      id: ids[i], label: labels[i].label, kind, mask: await maskPng(p.m), bbox: stats[i].bbox, pivot: pivotFor(kind, stats[i], pi !== undefined ? stats[pi].bbox : undefined),
      axis: stats[i].axis, elong: stats[i].elong, depth: n ? ds / n : 0.5, parentId: pi !== undefined ? ids[pi] : undefined,
      motion: motions[i], on: motions[i] !== 'still' || pi !== undefined, strength: 1, speed: 1,
    };
  }));
  useVision.setState({ label: '', value: 1 });
  return { parts, weather, size: { w, h } };
}
export { KINDS };
