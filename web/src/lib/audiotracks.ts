/** v3.0 audio tracks: helpers, defaults and migration from the single-voiceover model. */
import type { AudioClip, AudioTrack, Project, TrackKind } from '../types';
import type { VoiceFx } from '../audio/enhance';
import { uid } from './util';

export const TRACK_IDS = { voice: 'trk_voice', music: 'trk_music', sfx: 'trk_sfx' } as const;

export const defaultTracks = (): AudioTrack[] => [
  { id: TRACK_IDS.voice, name: 'Voice', kind: 'voice', volume: 1 },
  { id: TRACK_IDS.music, name: 'Music', kind: 'music', volume: 1 },
  { id: TRACK_IDS.sfx, name: 'SFX', kind: 'sfx', volume: 1 },
];

/** Defaults for a new clip of a given kind. */
export const newAudioClip = (trackId: string, assetId: string, start: number, duration: number, kind: TrackKind, extra: Partial<AudioClip> = {}): AudioClip => ({
  id: uid(), trackId, assetId, start, duration, trimIn: 0,
  volume: kind === 'music' ? 0.25 : kind === 'sfx' ? 0.6 : 1,
  fadeIn: kind === 'music' ? 1 : 0, fadeOut: kind === 'music' ? 2 : 0,
  duck: kind === 'music' || kind === 'other' ? true : undefined,
  ...extra,
});

export const clipEndOf = (c: { start: number; duration: number }) => c.start + c.duration;
export const trackOf = (p: Project, c: AudioClip) => p.audioTracks.find((t) => t.id === c.trackId);
export const narrationTrack = (p: Project) => p.audioTracks.find((t) => t.id === p.narrationTrackId);
export const firstTrackOfKind = (p: Project, kind: TrackKind) => p.audioTracks.find((t) => t.kind === kind);

/** Narration clips in time order. */
export const narrationClips = (p: Project) => p.audio.filter((c) => c.trackId === p.narrationTrackId).sort((a, b) => a.start - b.start);
/** Where the narration starts (0 without narration). */
export const voiceStartOf = (p: Project) => narrationClips(p)[0]?.start ?? 0;
/** Where the narration ends (0 without narration). */
export const narrationEnd = (p: Project) => Math.max(0, ...narrationClips(p).map(clipEndOf));
/** The first narration asset (for tools that work on one voice file). */
export const mainVoiceAsset = (p: Project) => narrationClips(p)[0]?.assetId;

/** Tracks that actually sound (mute / solo). */
export function audibleTrack(p: Project, trackId: string) {
  const solo = p.audioTracks.some((t) => t.solo);
  const t = p.audioTracks.find((x) => x.id === trackId);
  return !!t && !t.muted && (!solo || !!t.solo);
}

/** Make sure a track of `kind` exists and return its id. */
export function ensureTrack(p: Project, kind: TrackKind): string {
  const t = firstTrackOfKind(p, kind);
  if (t) return t.id;
  const id = kind in TRACK_IDS ? TRACK_IDS[kind as keyof typeof TRACK_IDS] : 'trk_' + uid();
  p.audioTracks.push({ id, name: kind === 'voice' ? 'Voice' : kind === 'music' ? 'Music' : kind === 'sfx' ? 'SFX' : 'Audio', kind, volume: 1 });
  return id;
}

/** Add a new track (Pro). */
export function addTrack(p: Project, kind: TrackKind = 'other', name?: string): string {
  const id = 'trk_' + uid();
  const n = p.audioTracks.filter((t) => t.kind === kind).length + 1;
  p.audioTracks.push({ id, name: name ?? `${kind === 'voice' ? 'Voice' : kind === 'music' ? 'Music' : kind === 'sfx' ? 'SFX' : 'Audio'} ${n}`, kind, volume: 1 });
  return id;
}

/** Shift captions, lines and typography inside [from, to) by `dt` (they follow their voice clip). */
export function shiftWords(p: Project, from: number, to: number, dt: number) {
  if (!dt) return;
  const inside = (s: number) => s >= from - 0.001 && s < to;
  p.words.forEach((w) => inside(w.start) && ((w.start += dt), (w.end += dt)));
  p.lines.forEach((l) => inside(l.start) && ((l.start += dt), (l.end += dt), l.words.forEach((w) => ((w.start += dt), (w.end += dt)))));
  p.typo.forEach((b) => inside(b.start) && ((b.start += dt), (b.end += dt), b.words.forEach((w) => ((w.start += dt), (w.end += dt)))));
}

/** Move an audio clip; narration clips carry their captions / typography with them. */
export function moveAudioClip(p: Project, id: string, start: number, trackId?: string) {
  const c = p.audio.find((x) => x.id === id);
  if (!c) return;
  const ns = Math.max(0, start);
  if (c.trackId === p.narrationTrackId) shiftWords(p, c.start, clipEndOf(c), ns - c.start);
  c.start = ns;
  if (trackId) c.trackId = trackId;
}

/** Move the whole narration so it starts at `v` (intro before it); captions follow. */
export function setVoiceStart(p: Project, v: number) {
  const dt = Math.max(0, v) - voiceStartOf(p);
  if (!dt) return;
  const n = narrationClips(p);
  if (!n.length) return;
  const from = n[0].start, to = narrationEnd(p);
  shiftWords(p, from, to + 1e9, dt);
  n.forEach((c) => (c.start += dt));
}

/** Split an audio clip at timeline time `t`; returns the new right-hand clip id. */
export function splitAudioClip(p: Project, id: string, t: number): string | undefined {
  const c = p.audio.find((x) => x.id === id);
  if (!c || t <= c.start + 0.05 || t >= clipEndOf(c) - 0.05) return;
  const left = t - c.start;
  const right: AudioClip = { ...structuredClone(c), id: uid(), start: t, duration: c.duration - left, trimIn: c.trimIn + left * (c.rate ?? 1), fadeIn: 0 };
  c.duration = left;
  c.fadeOut = 0;
  p.audio.push(right);
  return right.id;
}

interface LegacyAudio {
  voiceover?: { assetId: string; volume: number; splits?: number[]; fx?: VoiceFx };
  voiceStart?: number;
  tail?: number;
  music?: (Omit<AudioClip, 'trackId'> & { trackId?: string })[];
  sfx?: { id: string; sound: string; start: number; volume: number }[];
}

/** v3.0 migration: voiceover (+ splits) / music / sfx → clips on Voice / Music / SFX tracks. Keeps the same length. */
export function migrateAudio(p: Project & LegacyAudio): Project {
  if (p.audioTracks?.length && p.audio) return p;
  const tracks = defaultTracks();
  const audio: AudioClip[] = [];
  const assetDur = (id: string) => p.assets.find((a) => a.id === id)?.duration ?? 0;
  const vs = p.voiceStart ?? 0;
  let voiceEnd = 0;
  if (p.voiceover) {
    tracks[0].volume = p.voiceover.volume ?? 1;
    tracks[0].fx = p.voiceover.fx;
    const dur = assetDur(p.voiceover.assetId);
    const cuts = [0, ...(p.voiceover.splits ?? []).filter((s) => s > 0 && s < dur).sort((a, b) => a - b), dur];
    for (let k = 0; k + 1 < cuts.length; k++) audio.push(newAudioClip(TRACK_IDS.voice, p.voiceover.assetId, vs + cuts[k], cuts[k + 1] - cuts[k], 'voice', { trimIn: cuts[k] }));
    voiceEnd = vs + dur;
  }
  for (const m of p.music ?? []) audio.push({ ...m, trackId: TRACK_IDS.music });
  for (const s of p.sfx ?? []) {
    const file = s.sound.startsWith('asset:') ? s.sound.slice(6) : '';
    audio.push(newAudioClip(TRACK_IDS.sfx, file, s.start, file ? assetDur(file) || 1.5 : 1.5, 'sfx', { id: s.id, volume: s.volume, sound: file ? undefined : s.sound }));
  }
  const oldLength = voiceEnd ? voiceEnd + (p.tail ?? 0) : p.length;
  const next = { ...p, audioTracks: tracks, audio, narrationTrackId: TRACK_IDS.voice, length: oldLength } as Project & LegacyAudio;
  delete next.voiceover;
  delete next.voiceStart;
  delete next.tail;
  delete next.music;
  delete next.sfx;
  return next;
}
