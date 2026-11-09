/**
 * Timeline editing operations (split, ripple delete, copy/paste, duplicate, detach audio).
 * Pure functions on a project draft — the UI wraps them in `update()` so each is one undo step.
 */
import { clipEnd, projectLength } from '../store';
import { remapTime, type Range } from '../audio/silence';
import { uid } from '../lib/util';
import type { AudioClip, Clip, Overlay, PipClip, Project, TypoBlock } from '../types';
import { narrationClips, splitAudioClip, unbindWords } from '../lib/audiotracks';
import { placeAudio } from '../lib/project';

const MIN = 0.1;
export const clipStartOf = (p: Project, i: number) => (i === 0 ? 0 : p.clips[i].start);
const clipIdx = (p: Project, t: number) => {
  let i = 0;
  while (i + 1 < p.clips.length && p.clips[i + 1].start <= t) i++;
  return i;
};
const isVideo = (p: Project, c: Clip) => p.assets.find((a) => a.id === c.assetId)?.kind === 'video';

/** Shift every timed item by `remap` (used by ripple cuts on the whole timeline). */
export function applyTimeMap(p: Project, r: (t: number) => number, opts: { clips?: boolean } = {}) {
  p.words.forEach((w) => ((w.start = r(w.start)), (w.end = r(w.end))));
  p.lines.forEach((l) => ((l.start = r(l.start)), (l.end = r(l.end)), l.words.forEach((w) => ((w.start = r(w.start)), (w.end = r(w.end))))));
  p.typo.forEach((b) => ((b.start = r(b.start)), (b.end = r(b.end)), b.words.forEach((w) => ((w.start = r(w.start)), (w.end = r(w.end))))));
  for (const list of [p.overlays, p.audio, p.pips ?? []] as { start: number; duration: number }[][]) {
    list.forEach((o) => {
      const end = r(o.start + o.duration);
      o.start = r(o.start);
      o.duration = Math.max(0.2, end - o.start);
    });
  }
  if (opts.clips !== false) {
    p.clips.forEach((c, i) => i > 0 && (c.start = r(c.start)));
    for (let i = 1; i < p.clips.length; i++) if (p.clips[i].start <= p.clips[i - 1].start + 0.05) p.clips[i].start = p.clips[i - 1].start + 0.05;
  }
  p.effects.forEach((e) => e.scope?.kind === 'range' && ((e.scope.start = r(e.scope.start)), (e.scope.end = r(e.scope.end))));
}

/**
 * The file of every narration clip using `oldAssetId` was cut at `cutsFile` (seconds into the file) and replaced by
 * `newAssetId`: everything after each cut moves earlier on the whole timeline.
 */
export function applyCuts(p: Project, cutsFile: Range[], newAssetId: string, oldAssetId = narrationClips(p)[0]?.assetId) {
  const users = p.audio.filter((c) => c.assetId === oldAssetId);
  const cuts = users.flatMap((c) => cutsFile
    .filter((k) => k.end > c.trimIn && k.start < c.trimIn + c.duration * (c.rate ?? 1))
    .map((k) => ({ start: c.start + (Math.max(k.start, c.trimIn) - c.trimIn) / (c.rate ?? 1), end: c.start + (k.end - c.trimIn) / (c.rate ?? 1) })))
    .sort((a, b) => a.start - b.start);
  users.forEach((c) => ((c.assetId = newAssetId), (c.trimIn = remapTime(c.trimIn, cutsFile))));
  unbindWords(p);
  applyTimeMap(p, (t) => remapTime(t, cuts));
  p.length = remapTime(p.length, cuts);
}

// ---------- split ----------

/** Split the clip under `t`. Video clips continue from the right source time (speed-aware). */
export function splitClipAt(p: Project, t: number): boolean {
  if (!p.clips.length) return false;
  const i = clipIdx(p, t);
  const c = p.clips[i];
  const start = clipStartOf(p, i);
  if (t - start < MIN || clipEnd(p, i) - t < MIN) return false;
  const copy: Clip = { ...structuredClone(c), id: uid(), start: t, transition: 'none', trimIn: isVideo(p, c) ? c.trimIn + (t - start) * (c.speed ?? 1) : 0, fadeIn: 0 };
  c.fadeOut = 0;
  p.clips.splice(i + 1, 0, copy);
  return true;
}

export const splitAudio = (p: Project, id: string, t: number): boolean => !!splitAudioClip(p, id, t);

export function splitOverlay(p: Project, id: string, t: number): boolean {
  const o = p.overlays.find((x) => x.id === id);
  if (!o || t - o.start < MIN || o.start + o.duration - t < MIN) return false;
  const right: Overlay = { ...structuredClone(o), id: uid(), start: t, duration: o.start + o.duration - t, fadeIn: 0 };
  o.duration = t - o.start;
  o.fadeOut = 0;
  p.overlays.splice(p.overlays.indexOf(o) + 1, 0, right);
  return true;
}

// ---------- ripple delete ----------

/**
 * Remove clips and pull the following clips earlier by their length. Without a voiceover the whole timeline
 * closes the gap (text, music, SFX, typography move too) and the video gets shorter; with a voiceover the
 * narration is the master clock, so only the visuals move and the last clip stretches to the end.
 */
export function rippleDeleteClips(p: Project, ids: Set<string>) {
  const ranges: Range[] = [];
  p.clips.forEach((c, i) => ids.has(c.id) && ranges.push({ start: clipStartOf(p, i), end: clipEnd(p, i) }));
  if (!ranges.length || ranges.length === p.clips.length) return;
  const merged = ranges.sort((a, b) => a.start - b.start).reduce<Range[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && r.start <= last.end + 1e-6) last.end = Math.max(last.end, r.end);
    else acc.push({ ...r });
    return acc;
  }, []);
  const removed = merged.reduce((a, r) => a + r.end - r.start, 0);
  p.clips = p.clips.filter((c) => !ids.has(c.id));
  const r = (t: number) => remapTime(t, merged);
  p.clips.forEach((c, i) => (c.start = i === 0 ? 0 : r(c.start)));
  if (!narrationClips(p).length) applyTimeMap(p, r, { clips: false });
  p.length = Math.max(0.5, p.length - removed);
}

// ---------- copy / paste / duplicate ----------

export type Clip0 = { clip: Clip; len: number };
export type ClipboardData =
  | { kind: 'clips'; items: Clip0[] }
  | { kind: 'overlays'; items: Overlay[] }
  | { kind: 'audio'; items: AudioClip[] }
  | { kind: 'pips'; items: PipClip[] }
  | { kind: 'typo'; items: TypoBlock[] }
  | { kind: 'mixed'; items: (Clip0 | Overlay | AudioClip | TypoBlock)[]; clips: Clip0[]; overlays: Overlay[]; audio: AudioClip[]; typo: TypoBlock[]; t0: number };

export function copyItems(p: Project, sel: { kind: string; id: string } | null, multi: string[]): ClipboardData | null {
  const all = new Set([...(sel ? [sel.id] : []), ...multi]);
  const others = [...p.overlays, ...p.audio, ...p.typo].filter((x) => all.has(x.id));
  if (multi.length && others.length && (others.length > 1 || p.clips.some((c) => all.has(c.id)))) {
    const clips = p.clips.map((c, i) => ({ c, i })).filter(({ c }) => all.has(c.id)).map(({ c, i }) => ({ clip: structuredClone(c), len: clipEnd(p, i) - clipStartOf(p, i) }));
    const overlays = structuredClone(p.overlays.filter((x) => all.has(x.id)));
    const audio = structuredClone(p.audio.filter((x) => all.has(x.id)));
    const typo = structuredClone(p.typo.filter((x) => all.has(x.id)));
    const starts = [...clips.map((x) => (p.clips.findIndex((c) => c.id === x.clip.id) === 0 ? 0 : x.clip.start)), ...overlays.map((x) => x.start), ...audio.map((x) => x.start), ...typo.map((x) => x.start)];
    return { kind: 'mixed', items: [...clips, ...overlays, ...audio, ...typo], clips, overlays, audio, typo, t0: Math.min(...starts) };
  }
  if (sel?.kind === 'clip' || multi.length) {
    const ids = new Set([...(sel?.kind === 'clip' ? [sel.id] : []), ...multi]);
    const items = p.clips.map((c, i) => ({ c, i })).filter(({ c }) => ids.has(c.id)).map(({ c, i }) => ({ clip: structuredClone(c), len: clipEnd(p, i) - clipStartOf(p, i) }));
    return items.length ? { kind: 'clips', items } : null;
  }
  if (!sel) return null;
  const pick = <T extends { id: string }>(list: T[]) => list.filter((x) => x.id === sel.id).map((x) => structuredClone(x));
  if (sel.kind === 'overlay') return { kind: 'overlays', items: pick(p.overlays) };
  if (sel.kind === 'audio') return { kind: 'audio', items: pick(p.audio) };
  if (sel.kind === 'pip') return { kind: 'pips', items: pick(p.pips) };
  if (sel.kind === 'keyword') return { kind: 'typo', items: pick(p.typo) };
  return null;
}

/**
 * Insert clips at t (splitting the clip under t). Later clips move right by the pasted length; without a
 * voiceover the video grows, with one the narration stays where it is.
 */
export function insertClips(p: Project, t: number, items: Clip0[]): string[] {
  splitClipAt(p, t);
  const total = items.reduce((a, x) => a + x.len, 0);
  let idx = p.clips.findIndex((_, i) => clipStartOf(p, i) >= t - 1e-6);
  if (idx < 0) idx = p.clips.length;
  const at = idx === 0 ? 0 : t;
  for (let i = idx; i < p.clips.length; i++) p.clips[i].start = (i === 0 ? 0 : p.clips[i].start) + total;
  let s = at;
  const ids: string[] = [];
  const fresh = items.map(({ clip, len }) => {
    const c = { ...structuredClone(clip), id: uid(), start: s };
    s += len;
    ids.push(c.id);
    return c;
  });
  p.clips.splice(idx, 0, ...fresh);
  p.length += total;
  return ids;
}

/** Paste the clipboard at timeline time t. Returns the ids of the new items. */
export function pasteItems(p: Project, data: ClipboardData, t: number): string[] {
  if (data.kind === 'clips') return insertClips(p, t, data.items);
  if (data.kind === 'mixed') {
    const shift = t - data.t0;
    const ids = data.clips.length ? insertClips(p, t, data.clips) : [];
    const fresh = <T extends { id: string; start: number }>(x: T): T => {
      const c = { ...structuredClone(x), id: uid(), start: Math.max(0, x.start + shift) };
      ids.push(c.id);
      return c;
    };
    p.overlays.push(...data.overlays.map(fresh));
    p.audio.push(...data.audio.map(fresh));
    p.typo.push(...data.typo.map((b) => {
      const c = fresh(b);
      c.end += shift;
      c.words.forEach((w) => ((w.start += shift), (w.end += shift)));
      return c;
    }));
    return ids;
  }
  const s0 = Math.min(...data.items.map((x) => x.start));
  const shift = t - s0;
  const ids: string[] = [];
  const fresh = <T extends { id: string; start: number }>(x: T): T => {
    const c = { ...structuredClone(x), id: uid(), start: x.start + shift };
    ids.push(c.id);
    return c;
  };
  if (data.kind === 'overlays') p.overlays.push(...data.items.map(fresh));
  if (data.kind === 'audio') p.audio.push(...data.items.map(fresh));
  if (data.kind === 'pips') p.pips.push(...data.items.map(fresh));
  if (data.kind === 'typo') {
    p.typo.push(...data.items.map((b) => {
      const c = fresh(b);
      c.end += shift;
      c.words.forEach((w) => ((w.start += shift), (w.end += shift)));
      return c;
    }));
  }
  return ids;
}

/** End time of the copied items (where a duplicate goes). */
export function clipboardEnd(p: Project, data: ClipboardData): number {
  if (data.kind === 'clips') {
    const last = data.items[data.items.length - 1].clip.id;
    const i = p.clips.findIndex((c) => c.id === last);
    return i >= 0 ? clipEnd(p, i) : 0;
  }
  if (data.kind === 'typo') return Math.max(...data.items.map((b) => b.end));
  if (data.kind === 'mixed') return Math.max(...data.audio.map((x) => x.start + x.duration), ...data.overlays.map((x) => x.start + x.duration), ...data.typo.map((x) => x.end), data.t0 + data.clips.reduce((a, x) => a + x.len, 0));
  return Math.max(...data.items.map((x) => x.start + x.duration));
}

// ---------- detach audio ----------

/** Move a video clip's sound onto an audio track (same timing and speed) and mute the clip; `linked` keeps it in step. */
export function detachAudio(p: Project, clipId: string, linked = false): string | null {
  const i = p.clips.findIndex((c) => c.id === clipId);
  const c = p.clips[i];
  if (!c || !isVideo(p, c) || c.volume <= 0) return null;
  const start = clipStartOf(p, i);
  const asset = p.assets.find((a) => a.id === c.assetId)!;
  const speed = c.speed ?? 1;
  const srcLen = (Math.min(c.trimOut ?? Infinity, asset.duration ?? Infinity) - c.trimIn) / speed;
  const m = placeAudio(p, c.assetId, 'other', start, Math.max(0.2, Math.min(clipEnd(p, i) - start, srcLen)));
  Object.assign(m, { trimIn: c.trimIn, volume: c.volume, fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0, duck: false, rate: speed === 1 ? undefined : speed, linkClipId: linked ? c.id : undefined });
  c.volume = 0;
  return m.id;
}

// ---------- snapping ----------

/** Times worth snapping to: start, end, playhead, cuts, narration edges and every item edge (except `exclude`). */
export function snapPoints(p: Project, playhead: number, exclude?: string): number[] {
  const pts = [0, projectLength(p), playhead];
  p.clips.forEach((c, i) => i > 0 && c.id !== exclude && pts.push(c.start));
  if (p.clips.length) pts.push(p.length);
  for (const o of [...p.overlays, ...p.audio, ...(p.pips ?? [])]) if (o.id !== exclude) pts.push(o.start, o.start + o.duration);
  for (const b of p.typo) if (b.id !== exclude) pts.push(b.start, b.end);
  return pts;
}

/** Snap t to the nearest point within `px` pixels at `zoom` px/s. */
export function snapTime(t: number, points: number[], zoom: number, px = 8): number {
  let best = t, dist = px / zoom;
  for (const q of points) {
    const d = Math.abs(q - t);
    if (d < dist) (best = q), (dist = d);
  }
  return best;
}
