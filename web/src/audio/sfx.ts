import { media } from '../render/media';

export const SFX = ['whoosh', 'swoosh', 'pop', 'ding', 'click', 'boom', 'impact', 'riser', 'glitch', 'typing', 'shutter', 'heartbeat', 'chime', 'bass drop'] as const;

const SR = 44100;
const cache = new Map<string, Promise<AudioBuffer>>();

function noiseBuffer(ctx: BaseAudioContext, dur: number) {
  const b = ctx.createBuffer(1, Math.ceil(dur * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < d.length; i++) {
    s = (s * 16807) % 2147483647;
    d[i] = (s / 2147483647) * 2 - 1;
  }
  return b;
}

function env(ctx: BaseAudioContext, node: AudioNode, a: number, peak: number, dur: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(peak, a);
  g.gain.exponentialRampToValueAtTime(0.0001, dur);
  node.connect(g);
  return g;
}

function tone(ctx: BaseAudioContext, type: OscillatorType, f0: number, f1: number, dur: number, at = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  o.start(at);
  o.stop(at + dur);
  return o;
}

function noise(ctx: BaseAudioContext, dur: number, at = 0) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  n.start(at);
  return n;
}

const RECIPES: Record<string, [number, (c: OfflineAudioContext) => void]> = {
  whoosh: [0.8, (c) => {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, 0);
    f.frequency.exponentialRampToValueAtTime(3500, 0.45);
    f.frequency.exponentialRampToValueAtTime(600, 0.8);
    noise(c, 0.8).connect(f);
    env(c, f, 0.35, 0.9, 0.8).connect(c.destination);
  }],
  swoosh: [0.45, (c) => {
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(6000, 0);
    f.frequency.exponentialRampToValueAtTime(400, 0.4);
    noise(c, 0.45).connect(f);
    env(c, f, 0.08, 0.7, 0.45).connect(c.destination);
  }],
  pop: [0.18, (c) => env(c, tone(c, 'sine', 900, 140, 0.15), 0.005, 0.9, 0.17).connect(c.destination)],
  ding: [1.6, (c) => {
    env(c, tone(c, 'sine', 1320, 1318, 1.6), 0.005, 0.6, 1.6).connect(c.destination);
    env(c, tone(c, 'sine', 2640, 2635, 1.0), 0.005, 0.2, 1.0).connect(c.destination);
  }],
  chime: [2, (c) => [1047, 1319, 1568].forEach((f, i) => env(c, tone(c, 'triangle', f, f, 1.8 - i * 0.1, i * 0.08), i * 0.08 + 0.01, 0.35, 2).connect(c.destination))],
  click: [0.05, (c) => env(c, noise(c, 0.05), 0.001, 0.8, 0.04).connect(c.destination)],
  boom: [1.8, (c) => {
    env(c, tone(c, 'sine', 90, 30, 1.6), 0.01, 1, 1.7).connect(c.destination);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    noise(c, 1.2).connect(f);
    env(c, f, 0.01, 0.7, 1.2).connect(c.destination);
  }],
  impact: [0.9, (c) => {
    env(c, tone(c, 'sine', 160, 40, 0.5), 0.003, 1, 0.6).connect(c.destination);
    env(c, noise(c, 0.3), 0.002, 0.6, 0.25).connect(c.destination);
  }],
  'bass drop': [2.2, (c) => env(c, tone(c, 'sawtooth', 220, 35, 2), 0.02, 0.6, 2.2).connect(c.destination)],
  riser: [2.2, (c) => {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, 0);
    f.frequency.exponentialRampToValueAtTime(8000, 2.1);
    noise(c, 2.2).connect(f);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.exponentialRampToValueAtTime(0.9, 2.05);
    g.gain.linearRampToValueAtTime(0, 2.2);
    f.connect(g).connect(c.destination);
    const o = tone(c, 'sawtooth', 110, 880, 2.1);
    const og = c.createGain();
    og.gain.setValueAtTime(0.001, 0);
    og.gain.exponentialRampToValueAtTime(0.15, 2.05);
    og.gain.linearRampToValueAtTime(0, 2.2);
    o.connect(og).connect(c.destination);
  }],
  glitch: [0.4, (c) => {
    for (let i = 0; i < 8; i++) {
      const at = i * 0.045;
      env(c, tone(c, 'square', 200 + ((i * 397) % 1800), 120 + ((i * 211) % 900), 0.04, at), at + 0.002, 0.25, at + 0.04).connect(c.destination);
    }
  }],
  typing: [1.0, (c) => {
    for (let i = 0; i < 9; i++) {
      const at = i * 0.1 + ((i * 37) % 5) * 0.008;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      noise(c, 0.03, at).connect(f);
      const g = c.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.setValueAtTime(0.6, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      f.connect(g).connect(c.destination);
    }
  }],
  shutter: [0.3, (c) => {
    [0, 0.12].forEach((at) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.setValueAtTime(0.8, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
      noise(c, 0.08, at).connect(g).connect(c.destination);
    });
  }],
  heartbeat: [1.0, (c) => [0, 0.25].forEach((at, i) => {
    const o = tone(c, 'sine', 70, 40, 0.18, at);
    const g = c.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(i ? 0.6 : 1, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    o.connect(g).connect(c.destination);
  })],
};

/** Returns a decoded buffer for a built-in synth (`whoosh`) or an uploaded sound (`asset:<id>`). */
export function sfxBuffer(name: string): Promise<AudioBuffer | undefined> {
  if (name.startsWith('asset:')) return media.audioBuffer(name.slice(6));
  if (!cache.has(name)) {
    const [dur, build] = RECIPES[name] ?? RECIPES.pop;
    const c = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
    build(c);
    cache.set(name, c.startRendering());
  }
  return cache.get(name)!;
}
