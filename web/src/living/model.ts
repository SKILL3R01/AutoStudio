/**
 * Living illustration (v5.6): the pieces of an image move the way their kind of thing moves.
 * Pure logic (no browser): kinds and CLIP words, geometry from a mask, motion recipes, seamless loops.
 */

export const KINDS = ['boat', 'sail', 'cloth', 'oar', 'animal', 'person', 'water', 'wave', 'sky', 'cloud', 'tree', 'light', 'rigid'] as const;
export type PartKind = (typeof KINDS)[number];
export const MOTIONS = ['rock', 'billow', 'row', 'glide', 'sway', 'flow', 'drift', 'bob', 'flicker', 'still'] as const;
export type PartMotion = (typeof MOTIONS)[number];
export const MOTION_LABEL: Record<PartMotion, string> = { rock: 'Rock', billow: 'Billow', row: 'Row', glide: 'Glide', sway: 'Sway', flow: 'Flow', drift: 'Drift', bob: 'Bob', flicker: 'Flicker', still: 'Still' };

export interface LivingPart {
  id: string;
  label: string;
  kind: PartKind;
  /** Mask image asset (white / alpha = the piece). */
  maskId: string;
  /** 0..1 of the image. */
  bbox: [number, number, number, number];
  /** Turning point / anchor (0..1). */
  pivot: [number, number];
  /** Main axis angle (radians, image space) and how elongated the piece is (≥ 1). */
  axis: number;
  elong: number;
  /** Mean depth 0 (far) .. 1 (near). */
  depth: number;
  parentId?: string;
  motion: PartMotion;
  on: boolean;
  strength: number;
  speed: number;
}
export type LivingPreset = 'calm' | 'stormy' | 'underwater' | 'dreamy';
export interface LivingState {
  on: boolean;
  preset: LivingPreset;
  strength: number;
  speed: number;
  parts: LivingPart[];
  analysedAt: number;
  /** Asset analysed (a re-analysis is needed when the clip's picture changes). */
  assetId: string;
}

/** CLIP phrases → kind. Several phrases per kind; the best-scoring phrase wins. */
export const WORDS: [string, PartKind][] = [
  ['a wooden ship hull', 'boat'], ['a sailing ship', 'boat'], ['a small rowing boat', 'boat'], ['a canoe', 'boat'], ['a car', 'rigid'],
  ['a white ship sail', 'sail'], ['a canvas sail', 'sail'], ['a flag', 'cloth'], ['a curtain', 'cloth'], ['a cape or scarf blowing', 'cloth'], ['long hair', 'cloth'],
  ['a wooden oar', 'oar'], ['a paddle', 'oar'], ['a long thin pole', 'oar'],
  ['a whale', 'animal'], ['a fish', 'animal'], ['a bird', 'animal'], ['an animal', 'animal'], ['a dragon', 'animal'],
  ['a small person silhouette', 'person'], ['a person', 'person'], ['a group of people', 'person'],
  ['ocean water', 'water'], ['a river', 'water'], ['deep blue water', 'water'], ['ocean waves', 'wave'], ['a breaking wave', 'wave'],
  ['the sky', 'sky'], ['a night sky with stars', 'sky'], ['dark storm clouds', 'cloud'], ['clouds', 'cloud'], ['smoke', 'cloud'], ['fog', 'cloud'],
  ['a tree', 'tree'], ['grass and plants', 'tree'], ['leaves', 'tree'],
  ['a glowing lamp', 'light'], ['fire', 'light'], ['a candle flame', 'light'],
  ['a building', 'rigid'], ['a rock', 'rigid'], ['a mountain', 'rigid'], ['a wooden mast', 'rigid'], ['a table', 'rigid'],
];
/** Words that are not pieces but weather to add on top. */
export const WEATHER: [string, 'rain' | 'snow' | 'dust'][] = [['heavy rain streaks', 'rain'], ['falling snow', 'snow'], ['floating particles and dust', 'dust']];

export const MOTION_OF: Record<PartKind, PartMotion> = { boat: 'rock', sail: 'billow', cloth: 'billow', oar: 'row', animal: 'glide', person: 'bob', water: 'flow', wave: 'flow', sky: 'drift', cloud: 'drift', tree: 'sway', light: 'flicker', rigid: 'still' };

/** Pick the kind from CLIP similarities (one per WORDS entry); below the threshold the piece stays rigid. */
export function kindFromScores(scores: number[], minProb = 0.3): { kind: PartKind; label: string; score: number } {
  // CLIP softmax (temperature 100) over the phrases, summed per kind: a kind wins only with a clear majority.
  const mx = Math.max(...scores), ex = scores.map((v) => Math.exp((v - mx) * 100)), Z = ex.reduce((a, b) => a + b, 0) || 1;
  const byKind = new Map<PartKind, number>();
  ex.forEach((e, i) => byKind.set(WORDS[i][1], (byKind.get(WORDS[i][1]) ?? 0) + e / Z));
  let kind: PartKind = 'rigid', prob = 0;
  for (const [k, v] of byKind) if (v > prob) (kind = k), (prob = v);
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best] && WORDS[i][1] === kind) best = i;
  if (WORDS[best]?.[1] !== kind) best = WORDS.findIndex((w) => w[1] === kind);
  return prob < minProb ? { kind: 'rigid', label: 'piece', score: prob } : { kind, label: WORDS[best][0].replace(/^(a|an|the) /, ''), score: prob };
}

/** Pieces attached to a ship / boat: above its waterline they are sails (or masts when thin), thin ones low down are oars;
 *  whole-object motions (rock, glide, drift) become "still" so children ride with their parent instead of moving apart. */
export function refineChild(kind: PartKind, s: Pick<MaskStats, 'cy' | 'elong'>, parentKind: PartKind, parentPivotY: number, lum = 1): { kind: PartKind; motion?: PartMotion } {
  if (parentKind === 'boat') {
    if (kind === 'sail' || kind === 'cloth') return { kind, motion: 'billow' };
    if (kind === 'person' || kind === 'light') return { kind };
    if (s.elong >= 4) return { kind: s.cy > parentPivotY - 0.05 ? 'oar' : 'rigid', motion: s.cy > parentPivotY - 0.05 ? 'row' : 'still' };
    if (s.cy < parentPivotY && lum > 0.45) return { kind: 'sail', motion: 'billow' };
    return { kind: 'rigid', motion: 'still' };
  }
  const m = MOTION_OF[kind];
  return { kind, motion: m === 'rock' || m === 'glide' || m === 'drift' ? 'still' : m };
}

/* ---------- geometry ---------- */
export interface MaskStats { n: number; cx: number; cy: number; bbox: [number, number, number, number]; axis: number; elong: number; ends: [[number, number], [number, number]] }
/** Stats of a binary mask (row-major, w × h, values > 0 = inside), in 0..1 coordinates. */
export function maskStats(m: ArrayLike<number>, w: number, h: number): MaskStats {
  let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 0) { n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!n) return { n: 0, cx: 0.5, cy: 0.5, bbox: [0, 0, 0, 0], axis: 0, elong: 1, ends: [[0.5, 0.5], [0.5, 0.5]] };
  const cx = sx / n, cy = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 0) { const dx = x - cx, dy = y - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  xx /= n; yy /= n; xy /= n;
  const axis = 0.5 * Math.atan2(2 * xy, xx - yy);
  const tr = xx + yy, det = xx * yy - xy * xy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
  // the two extreme points along the axis
  const ux = Math.cos(axis), uy = Math.sin(axis);
  let lo = Infinity, hi = -Infinity, pl: [number, number] = [cx, cy], ph: [number, number] = [cx, cy];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 0) { const t = (x - cx) * ux + (y - cy) * uy; if (t < lo) (lo = t), (pl = [x, y]); if (t > hi) (hi = t), (ph = [x, y]); }
  return { n, cx: cx / w, cy: cy / h, bbox: [x0 / w, y0 / h, (x1 - x0 + 1) / w, (y1 - y0 + 1) / h], axis, elong: Math.sqrt(l1 / l2), ends: [[pl[0] / w, pl[1] / h], [ph[0] / w, ph[1] / h]] };
}

/** Turning point / anchor of a piece by kind. `parent` = bbox of the piece it is attached to. */
export function pivotFor(kind: PartKind, s: MaskStats, parent?: [number, number, number, number]): [number, number] {
  const [, by, , bh] = s.bbox;
  switch (kind) {
    case 'oar': {
      if (!parent) return s.ends[0];
      const pc: [number, number] = [parent[0] + parent[2] / 2, parent[1] + parent[3] / 2];
      const d = (p: [number, number]) => Math.hypot(p[0] - pc[0], p[1] - pc[1]);
      return d(s.ends[0]) <= d(s.ends[1]) ? s.ends[0] : s.ends[1];
    }
    case 'boat': return [s.cx, by + bh * 0.85];
    case 'sail': case 'cloth': return [s.cx, by];
    case 'tree': return [s.cx, by + bh];
    case 'person': return [s.cx, by + bh];
    default: return [s.cx, s.cy];
  }
}

/** Parent = the other piece that contains most of this piece's box (people on a ship, oars on a boat, sails on a ship). */
export function parentOf(i: number, boxes: [number, number, number, number][], kinds: PartKind[]): number | undefined {
  if (['sky', 'cloud', 'water', 'wave'].includes(kinds[i])) return undefined;
  const b = boxes[i], area = Math.max(1e-6, b[2] * b[3]);
  let best: number | undefined, bestOv = 0;
  boxes.forEach((o, j) => {
    if (j === i || o[2] * o[3] <= area * 1.2 || o[2] * o[3] > 0.6) return; // a background-sized piece is never a parent
    if (!['boat', 'animal', 'rigid', 'tree'].includes(kinds[j]) && !(kinds[i] === 'person' && kinds[j] === 'boat')) return;
    const ox = Math.max(0, Math.min(b[0] + b[2], o[0] + o[2]) - Math.max(b[0], o[0])), oy = Math.max(0, Math.min(b[1] + b[3], o[1] + o[3]) - Math.max(b[1], o[1]));
    // oars stick out of their boat: a smaller overlap is enough for them
    const ov = (ox * oy) / area;
    if (ov > (kinds[i] === 'oar' ? 0.15 : 0.5) && ov > bestOv) (bestOv = ov), (best = j);
  });
  return best;
}

/* ---------- motion ---------- */
/** Base periods (seconds) per motion; the actual period fits a whole number of cycles in the clip. */
const PERIOD: Record<PartMotion, number> = { rock: 4.2, billow: 3.2, row: 2.6, glide: 0, sway: 3.6, flow: 6, drift: 0, bob: 2.2, flicker: 0.9, still: 1 };
/** A period that loops seamlessly: span / round(span / base), at least one cycle. */
export const loopPeriod = (base: number, span: number) => (base <= 0 ? span : span / Math.max(1, Math.round(span / base)));

/** Transform of a piece at local time t (0..span): rotation (rad) around the pivot, shift (0..1 of the image), bend amount for meshes. */
export interface PartPose { rot: number; dx: number; dy: number; bend: number; phase: number; flow: number; bright: number }
/** One wind / one sea per image: every piece shares the clock; the phase is a gust travelling across the picture
 *  (left → right, a little top → bottom) instead of a random start per piece, so neighbours move together. */
export const gustLag = (bbox?: [number, number, number, number]) => (bbox ? -((bbox[0] + bbox[2] / 2) * 1.6 + (bbox[1] + bbox[3] / 2) * 0.5) : 0);
export function poseAt(p: Pick<LivingPart, 'motion' | 'strength' | 'speed' | 'axis' | 'id'> & { bbox?: [number, number, number, number] }, t: number, span: number, global = 1): PartPose {
  // the speed only scales the image-wide clock (pieces of one image never drift out of step)
  const k = p.strength * global, base = PERIOD[p.motion] / Math.max(0.25, p.speed);
  const T = loopPeriod(base, span), w = (2 * Math.PI) / T, ph = p.bbox ? gustLag(p.bbox) : seed(p.id) * Math.PI * 2;
  const s = Math.sin(w * t + ph), c = Math.cos(w * t + ph);
  const out: PartPose = { rot: 0, dx: 0, dy: 0, bend: 0, phase: w * t + ph, flow: 0, bright: 0 };
  switch (p.motion) {
    case 'rock': out.rot = 0.018 * k * s; out.dy = 0.005 * k * c; break;
    case 'billow': out.bend = 0.012 * k * (0.55 + 0.45 * s); break;
    case 'row': out.rot = 0.16 * k * s; break;
    case 'glide': { const g = 0.025 * k * Math.sin(Math.PI * 2 * (t / span)); out.dx = Math.cos(p.axis) * g; out.dy = Math.sin(p.axis) * g; out.bend = 0.012 * k * s; break; }
    case 'sway': out.bend = 0.02 * k * s; break;
    case 'flow': out.flow = t / span; out.bend = 0.006 * k; break; // flow = loop phase 0..1 (the renderer scrolls whole cycles)
    case 'drift': out.dx = 0.012 * k * Math.sin(Math.PI * 2 * (t / span)); break;
    case 'bob': out.dy = 0.004 * k * s; break;
    case 'flicker': out.bright = 0.12 * k * (0.5 * s + 0.3 * Math.sin(3 * (w * t + ph)) + 0.2 * Math.sin(7 * (w * t + ph))); break;
  }
  return out;
}
const seed = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; };

export const PRESETS: Record<LivingPreset, { name: string; strength: number; speed: number; weather?: 'rain' | 'snow' | 'dust' }> = {
  calm: { name: 'Calm', strength: 0.7, speed: 0.8 },
  stormy: { name: 'Stormy', strength: 1.3, speed: 1.25, weather: 'rain' },
  underwater: { name: 'Underwater', strength: 1, speed: 0.7, weather: 'dust' },
  dreamy: { name: 'Dreamy', strength: 0.8, speed: 0.6 },
};
