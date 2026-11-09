import { voiceChain } from './enhance';
import type { Project } from '../types';
import { clipEnd, projectLength, voiceEnd } from '../store';
import { media } from '../render/media';
import { sfxBuffer } from './sfx';
import { analyzeLevels, speechRangesFromLevels } from './silence';

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

/**
 * Time ranges with speech, used to duck background music. Pauses are detected from the voiceover audio itself
 * (so ducking works without captions); captions are the fallback when the voice buffer is unavailable.
 */
export function speechRanges(p: Project, bufs?: Buffers): [number, number][] {
  const vo = p.voiceover && bufs?.assets.get(p.voiceover.assetId);
  if (vo) {
    const off = p.voiceStart ?? 0;
    return speechRangesFromLevels(analyzeLevels(vo)).map((r) => [r.start + off, r.end + off] as [number, number]);
  }
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
export type Stem = 'voice' | 'music' | 'sfx' | 'clips';

/** `only` limits the mix to some stems (audio export); ducking still follows the voice. */
export function buildMix(ctx: BaseAudioContext, p: Project, bufs: Buffers, from: number, at: number, until = projectLength(p), only?: Set<Stem>) {
  const want = (s: Stem) => !only || only.has(s);
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

  /** Play `buf` from timeline `start` for `dur` timeline seconds, from `trimIn` in the file, at `rate`. */
  const play = (buf: AudioBuffer | undefined, start: number, dur: number, trimIn: number, dest: AudioNode, loopEnd?: number, rate = 1) => {
    if (!buf) return;
    const end = Math.min(start + dur, until);
    if (end <= from || trimIn >= buf.duration) return;
    const skip = Math.max(0, from - start);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(dest);
    if (loopEnd !== undefined) {
      src.loop = true;
      src.loopStart = trimIn;
      src.loopEnd = Math.min(loopEnd, buf.duration);
      const span = Math.max(0.05, src.loopEnd - trimIn);
      src.start(Math.max(at, toCtx(start)), trimIn + ((skip * rate) % span));
      src.stop(toCtx(end));
    } else src.start(Math.max(at, toCtx(start)), trimIn + skip * rate, Math.max(0, (end - start - skip) * rate));
    nodes.push(src);
  };

  /** Fade a gain node in/out over [start, end] on the timeline (`from` may be mid-fade). */
  const fades = (g: GainNode, v: number, start: number, end: number, fi: number, fo: number) => {
    const lvl = (T: number) => v * Math.max(0, Math.min(1, fi > 0 ? (T - start) / fi : 1, fo > 0 ? (end - T) / fo : 1));
    g.gain.setValueAtTime(lvl(Math.max(from, start)), Math.max(at, toCtx(start)));
    if (fi > 0 && from < start + fi) g.gain.linearRampToValueAtTime(lvl(start + fi), toCtx(start + fi));
    if (fo > 0 && from < end) {
      if (from < end - fo) g.gain.setValueAtTime(lvl(end - fo), toCtx(end - fo));
      g.gain.linearRampToValueAtTime(0, toCtx(end));
    }
  };

  if (p.voiceover && want('voice')) {
    const g = ctx.createGain();
    g.gain.value = p.voiceover.volume;
    g.connect(master);
    // Voice enhance (EQ / de-ess / compression / room / loudness) sits between the voice and its volume.
    const input = voiceChain(ctx, p.voiceover.fx, g);
    play(bufs.assets.get(p.voiceover.assetId), p.voiceStart ?? 0, Infinity, 0, input);
  }

  const speech = speechRanges(p, bufs);
  for (const m of want('music') ? p.music : []) {
    const g = ctx.createGain();
    // Volume curve (points drawn by the user) sits after ducking / fades.
    const curve = ctx.createGain();
    g.connect(curve).connect(master);
    if (m.curve?.length) {
      const pts = [...m.curve].sort((a, b) => a.t - b.t);
      const valAt = (t: number) => {
        if (t <= pts[0].t) return pts[0].v;
        for (let k = 1; k < pts.length; k++) if (t <= pts[k].t) return pts[k - 1].v + ((pts[k].v - pts[k - 1].v) * (t - pts[k - 1].t)) / ((pts[k].t - pts[k - 1].t) || 1);
        return pts[pts.length - 1].v;
      };
      curve.gain.setValueAtTime(valAt(from), at);
      for (const pt of pts) if (pt.t > from && pt.t <= until) curve.gain.linearRampToValueAtTime(pt.v, toCtx(pt.t));
    }
    const set = (T: number, v: number) => {
      const c = toCtx(T);
      if (c >= at) g.gain.linearRampToValueAtTime(v, c);
    };
    const v = m.volume;
    const end = m.start + m.duration;
    g.gain.setValueAtTime(m.fadeIn > 0 && from < m.start + m.fadeIn ? v * Math.max(0, (from - m.start) / m.fadeIn) : v, at);
    if (m.fadeIn > 0) set(m.start + m.fadeIn, v);
    if (m.duck) {
      const duck = v * (m.duckDepth ?? 0.35);
      const attack = m.duckAttack ?? 0.25, release = m.duckRelease ?? 0.4;
      for (const [s, e] of speech) {
        if (e < m.start || s > end) continue;
        set(Math.max(m.start + m.fadeIn, s - attack), v);
        set(s, duck);
        set(e, duck);
        set(e + release, v);
      }
    }
    if (m.fadeOut > 0) {
      set(end - m.fadeOut, v);
      set(end, 0);
    }
    play(bufs.assets.get(m.assetId), m.start, m.duration, m.trimIn, g, undefined, m.rate ?? 1);
  }

  (want('clips') ? p.clips : []).forEach((c, i) => {
    const buf = bufs.assets.get(c.assetId);
    if (!buf || c.volume <= 0) return;
    const g = ctx.createGain();
    g.connect(master);
    const start = i === 0 ? 0 : c.start;
    const rate = c.speed ?? 1;
    const srcEnd = Math.min(c.trimOut ?? Infinity, buf.duration);
    const dur = c.loop ? clipEnd(p, i) - start : Math.min(clipEnd(p, i) - start, (srcEnd - c.trimIn) / rate);
    fades(g, c.volume, start, start + dur, c.fadeIn ?? 0, c.fadeOut ?? 0);
    if (c.loop) play(buf, start, dur, c.trimIn, g, srcEnd, rate);
    else play(buf, start, dur, c.trimIn, g, undefined, rate);
  });

  for (const s of want('sfx') ? p.sfx : []) {
    const g = ctx.createGain();
    g.gain.value = s.volume;
    g.connect(master);
    const buf = bufs.sfx.get(s.sound);
    play(buf, s.start, buf?.duration ?? 0, 0, g);
  }
  return { nodes, master };
}

/** Offline-render the full mix for export. */
export async function renderMix(p: Project, sampleRate = 48000, only?: Set<Stem>) {
  const len = projectLength(p);
  const bufs = await loadBuffers(p);
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sampleRate), sampleRate);
  buildMix(ctx, p, bufs, 0, 0, len, only);
  return ctx.startRendering();
}
