import type { Project } from '../types';
import { clipEnd, projectLength, voiceEnd } from '../store';
import { media } from '../render/media';
import { sfxBuffer } from './sfx';

export interface Buffers {
  assets: Map<string, AudioBuffer>;
  sfx: Map<string, AudioBuffer>;
}

/** Decode every buffer the mix needs. */
export async function loadBuffers(p: Project): Promise<Buffers> {
  const ids = new Set<string>();
  if (p.voiceover) ids.add(p.voiceover.assetId);
  p.music.forEach((m) => ids.add(m.assetId));
  p.clips.forEach((c) => {
    const a = p.assets.find((x) => x.id === c.assetId);
    if (a?.kind === 'video' && c.volume > 0) ids.add(c.assetId);
  });
  const assets = new Map<string, AudioBuffer>();
  await Promise.all([...ids].map(async (id) => {
    const b = await media.audioBuffer(id);
    if (b) assets.set(id, b);
  }));
  const sfx = new Map<string, AudioBuffer>();
  await Promise.all([...new Set(p.sfx.map((s) => s.sound))].map(async (n) => {
    const b = await sfxBuffer(n);
    if (b) sfx.set(n, b);
  }));
  return { assets, sfx };
}

/** Time ranges with speech, used to duck background music. */
function speechRanges(p: Project): [number, number][] {
  const src = p.words.length ? p.words.map((w) => [w.start, w.end] as [number, number]) : p.lines.map((l) => [l.start, l.end] as [number, number]);
  if (!src.length) return p.voiceover ? [[p.voiceStart ?? 0, voiceEnd(p)]] : [];
  const out: [number, number][] = [];
  for (const r of src) {
    const last = out[out.length - 1];
    if (last && r[0] - last[1] < 0.7) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Build the audio graph for the project on any AudioContext, starting at timeline time `from`, with timeline `from`
 * mapped to context time `at`. Returns the source nodes so playback can be stopped.
 */
export function buildMix(ctx: BaseAudioContext, p: Project, bufs: Buffers, from: number, at: number, until = projectLength(p)) {
  const nodes: AudioScheduledSourceNode[] = [];
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const toCtx = (T: number) => at + (T - from);
  // Master fade in / out over the whole mix.
  const len = projectLength(p);
  const fi = p.audioFade?.in ?? 0, fo = p.audioFade?.out ?? 0;
  const level = (T: number) => Math.min(1, fi > 0 ? T / fi : 1, fo > 0 ? (len - T) / fo : 1);
  master.gain.setValueAtTime(Math.max(0, level(from)), at);
  if (fi > 0 && from < fi) master.gain.linearRampToValueAtTime(1, toCtx(fi));
  if (fo > 0) {
    if (from < len - fo) master.gain.setValueAtTime(1, toCtx(len - fo));
    master.gain.linearRampToValueAtTime(0, toCtx(len));
  }

  const play = (buf: AudioBuffer | undefined, start: number, dur: number, trimIn: number, dest: AudioNode, loopEnd?: number) => {
    if (!buf) return;
    const end = Math.min(start + dur, until);
    if (end <= from || trimIn >= buf.duration) return;
    const skip = Math.max(0, from - start);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    if (loopEnd !== undefined) {
      src.loop = true;
      src.loopStart = trimIn;
      src.loopEnd = Math.min(loopEnd, buf.duration);
      const span = Math.max(0.05, src.loopEnd - trimIn);
      src.start(Math.max(at, toCtx(start)), trimIn + (skip % span));
      src.stop(toCtx(end));
    } else src.start(Math.max(at, toCtx(start)), trimIn + skip, Math.max(0, end - start - skip));
    nodes.push(src);
  };

  if (p.voiceover) {
    const g = ctx.createGain();
    g.gain.value = p.voiceover.volume;
    g.connect(master);
    play(bufs.assets.get(p.voiceover.assetId), p.voiceStart ?? 0, Infinity, 0, g);
  }

  const speech = speechRanges(p);
  for (const m of p.music) {
    const g = ctx.createGain();
    g.connect(master);
    const set = (T: number, v: number) => {
      const c = toCtx(T);
      if (c >= at) g.gain.linearRampToValueAtTime(v, c);
    };
    const v = m.volume;
    const end = m.start + m.duration;
    g.gain.setValueAtTime(m.fadeIn > 0 && from < m.start + m.fadeIn ? v * Math.max(0, (from - m.start) / m.fadeIn) : v, at);
    if (m.fadeIn > 0) set(m.start + m.fadeIn, v);
    if (m.duck) {
      const duck = v * 0.35;
      for (const [s, e] of speech) {
        if (e < m.start || s > end) continue;
        set(Math.max(m.start + m.fadeIn, s - 0.25), v);
        set(s, duck);
        set(e, duck);
        set(e + 0.4, v);
      }
    }
    if (m.fadeOut > 0) {
      set(end - m.fadeOut, v);
      set(end, 0);
    }
    play(bufs.assets.get(m.assetId), m.start, m.duration, m.trimIn, g);
  }

  p.clips.forEach((c, i) => {
    const buf = bufs.assets.get(c.assetId);
    if (!buf || c.volume <= 0) return;
    const g = ctx.createGain();
    g.gain.value = c.volume;
    g.connect(master);
    const start = i === 0 ? 0 : c.start;
    const srcEnd = Math.min(c.trimOut ?? Infinity, buf.duration);
    if (c.loop) play(buf, start, clipEnd(p, i) - start, c.trimIn, g, srcEnd);
    else play(buf, start, Math.min(clipEnd(p, i) - start, srcEnd - c.trimIn), c.trimIn, g);
  });

  for (const s of p.sfx) {
    const g = ctx.createGain();
    g.gain.value = s.volume;
    g.connect(master);
    const buf = bufs.sfx.get(s.sound);
    play(buf, s.start, buf?.duration ?? 0, 0, g);
  }
  return { nodes, master };
}

/** Offline-render the full mix for export. */
export async function renderMix(p: Project, sampleRate = 48000) {
  const len = projectLength(p);
  const bufs = await loadBuffers(p);
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sampleRate), sampleRate);
  buildMix(ctx, p, bufs, 0, 0, len);
  return ctx.startRendering();
}
