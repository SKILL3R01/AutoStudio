import type { Project } from '../types';
import { media } from '../render/media';

const cache = new Map<string, Promise<number[]>>();

/** Beats of the first music bed (or the voiceover when there is no music), cached per asset. */
export function beatsFor(p: Project): Promise<number[]> {
  const m = p.music[0];
  const id = m?.assetId ?? p.voiceover?.assetId;
  if (!id || !p.clips.some((c) => c.regions?.some((r) => r.trigger === 'beats'))) return Promise.resolve([]);
  if (!cache.has(id)) cache.set(id, media.audioBuffer(id).then((b) => (b ? detectBeats(b) : [])));
  const offset = m ? m.start - m.trimIn : 0;
  return cache.get(id)!.then((bs) => bs.map((b) => b + offset).filter((b) => b >= 0));
}

/**
 * Simple onset detector: spectral-flux-like energy rise on a downmixed envelope.
 * Returns onset times (seconds), at least `minGap` apart.
 */
export function detectBeats(buf: AudioBuffer, sensitivity = 1.4, minGap = 0.25): number[] {
  const sr = buf.sampleRate;
  const hop = Math.round(sr * 0.01);
  const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const frames = Math.floor(buf.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop, e = i + hop; i < e; i += 2) for (const d of ch) s += d[i] * d[i];
    env[f] = Math.sqrt(s / (hop / 2));
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, env[f] - env[f - 1]);
  const out: number[] = [];
  const W = 50; // 0.5 s adaptive threshold window
  let sum = 0;
  for (let f = 0; f < frames; f++) {
    sum += flux[f] - (f >= W ? flux[f - W] : 0);
    const mean = sum / Math.min(W, f + 1);
    const t = f * 0.01;
    if (flux[f] > mean * sensitivity + 0.002 && flux[f] >= flux[f - 1] && flux[f] >= (flux[f + 1] ?? 0) && (!out.length || t - out[out.length - 1] >= minGap)) out.push(t);
  }
  return out;
}
