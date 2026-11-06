/**
 * Speech-friendly pace and pitch changes (WSOLA time-stretch). Pace changes duration without changing pitch;
 * pitch = time-stretch by the pitch ratio, then resample back to the original duration.
 */
const hann = (n: number) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));

/** Stretch one channel: `rate` > 1 = faster / shorter. */
export function wsola(x: Float32Array, rate: number, sr: number): Float32Array {
  if (Math.abs(rate - 1) < 1e-3) return x.slice();
  const N = Math.round(sr * 0.04), Hs = N >> 1, tol = Math.round(sr * 0.012);
  const win = hann(N);
  const outLen = Math.ceil(x.length / rate) + N;
  const y = new Float32Array(outLen), norm = new Float32Array(outLen);
  let prev = 0;
  for (let k = 0, outPos = 0; ; k++, outPos += Hs) {
    const target = Math.round(k * Hs * rate);
    if (target + N + tol >= x.length) break;
    let best = target;
    if (k > 0) {
      // Pick the offset whose start best continues the previous frame (max cross-correlation).
      let bestC = -Infinity;
      const nat = prev + Hs;
      for (let d = -tol; d <= tol; d += 2) {
        const s = target + d;
        if (s < 0) continue;
        let c = 0;
        for (let i = 0; i < N; i += 4) c += x[s + i] * x[nat + i];
        if (c > bestC) (bestC = c), (best = s);
      }
    }
    for (let i = 0; i < N; i++) {
      y[outPos + i] += x[best + i] * win[i];
      norm[outPos + i] += win[i];
    }
    prev = best;
  }
  const len = Math.round(x.length / rate);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = norm[i] > 1e-3 ? y[i] / norm[i] : 0;
  return out;
}

/** Pace (0.85–1.15×) and pitch (± semitones) of a buffer; returns a new buffer. */
export async function paceAndPitch(buf: AudioBuffer, pace: number, semitones: number): Promise<AudioBuffer> {
  const ratio = Math.pow(2, semitones / 12);
  const sr = buf.sampleRate;
  // Stretch so that after resampling by `ratio` we end up `pace`× faster.
  const stretch = pace / ratio;
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => wsola(buf.getChannelData(c), stretch, sr));
  const mid = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: sr });
  channels.forEach((d, c) => mid.copyToChannel(d as Float32Array<ArrayBuffer>, c));
  if (Math.abs(ratio - 1) < 1e-3) return mid;
  const ctx = new OfflineAudioContext(channels.length, Math.ceil(mid.length / ratio), sr);
  const src = ctx.createBufferSource();
  src.buffer = mid;
  src.playbackRate.value = ratio;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
