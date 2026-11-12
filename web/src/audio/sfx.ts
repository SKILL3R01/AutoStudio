import { media } from '../render/media';

export const SFX = ['whoosh', 'swoosh', 'pop', 'ding', 'click', 'boom', 'impact', 'riser', 'glitch', 'typing', 'shutter', 'heartbeat', 'chime', 'bass drop', 'pen', 'paper', 'typewriter', 'boing', 'blip', 'steps', 'tada', 'slide-whistle', 'thud'] as const;

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
  // v5.4 style sounds.
  pen: [0.5, (c) => {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2400, 0);
    f.frequency.linearRampToValueAtTime(3600, 0.45);
    noise(c, 0.5).connect(f);
    const g = c.createGain();
    g.gain.setValueAtTime(0, 0);
    for (let i = 0; i < 6; i++) (g.gain.linearRampToValueAtTime(0.55, i * 0.08 + 0.03), g.gain.linearRampToValueAtTime(0.15, i * 0.08 + 0.07));
    g.gain.linearRampToValueAtTime(0, 0.5);
    f.connect(g).connect(c.destination);
  }],
  paper: [0.6, (c) => {
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    noise(c, 0.6).connect(f);
    const g = c.createGain();
    g.gain.setValueAtTime(0, 0);
    for (let i = 0; i < 10; i++) g.gain.setValueAtTime(0.15 + ((i * 7) % 5) * 0.1, i * 0.05);
    g.gain.linearRampToValueAtTime(0, 0.6);
    f.connect(g).connect(c.destination);
  }],
  typewriter: [0.9, (c) => {
    for (let i = 0; i < 6; i++) {
      const at = i * 0.12 + ((i * 13) % 3) * 0.01;
      env(c, noise(c, 0.04, at), at + 0.002, 0.7, at + 0.035).connect(c.destination);
      env(c, tone(c, 'square', 180, 120, 0.03, at), at + 0.002, 0.15, at + 0.03).connect(c.destination);
    }
    env(c, tone(c, 'sine', 2600, 2590, 0.5, 0.75), 0.76, 0.25, 0.9).connect(c.destination);
  }],
  boing: [0.7, (c) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, 0);
    for (let i = 0; i < 7; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 160 : 320 - i * 20, 0.05 + i * 0.08);
    o.start(0);
    o.stop(0.7);
    env(c, o, 0.01, 0.7, 0.7).connect(c.destination);
  }],
  blip: [0.15, (c) => env(c, tone(c, 'sine', 600, 1400, 0.1), 0.004, 0.6, 0.14).connect(c.destination)],
  steps: [1.0, (c) => [0, 0.27, 0.54, 0.81].forEach((at) => {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    noise(c, 0.08, at).connect(f);
    env(c, f, at + 0.005, 0.8, at + 0.08).connect(c.destination);
    env(c, tone(c, 'sine', 110, 60, 0.08, at), at + 0.004, 0.5, at + 0.08).connect(c.destination);
  })],
  tada: [1.6, (c) => [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([f, at]) => {
    env(c, tone(c, 'sawtooth', f, f, 1.2, at), at + 0.01, 0.12, at + 1.2).connect(c.destination);
    env(c, tone(c, 'triangle', f * 2, f * 2, 1.2, at), at + 0.01, 0.12, at + 1.2).connect(c.destination);
  })],
  'slide-whistle': [0.7, (c) => {
    const o = tone(c, 'sine', 500, 1800, 0.6);
    env(c, o, 0.05, 0.4, 0.65).connect(c.destination);
  }],
  thud: [1.2, (c) => {
    env(c, tone(c, 'sine', 70, 28, 1.1), 0.005, 1, 1.15).connect(c.destination);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180;
    noise(c, 0.4).connect(f);
    env(c, f, 0.003, 0.6, 0.4).connect(c.destination);
  }],
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
