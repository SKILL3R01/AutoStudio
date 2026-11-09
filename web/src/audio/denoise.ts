/** Background-noise reduction with RNNoise (BSD, compiled to WebAssembly) — runs on this PC, offline. */
import { Rnnoise } from '@shiguredo/rnnoise-wasm';

let lib: Promise<Rnnoise> | null = null;
const SR = 48000;
/** RNNoise output lags its input by two frames (measured: 960 samples at 48 kHz). */
const DELAY = 960;

/**
 * Return a denoised copy of `buf` (mono, 48 kHz). `strength` 0..1 blends the cleaned signal with the original
 * (1 = fully cleaned). `onProgress` gets 0..1.
 */
export async function denoise(buf: AudioBuffer, strength = 1, onProgress?: (f: number) => void): Promise<AudioBuffer> {
  const rn = await (lib ??= Rnnoise.load());
  // Resample / downmix to 48 kHz mono — RNNoise's native format.
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * SR)), SR);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const mono = await ctx.startRendering();
  const x = mono.getChannelData(0);
  const total = x.length + DELAY;
  const out = new Float32Array(x.length);
  const st = rn.createDenoiseState();
  const n = rn.frameSize;
  const frame = new Float32Array(n);
  try {
    // Feed DELAY extra samples of silence so the tail comes out, then write each output DELAY samples earlier.
    for (let i = 0; i < total; i += n) {
      frame.fill(0);
      if (i < x.length) frame.set(x.subarray(i, Math.min(x.length, i + n)));
      for (let k = 0; k < n; k++) frame[k] *= 32768;
      st.processFrame(frame);
      for (let k = 0; k < n; k++) {
        const j = i + k - DELAY;
        if (j >= 0 && j < x.length) out[j] = (frame[k] / 32768) * strength + x[j] * (1 - strength);
      }
      if (onProgress && (i / n) % 500 === 0) {
        onProgress(i / total);
        await new Promise((r) => setTimeout(r));
      }
    }
  } finally {
    st.destroy();
  }
  const res = new AudioBuffer({ length: out.length, numberOfChannels: 1, sampleRate: SR });
  res.copyToChannel(out, 0);
  onProgress?.(1);
  return res;
}
