/** Loudness analysis of a voice track: speech ranges (for ducking) and pauses (for silence removal). */

export interface Levels {
  /** Seconds per frame. */
  hop: number;
  /** RMS level per frame in dBFS. */
  db: Float32Array;
  /** Estimated noise floor in dBFS (10th percentile). */
  floor: number;
  duration: number;
}

export interface Range {
  start: number;
  end: number;
}

const cache = new WeakMap<AudioBuffer, Levels>();

/** RMS loudness every 10 ms, downmixed. Cached per buffer. */
export function analyzeLevels(buf: AudioBuffer, hop = 0.01): Levels {
  const hit = cache.get(buf);
  if (hit) return hit;
  const n = Math.max(1, Math.round(buf.sampleRate * hop));
  const frames = Math.floor(buf.length / n);
  const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * n, e = i + n; i < e; i += 2) for (const d of ch) s += d[i] * d[i];
    const rms = Math.sqrt(s / ((n / 2) * ch.length));
    db[f] = 20 * Math.log10(rms + 1e-9);
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : -90;
  const lv = { hop, db, floor, duration: buf.duration };
  cache.set(buf, lv);
  return lv;
}

export interface SilenceOptions {
  /** Frames quieter than this (dBFS) count as silence. `auto` = noise floor + 8 dB (clamped). */
  threshold: number | 'auto';
  /** Pauses shorter than this (s) are ignored. */
  minPause: number;
  /** Silence kept on each side of a removed pause (s). */
  padding: number;
}

export const thresholdFor = (lv: Levels, t: SilenceOptions['threshold']) => (t === 'auto' ? Math.min(-30, Math.max(-60, lv.floor + 8)) : t);

/** Pauses longer than `minPause`, shrunk by `padding` on both sides (so cuts keep a breath). */
export function detectSilences(lv: Levels, o: SilenceOptions): Range[] {
  const th = thresholdFor(lv, o.threshold);
  const out: Range[] = [];
  let runStart = -1;
  const close = (endFrame: number) => {
    const s = runStart * lv.hop, e = endFrame * lv.hop;
    if (e - s >= o.minPause) {
      const start = s === 0 ? 0 : s + o.padding;
      const end = endFrame >= lv.db.length ? lv.duration : e - o.padding;
      if (end - start > 0.05) out.push({ start, end });
    }
    runStart = -1;
  };
  for (let f = 0; f < lv.db.length; f++) {
    if (lv.db[f] < th) {
      if (runStart < 0) runStart = f;
    } else if (runStart >= 0) close(f);
  }
  if (runStart >= 0) close(lv.db.length);
  return out;
}

/** Speech = everything that is not a pause of at least `minPause` (used to duck music under the voice). */
export function speechRangesFromLevels(lv: Levels, minPause = 0.35): Range[] {
  const pauses = detectSilences(lv, { threshold: 'auto', minPause, padding: 0 });
  const out: Range[] = [];
  let t = 0;
  for (const p of pauses) {
    if (p.start - t > 0.05) out.push({ start: t, end: p.start });
    t = p.end;
  }
  if (lv.duration - t > 0.05) out.push({ start: t, end: lv.duration });
  return out;
}

/**
 * Map a time on the old timeline to the new one after `cuts` (sorted, non-overlapping) are removed.
 * Times inside a cut snap to where the cut was.
 */
export function remapTime(t: number, cuts: Range[]): number {
  let shift = 0;
  for (const c of cuts) {
    if (t <= c.start) break;
    if (t < c.end) return c.start - shift;
    shift += c.end - c.start;
  }
  return t - shift;
}

/** Copy the kept parts of `buf` into a new buffer (with 8 ms fades at each join to avoid clicks). */
export function cutBuffer(buf: AudioBuffer, cuts: Range[]): AudioBuffer {
  const sr = buf.sampleRate;
  const keep: [number, number][] = [];
  let t = 0;
  for (const c of cuts) {
    if (c.start > t) keep.push([t, c.start]);
    t = c.end;
  }
  if (t < buf.duration) keep.push([t, buf.duration]);
  const lens = keep.map(([a, b]) => Math.max(0, Math.round(b * sr) - Math.round(a * sr)));
  const total = Math.max(1, lens.reduce((x, y) => x + y, 0));
  const out = new AudioBuffer({ length: total, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  const fade = Math.round(sr * 0.008);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    let o = 0;
    keep.forEach(([a], k) => {
      const s0 = Math.round(a * sr), len = lens[k];
      dst.set(src.subarray(s0, s0 + len), o);
      if (k > 0) for (let i = 0; i < fade && i < len; i++) dst[o + i] *= i / fade;
      if (k < keep.length - 1) for (let i = 0; i < fade && i < len; i++) dst[o + len - 1 - i] *= i / fade;
      o += len;
    });
  }
  return out;
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0, o = 44; i < len; i++) for (let c = 0; c < ch; c++, o += 2) data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 0x7fff, true);
  return new Blob([data.buffer], { type: 'audio/wav' });
}
