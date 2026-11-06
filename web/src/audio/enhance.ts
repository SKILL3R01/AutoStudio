/**
 * Voice enhance: a non-destructive Web Audio chain on the voiceover, shared by preview and export.
 * High-pass → EQ (bass / presence / air) → de-esser → compressor → room (reverb) → loudness make-up gain.
 * Loudness is measured with an ITU-R BS.1770-style K-weighted, gated integrated loudness (LUFS).
 */
export interface VoiceFx {
  preset: string;
  /** dB, −6..+6 */
  bass: number;
  presence: number;
  air: number;
  /** 0..1 */
  compress: number;
  deess: number;
  room: number;
  /** Normalise to this loudness (LUFS); null = off. */
  targetLufs: number | null;
  /** Make-up gain computed by `measure` (dB). */
  gainDb: number;
  bypass?: boolean;
}

export const FX_PRESETS: Record<string, { label: string; fx: Omit<VoiceFx, 'preset' | 'targetLufs' | 'gainDb'> }> = {
  clean: { label: 'Clean (recommended)', fx: { bass: 0, presence: 2, air: 1.5, compress: 0.45, deess: 0.4, room: 0 } },
  deep: { label: 'Deep narrator', fx: { bass: 4, presence: 1, air: 0, compress: 0.6, deess: 0.4, room: 0.05 } },
  warm: { label: 'Warm', fx: { bass: 2.5, presence: -1, air: -1, compress: 0.5, deess: 0.3, room: 0.04 } },
  bright: { label: 'Bright & clear', fx: { bass: -1, presence: 3.5, air: 3, compress: 0.5, deess: 0.55, room: 0 } },
  radio: { label: 'Radio host', fx: { bass: 3, presence: 4, air: 1, compress: 0.85, deess: 0.5, room: 0 } },
  phone: { label: 'Phone call', fx: { bass: -6, presence: 5, air: -6, compress: 0.7, deess: 0, room: 0 } },
  cinema: { label: 'Cinematic room', fx: { bass: 2, presence: 1.5, air: 1, compress: 0.55, deess: 0.4, room: 0.28 } },
  off: { label: 'Off (original)', fx: { bass: 0, presence: 0, air: 0, compress: 0, deess: 0, room: 0 } },
};

export const defaultFx = (preset = 'clean'): VoiceFx => ({ preset, ...FX_PRESETS[preset].fx, targetLufs: -14, gainDb: 0 });

/** A short synthetic room impulse (decaying noise) for the "room" control. */
function impulse(ctx: BaseAudioContext, seconds = 1.2) {
  const n = Math.round(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  let seed = 7;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
  }
  return b;
}

/** Build the chain; returns its input node (connect the voice source to it). */
export function voiceChain(ctx: BaseAudioContext, fx: VoiceFx | undefined, out: AudioNode): AudioNode {
  if (!fx || fx.bypass || fx.preset === 'off' && !fx.gainDb) return out;
  const nodes: AudioNode[] = [];
  const biquad = (type: BiquadFilterType, freq: number, gain = 0, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    Object.assign(f, { type });
    f.frequency.value = freq;
    f.gain.value = gain;
    f.Q.value = q;
    nodes.push(f);
    return f;
  };
  biquad('highpass', fx.preset === 'phone' ? 300 : 80, 0, 0.7);
  if (fx.bass) biquad('lowshelf', 160, fx.bass);
  if (fx.presence) biquad('peaking', 3000, fx.presence, 0.9);
  if (fx.air) biquad('highshelf', 9000, fx.air);
  if (fx.preset === 'phone') biquad('lowpass', 3400, 0, 0.7);
  if (fx.deess > 0) biquad('peaking', 6800, -6 * fx.deess, 3);
  if (fx.compress > 0) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -12 - 18 * fx.compress;
    c.ratio.value = 1.5 + 4.5 * fx.compress;
    c.knee.value = 10;
    c.attack.value = 0.008;
    c.release.value = 0.18;
    nodes.push(c);
  }
  const makeup = ctx.createGain();
  makeup.gain.value = Math.pow(10, (fx.gainDb ?? 0) / 20);
  nodes.reduce((a, b) => (a.connect(b), b));
  const last = nodes[nodes.length - 1];
  if (fx.room > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx);
    const wet = ctx.createGain(), dry = ctx.createGain();
    wet.gain.value = fx.room * 0.6;
    dry.gain.value = 1 - fx.room * 0.25;
    last.connect(dry).connect(makeup);
    last.connect(conv).connect(wet).connect(makeup);
  } else last.connect(makeup);
  makeup.connect(out);
  return nodes[0];
}

/** Integrated loudness (LUFS) of a buffer: K-weighting, 400 ms blocks (75 % overlap), −70 LUFS + relative −10 LU gates. */
export async function measureLufs(buf: AudioBuffer): Promise<number> {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 1500;
  shelf.gain.value = 4;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 38;
  hp.Q.value = 0.5;
  src.connect(shelf).connect(hp).connect(ctx.destination);
  src.start();
  const k = await ctx.startRendering();
  const block = Math.round(0.4 * k.sampleRate), hop = Math.round(block / 4);
  const loud: number[] = [];
  for (let s = 0; s + block <= k.length; s += hop) {
    let z = 0;
    for (let c = 0; c < k.numberOfChannels; c++) {
      const d = k.getChannelData(c);
      let sum = 0;
      for (let i = s; i < s + block; i++) sum += d[i] * d[i];
      z += sum / block;
    }
    loud.push(z);
  }
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z || 1e-12);
  const abs = loud.filter((z) => lufs(z) > -70);
  if (!abs.length) return -70;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((z) => lufs(z) > rel);
  return lufs(mean(gated.length ? gated : abs));
}

/** Render the voice through the chain (without make-up) and return the make-up gain that reaches the target. */
export async function makeupFor(buf: AudioBuffer, fx: VoiceFx): Promise<number> {
  if (fx.targetLufs === null) return 0;
  const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(voiceChain(ctx, { ...fx, gainDb: 0, bypass: false }, ctx.destination));
  src.start();
  const processed = await ctx.startRendering();
  const now = await measureLufs(processed);
  return Math.max(-12, Math.min(18, fx.targetLufs - now));
}
