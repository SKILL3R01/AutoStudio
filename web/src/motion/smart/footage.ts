/**
 * Smart layers · footage analysis (on this PC): the project's own picture (main video + picture-in-picture, without
 * text / motion / captions) is rendered at 2 fps in the output format, then faces, calm areas and mouth activity are
 * measured. Coordinates are 0..1 of the output frame, so framing / 9:16 crops are already taken into account.
 */
import type { Project } from '../../types';
import { activeClipIndices, imagesNeededAt, makeModel, outputSize, renderFrame, type FrameSource } from '../../render/renderer';
import { VideoFrames, sourceTime } from '../../export/exporter';
import { media } from '../../render/media';
import { activePips, pipAsClip } from '../../lib/pip';

export const GX = 16, GY = 9;
/** One face at one moment: box (0..1) + mouth activity (0..1). */
export type Face = [x: number, y: number, w: number, h: number, act: number];
export interface FootageAnalysis {
  fps: number;
  aspect: string;
  /** Faces per sample (t = i / fps). */
  faces: Face[][];
  /** Busyness grid (GX × GY, 0 = calm … 1 = busy) averaged per window of `win` seconds. */
  win: number;
  busy: number[][];
  /** Gameplay: fixed on-screen HUD areas (edges that never change while the picture moves), 0..1 rects. */
  hud?: { x: number; y: number; w: number; h: number }[];
  /** Gameplay / streams: a face that stays in one corner = the facecam box (0..1). */
  cam?: { x: number; y: number; w: number; h: number };
  /** How much the picture moves overall (median change, 0..1): high for gameplay. */
  motion?: number;
  createdAt: number;
  /** Changes when the main video / overlays change, so stale analyses are noticed. */
  key: string;
}

export const footageKey = (p: Project) => `${p.export.aspect}|${p.clips.map((c) => `${c.assetId}:${c.start.toFixed(2)}`).join(',')}|${(p.pips ?? []).map((c) => `${c.assetId}:${c.start.toFixed(2)}`).join(',')}|${p.length.toFixed(1)}`;

/** Edge energy per grid cell of a grey image, plus the change from the previous frame. */
export function busyGrid(gray: Float32Array, prev: Float32Array | null, w: number, h: number): number[] {
  const out = new Array(GX * GY).fill(0), n = new Array(GX * GY).fill(0);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const edge = Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]);
      const diff = prev ? Math.abs(gray[i] - prev[i]) : 0;
      const c = Math.min(GY - 1, Math.floor((y / h) * GY)) * GX + Math.min(GX - 1, Math.floor((x / w) * GX));
      out[c] += edge * 2.2 + diff * 3;
      n[c]++;
    }
  return out.map((v, i) => Math.min(1, v / Math.max(1, n[i]) / 0.35));
}

export const HX = 32, HY = 18;
/** Edge energy and change per cell of a fine grid (for HUD detection). */
export function edgeDiffGrid(gray: Float32Array, prev: Float32Array | null, w: number, h: number) {
  const edge = new Array(HX * HY).fill(0), diff = new Array(HX * HY).fill(0), n = new Array(HX * HY).fill(0);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, c = Math.min(HY - 1, Math.floor((y / h) * HY)) * HX + Math.min(HX - 1, Math.floor((x / w) * HX));
      edge[c] += Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]);
      diff[c] += prev ? Math.abs(gray[i] - prev[i]) : 0;
      n[c]++;
    }
  return { edge: edge.map((v, i) => v / Math.max(1, n[i])), diff: diff.map((v, i) => v / Math.max(1, n[i])) };
}

/** Largest rectangles of true cells in a mask (histogram method), as 0..1 rects; cells used are cleared. */
export function maxRects(mask: boolean[][], max: number, minCells: number) {
  const gy = mask.length, gx = mask[0]?.length ?? 0, out: { x: number; y: number; w: number; h: number }[] = [];
  for (let k = 0; k < max; k++) {
    let best = { a: 0, x: 0, y: 0, w: 0, h: 0 };
    const hist = new Array(gx).fill(0);
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) hist[x] = mask[y][x] ? hist[x] + 1 : 0;
      for (let x = 0; x < gx; x++) {
        let hgt = Infinity;
        for (let x2 = x; x2 < gx && hist[x2] > 0; x2++) {
          hgt = Math.min(hgt, hist[x2]);
          const a = hgt * (x2 - x + 1);
          if (a > best.a) best = { a, x, y: y - hgt + 1, w: x2 - x + 1, h: hgt };
        }
      }
    }
    if (best.a < minCells) break;
    out.push({ x: best.x / gx, y: best.y / gy, w: best.w / gx, h: best.h / gy });
    for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) mask[y][x] = false;
  }
  return out;
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
/** HUD = cells with clear edges that hardly change while the picture as a whole moves (averages over the video). */
export function detectHud(edge: number[], diff: number[]): { hud: { x: number; y: number; w: number; h: number }[]; motion: number } {
  const md = median(diff), me = median(edge);
  if (md < 0.012) return { hud: [], motion: md };
  const mask = Array.from({ length: HY }, (_, y) => Array.from({ length: HX }, (_, x) => edge[y * HX + x] > me * 0.8 && edge[y * HX + x] > 0.02 && diff[y * HX + x] < md * 0.22));
  return { hud: maxRects(mask, 6, 2).filter((r) => r.w * r.h < 0.12), motion: md };
}

/** Facecam = a small face that stays put near a corner in most samples; the box around it (face × ~2.4). */
export function detectCam(faces: Face[][]): { x: number; y: number; w: number; h: number } | undefined {
  const buckets = new Map<string, Face[]>();
  for (const fs of faces) for (const f of fs) {
    if (f[2] > 0.3) continue;
    const key = `${Math.round((f[0] + f[2] / 2) * 10)}:${Math.round((f[1] + f[3] / 2) * 10)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), f]);
  }
  const best = [...buckets.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < faces.length * 0.4) return undefined;
  const avg = (i: number) => best.reduce((s, f) => s + f[i], 0) / best.length;
  const fx = avg(0), fy = avg(1), fw = avg(2), fh = avg(3), cx = fx + fw / 2, cy = fy + fh / 2;
  if (Math.abs(cx - 0.5) < 0.18 || Math.abs(cy - 0.5) < 0.12) return undefined;
  const w = Math.min(0.45, fw * 2.6), h = Math.min(0.5, fh * 2.3);
  const x = Math.max(0, Math.min(1 - w, cx - w / 2)), y = Math.max(0, Math.min(1 - h, cy - h * 0.45));
  return { x, y, w, h };
}

function grayOf(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  return g;
}
/** Mean change inside the lower half of a face box (mouth) between two frames. */
function mouthAct(g: Float32Array, prev: Float32Array | null, w: number, h: number, f: [number, number, number, number]) {
  if (!prev) return 0;
  const x0 = Math.floor((f[0] + f[2] * 0.2) * w), x1 = Math.ceil((f[0] + f[2] * 0.8) * w), y0 = Math.floor((f[1] + f[3] * 0.55) * h), y1 = Math.ceil((f[1] + f[3] * 0.95) * h);
  let s = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) (s += Math.abs(g[y * w + x] - prev[y * w + x])), n++;
  return n ? Math.min(1, (s / n) * 12) : 0;
}

export async function analyzeFootage(p: Project, onProgress: (k: number, msg: string) => void, signal?: AbortSignal): Promise<FootageAnalysis> {
  // Only the picture: no texts, motion, captions, typography or effects.
  const q: Project = { ...structuredClone(p), motion: [], overlays: [], typo: [], effects: [], captions: { ...p.captions, enabled: false, typography: false } };
  const m = makeModel(q, [], []);
  const full = outputSize(q);
  const W = 384, H = Math.round((W * full.H) / full.W);
  const fps = 2, win = 5, total = Math.max(1, Math.ceil(m.length * fps));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const plan = new Map<string, number[]>();
  for (let f = 0; f < total; f++) {
    const t = f / fps;
    for (const i of activeClipIndices(m, t)) {
      const a = m.assets.get(q.clips[i].assetId);
      if (a?.kind === 'video') plan.set(q.clips[i].id, [...(plan.get(q.clips[i].id) ?? []), sourceTime(q, i, t, a)]);
    }
    for (const pc of activePips(q, t)) if (m.assets.get(pc.assetId)?.kind === 'video') plan.set(pc.id, [...(plan.get(pc.id) ?? []), pc.trimIn + (t - pc.start)]);
  }
  const frames = new VideoFrames(W, plan);
  const src: FrameSource = { clip: (clip, asset) => (asset.kind === 'video' ? frames.get(clip) : media.image(asset.id)), image: (id) => media.image(id) };
  const faces: Face[][] = [], busy: number[][] = [];
  let acc = new Array(GX * GY).fill(0), accN = 0, prev: Float32Array | null = null;
  const edgeSum = new Array(HX * HY).fill(0), diffSum = new Array(HX * HY).fill(0);
  let edN = 0;
  onProgress(0, 'Loading the face finder…');
  const { detectFaces } = await import('../../ai/faces');
  for (let f = 0; f < total; f++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const t = f / fps;
    for (const i of activeClipIndices(m, t)) {
      const a = m.assets.get(q.clips[i].assetId);
      if (a?.kind === 'video') await frames.next(q.clips[i]);
      else if (a) await media.ensureImage(a.id);
    }
    for (const pc of activePips(q, t)) if (m.assets.get(pc.assetId)?.kind === 'video') await frames.next(pipAsClip(pc));
    await Promise.all(imagesNeededAt(m, t).map((id) => media.ensureImage(id)));
    renderFrame(ctx, m, t, src, W, H);
    const g = grayOf(ctx, W, H);
    const boxes = await detectFaces(c).catch(() => []);
    faces.push(boxes.slice(0, 4).map((b) => [b[0], b[1], b[2], b[3], mouthAct(g, prev, W, H, [b[0], b[1], b[2], b[3]])] as Face));
    if (prev) {
      const ed = edgeDiffGrid(g, prev, W, H);
      ed.edge.forEach((v, i) => (edgeSum[i] += v));
      ed.diff.forEach((v, i) => (diffSum[i] += v));
      edN++;
    }
    const grid = busyGrid(g, prev, W, H);
    acc = acc.map((v, i) => v + grid[i]);
    accN++;
    if (accN >= win * fps || f === total - 1) (busy.push(acc.map((v) => Math.round((v / accN) * 100) / 100)), (acc = new Array(GX * GY).fill(0)), (accN = 0));
    prev = g;
    if (f % 4 === 0) onProgress(f / total, `Looking at the video… ${Math.round((f / total) * 100)}%`);
    if (f % 8 === 0) await new Promise((r) => setTimeout(r));
  }
  // Round to keep the project small.
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const { hud, motion } = edN ? detectHud(edgeSum.map((v) => v / edN), diffSum.map((v) => v / edN)) : { hud: [], motion: 0 };
  const rr = (r: { x: number; y: number; w: number; h: number }) => ({ x: r3(r.x), y: r3(r.y), w: r3(r.w), h: r3(r.h) });
  const cam = detectCam(faces);
  return { fps, aspect: p.export.aspect, faces: faces.map((fs) => fs.map((x) => x.map(r3) as Face)), win, busy, hud: hud.map(rr), cam: cam && rr(cam), motion: r3(motion), createdAt: Date.now(), key: footageKey(p) };
}
