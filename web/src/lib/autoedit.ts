/**
 * Auto-edit from a voiceover: split the narration into scenes (sentence / pause boundaries, optional beat snapping),
 * find a visual for each scene (your media via CLIP, free media, AI images, or a placeholder), then build the timeline.
 */
import { blankClip, defaultClip } from './project';
import type { FreeItem, Credit } from './freemedia';
import type { Clip, Motion, Project, Word } from '../types';

export interface PlannedScene {
  start: number;
  end: number;
  text: string;
}

export type CandidateSource = 'mine' | 'free' | 'ai' | 'blank';
export interface Candidate {
  key: string;
  source: CandidateSource;
  label: string;
  thumb?: string;
  /** Existing project asset (mine / ai). */
  assetId?: string;
  /** Not downloaded yet (free). */
  free?: FreeItem;
  /** 0–100 match for "mine". */
  match?: number;
}

export interface AutoScene extends PlannedScene {
  query: string;
  candidates: Candidate[];
  pick: string;
}

export interface AutoOptions {
  /** Target scene length in seconds. */
  target: number;
  snapBeats: boolean;
  motion: 'vary' | 'keep';
  transitions: 'cuts' | 'mixed' | 'soft';
}

const MIN_SCENE = 1;

/** Move a cut to the nearest beat within `window` seconds. */
export function snapToBeat(t: number, beats: number[], window = 0.35): number {
  let best = t, d = window;
  for (const b of beats) {
    const x = Math.abs(b - t);
    if (x < d) (best = b), (d = x);
  }
  return best;
}

/**
 * Scenes covering the whole video: the first starts at 0 (covers any intro) and the last ends at `length`
 * (covers the outro). Cuts land on word starts, optionally snapped to music beats, never closer than 1 s.
 */
export function planScenes(words: Word[], length: number, o: Pick<AutoOptions, 'target' | 'snapBeats'>, beats: number[] = []): PlannedScene[] {
  if (!words.length) {
    const n = Math.max(1, Math.round(length / o.target));
    return Array.from({ length: n }, (_, i) => ({ start: (i * length) / n, end: ((i + 1) * length) / n, text: '' }));
  }
  const cuts: number[] = [0];
  let sceneStart = words[0].start;
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1], w = words[i];
    const elapsed = w.start - sceneStart, gap = w.start - prev.end;
    const cut = (/[.!?…؟]$/.test(prev.text) && elapsed >= o.target * 0.6)
      || (gap >= 0.7 && elapsed >= o.target * 0.4)
      || (/[,;:،]$/.test(prev.text) && elapsed >= o.target * 1.1)
      || elapsed >= o.target * 1.35;
    if (!cut) continue;
    let t = w.start;
    if (o.snapBeats && beats.length) t = snapToBeat(t, beats);
    if (t - cuts[cuts.length - 1] >= MIN_SCENE && length - t >= MIN_SCENE) {
      cuts.push(t);
      sceneStart = w.start;
    }
  }
  return cuts.map((start, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1] : length;
    const text = words.filter((w) => w.start >= start - 0.05 && w.start < end - 0.05).map((w) => w.text).join(' ');
    return { start, end, text };
  });
}

/** Greedy unique assignment: each scene gets its best-matching asset that no earlier pick used (when possible). */
export function assignUnique(scores: number[][], minScore = -Infinity): (number | null)[] {
  const pairs: [number, number, number][] = [];
  scores.forEach((row, s) => row.forEach((v, a) => v >= minScore && pairs.push([v, s, a])));
  pairs.sort((x, y) => y[0] - x[0]);
  const out: (number | null)[] = scores.map(() => null);
  const used = new Set<number>();
  for (const [, s, a] of pairs) if (out[s] === null && !used.has(a)) (out[s] = a), used.add(a);
  return out;
}

const MOTIONS: Motion[] = ['zoomIn', 'panRight', 'zoomOut', 'panLeft', 'drift', 'tiltUp', 'diagonal', 'breathe'];

/** Clips for the planned scenes. `assetFor(i)` = asset id for scene i (or undefined for a blank placeholder). */
export function buildClips(scenes: PlannedScene[], assetFor: (i: number) => string | undefined, isVideo: (id: string) => boolean, o: Pick<AutoOptions, 'motion' | 'transitions'>): Clip[] {
  return scenes.map((s, i) => {
    const id = assetFor(i);
    const c = id ? defaultClip(id, s.start) : blankClip(s.start, '#111318');
    if (id && o.motion === 'vary') c.motion = isVideo(id) ? 'none' : MOTIONS[i % MOTIONS.length];
    c.transition = i === 0 ? 'none' : o.transitions === 'cuts' ? 'none' : o.transitions === 'soft' ? 'crossfade' : i % 3 === 0 ? 'crossfade' : 'none';
    return c;
  });
}

/** Replace the project's clips with the auto-edit (one undo step in the caller). */
export function applyAutoEdit(p: Project, clips: Clip[], credits: Credit[]) {
  p.clips = clips;
  if (credits.length) p.credits = [...(p.credits ?? []).filter((c) => !credits.some((n) => n.assetId === c.assetId)), ...credits];
}
