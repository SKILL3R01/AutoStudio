/**
 * Style music (v5.4), made by the app — no licences. `composeMusic` (pure) turns the story's scenes into note events
 * per style (tempo, chords, instruments) with energy that follows the story: calm while explaining, a short stop
 * before a reveal and a hit on it, a lift at the end. `renderMusic` synthesises the events (OfflineAudioContext).
 */

export type Inst = 'pad' | 'pluck' | 'marimba' | 'piano' | 'bass' | 'brass' | 'glock' | 'drone' | 'kick' | 'hat' | 'clap' | 'hit';
export interface NoteEv { t: number; dur: number; f: number; inst: Inst; vel: number }
export interface MusicStyle { id: string; name: string; mood: string; bpm: number; root: number; minor: boolean; chords: number[]; lead: Inst; arp: Inst; bass: Inst; drums: boolean }

/** Scale degrees → semitones. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
export const MUSIC_STYLES: Record<string, MusicStyle> = {
  documentary: { id: 'documentary', name: 'Curious pizzicato', mood: 'plucked strings and a warm drone, thoughtful', bpm: 84, root: 50, minor: true, chords: [0, 5, 2, 6], lead: 'piano', arp: 'pluck', bass: 'drone', drums: false },
  explainer: { id: 'explainer', name: 'Bright marimba', mood: 'marimba, soft pad and a light beat, upbeat', bpm: 104, root: 48, minor: false, chords: [0, 4, 5, 3], lead: 'glock', arp: 'marimba', bass: 'bass', drums: true },
  stick: { id: 'stick', name: 'Cinematic piano', mood: 'piano, strings pad and low hits, emotional', bpm: 72, root: 45, minor: true, chords: [0, 5, 2, 6], lead: 'piano', arp: 'piano', bass: 'drone', drums: false },
  cartoon: { id: 'cartoon', name: 'Playful bounce', mood: 'bouncy bass, glockenspiel and brass stabs, fun', bpm: 120, root: 53, minor: false, chords: [0, 3, 4, 0], lead: 'brass', arp: 'glock', bass: 'bass', drums: true },
};
export const musicStyleOf = (styleId?: string, base?: string) => MUSIC_STYLES[styleId ?? ''] ?? MUSIC_STYLES[base ?? ''] ?? MUSIC_STYLES.explainer;

/** A story moment: its time, and how it should feel. */
export interface MusicScene { start: number; end: number; kind: 'calm' | 'build' | 'reveal' | 'outro' | 'intro' }
/** Scene kind from its design: big numbers / ideas / shocks are reveals, lists and desks are calm, the last is the outro. */
export function sceneKind(templateId: string, i: number, n: number): MusicScene['kind'] {
  if (i === n - 1 && n > 2) return 'outro';
  if (i === 0) return 'intro';
  if (/shock|big-number|idea|slam|stamp|celebrate|counter|reveal|number|stat|percent/.test(templateId)) return 'reveal';
  if (/list|checklist|desk|document|steps|timeline|think|alone|note|quote/.test(templateId)) return 'calm';
  return 'build';
}
const ENERGY: Record<MusicScene['kind'], number> = { intro: 0.55, calm: 0.4, build: 0.7, reveal: 0.9, outro: 1 };

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** Chord tones (midi) of degree d in the style's key. */
function chord(st: MusicStyle, d: number) {
  const sc = st.minor ? MINOR : MAJOR;
  return [0, 2, 4].map((k) => st.root + 12 + sc[(d + k) % 7] + 12 * Math.floor((d + k) / 7));
}

export function composeMusic(st: MusicStyle, scenes: MusicScene[], length: number): NoteEv[] {
  const beat = 60 / st.bpm, bar = beat * 4, ev: NoteEv[] = [];
  const kindAt = (t: number) => scenes.find((s) => t >= s.start && t < s.end)?.kind ?? 'build';
  // A reveal is preceded by 0.35 s of silence (the "stop") and lands with a hit.
  const stops = scenes.filter((s, i) => i > 0 && s.kind === 'reveal').map((s) => s.start);
  const silent = (t: number) => stops.some((s) => t >= s - 0.35 && t < s);
  const push = (e: NoteEv) => {
    const t = Math.round(e.t * 1000) / 1000;
    if (t >= length || silent(t)) return;
    ev.push({ ...e, t, dur: Math.min(e.dur, length - t) });
  };
  for (let b = 0, t0 = 0; t0 < length; b++, t0 += bar) {
    const ch = chord(st, st.chords[b % st.chords.length]), e = ENERGY[kindAt(t0 + bar / 2)];
    // Pad (always), bass / drone, arpeggio from mid energy, drums and lead when it is lively.
    for (const m of ch) push({ t: t0, dur: bar, f: hz(m), inst: st.id === 'cartoon' ? 'pluck' : 'pad', vel: 0.12 + e * 0.06 });
    if (st.bass === 'drone') push({ t: t0, dur: bar, f: hz(ch[0] - 24), inst: 'drone', vel: 0.18 });
    else for (let k = 0; k < 4; k++) if (e > 0.45 || k === 0) push({ t: t0 + k * beat, dur: beat * (st.id === 'cartoon' ? 0.35 : 0.8), f: hz(ch[k % 2 ? 2 : 0] - 24), inst: 'bass', vel: 0.32 });
    if (e >= 0.5) {
      const step = e >= 0.85 ? beat / 2 : beat, order = [0, 1, 2, 1, 0, 2, 1, 2];
      for (let k = 0, i = 0; k < bar - 1e-6; k += step, i++) push({ t: t0 + k, dur: step * 1.6, f: hz(ch[order[i % 8]] + (i % 8 >= 4 ? 12 : 0)), inst: st.arp, vel: 0.22 + e * 0.1 });
    }
    if (st.drums && e >= 0.65)
      for (let k = 0; k < 4; k++) {
        push({ t: t0 + k * beat, dur: 0.25, f: 50, inst: 'kick', vel: k % 2 ? 0.25 : 0.4 });
        push({ t: t0 + k * beat + beat / 2, dur: 0.08, f: 8000, inst: 'hat', vel: 0.12 });
        if (k % 2 && e >= 0.85) push({ t: t0 + k * beat, dur: 0.2, f: 1200, inst: 'clap', vel: 0.22 });
      }
    if (e >= 0.95 && b % 2 === 0) push({ t: t0, dur: beat * 2, f: hz(ch[2] + 12), inst: st.lead, vel: 0.2 });
  }
  for (const s of stops) if (s < length) ev.push({ t: s, dur: 1.2, f: hz(st.root - 12), inst: 'hit', vel: 0.5 });
  // Ending: a final chord ringing out.
  const last = chord(st, 0);
  for (const m of last) ev.push({ t: Math.max(0, length - 2.5), dur: 2.4, f: hz(m), inst: st.lead === 'brass' ? 'glock' : 'piano', vel: 0.2 });
  return ev.sort((a, b) => a.t - b.t);
}

/** Volume curve for the music clip: dips to almost nothing in the stops before reveals, fades out at the end. */
export function musicCurve(scenes: MusicScene[], length: number) {
  const pts: { t: number; v: number }[] = [{ t: 0, v: 1 }];
  for (const s of scenes.filter((x, i) => i > 0 && x.kind === 'reveal')) pts.push({ t: Math.max(0, s.start - 0.45), v: 1 }, { t: s.start - 0.3, v: 0.08 }, { t: s.start, v: 0.08 }, { t: s.start + 0.05, v: 1 });
  pts.push({ t: Math.max(0, length - 1.5), v: 1 }, { t: length, v: 0 });
  return pts.filter((p, i, a) => i === 0 || p.t > a[i - 1].t);
}

/* ---------- synthesis ---------- */
const SR = 44100;
function voice(c: OfflineAudioContext, out: AudioNode, e: NoteEv, noise: AudioBuffer) {
  const g = c.createGain(), t = e.t, end = t + e.dur;
  const osc = (type: OscillatorType, f: number, detune = 0) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.start(t);
    o.stop(end + 0.6);
    return o;
  };
  const decay = (a: number, d: number, v = e.vel) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  };
  const lp = (f: number) => {
    const b = c.createBiquadFilter();
    b.type = 'lowpass';
    b.frequency.value = f;
    return b;
  };
  switch (e.inst) {
    case 'pad': {
      const f = lp(900);
      osc('sawtooth', e.f, -8).connect(f);
      osc('sawtooth', e.f, 8).connect(f);
      f.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(e.vel * 0.5, t + Math.min(0.8, e.dur / 3));
      g.gain.setValueAtTime(e.vel * 0.5, Math.max(t + 0.8, end - 0.3));
      g.gain.linearRampToValueAtTime(0.0001, end + 0.4);
      break;
    }
    case 'drone': {
      const f = lp(400);
      osc('sine', e.f).connect(f);
      osc('triangle', e.f * 1.5).connect(f);
      f.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(e.vel, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, end + 0.3);
      break;
    }
    case 'pluck': { const f = lp(2200); osc('triangle', e.f).connect(f); f.connect(g); decay(0.005, Math.min(0.5, e.dur + 0.2)); break; }
    case 'marimba': osc('sine', e.f).connect(g); osc('sine', e.f * 4).connect(g); decay(0.004, 0.45); break;
    case 'piano': { const f = lp(3000); osc('triangle', e.f).connect(f); osc('sine', e.f * 2).connect(f); f.connect(g); decay(0.006, Math.min(2.2, e.dur + 0.8)); break; }
    case 'glock': osc('sine', e.f * 2).connect(g); osc('sine', e.f * 5.4).connect(g); decay(0.003, 0.9, e.vel * 0.7); break;
    case 'bass': { const f = lp(500); osc('sine', e.f).connect(f); osc('square', e.f).connect(lp(300)).connect(f); f.connect(g); decay(0.01, e.dur + 0.1); break; }
    case 'brass': { const f = lp(1400); osc('sawtooth', e.f).connect(f); osc('sawtooth', e.f, 6).connect(f); f.connect(g); decay(0.04, e.dur + 0.2); break; }
    case 'kick': { const o = osc('sine', 120); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2); o.connect(g); decay(0.003, 0.3); break; }
    case 'hit': { const o = osc('sine', 80); o.frequency.exponentialRampToValueAtTime(30, t + 1); o.connect(g); decay(0.004, 1.2); break; }
    case 'hat': case 'clap': {
      const n = c.createBufferSource();
      n.buffer = noise;
      n.start(t);
      n.stop(t + 0.3);
      const f = c.createBiquadFilter();
      f.type = e.inst === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = e.f;
      n.connect(f).connect(g);
      decay(0.002, e.inst === 'hat' ? 0.06 : 0.18);
      break;
    }
  }
  g.connect(out);
}

/** Render the events in chunks of 60 s (keeps the node count per context small), stereo, with a little room echo. */
export async function renderMusic(ev: NoteEv[], length: number, onProgress?: (k: number) => void): Promise<AudioBuffer> {
  const total = Math.ceil(length * SR), outBuf = new AudioBuffer({ numberOfChannels: 2, length: total, sampleRate: SR });
  const CH = 60;
  for (let c0 = 0; c0 < length; c0 += CH) {
    const c1 = Math.min(length, c0 + CH), tail = 3;
    const ctx = new OfflineAudioContext(2, Math.ceil((c1 - c0 + tail) * SR), SR);
    const noise = ctx.createBuffer(1, SR, SR);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.23;
    fb.gain.value = 0.25;
    wet.gain.value = 0.18;
    master.connect(ctx.destination);
    master.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(ctx.destination);
    for (const e of ev) if (e.t >= c0 && e.t < c1) voice(ctx, master, { ...e, t: e.t - c0 }, noise);
    const r = await ctx.startRendering();
    // Mix into the output; the tail (notes ringing past the chunk) overlaps the next chunk.
    for (let ch = 0; ch < 2; ch++) {
      const src = r.getChannelData(ch), dst = outBuf.getChannelData(ch), off = Math.round(c0 * SR);
      for (let i = 0; i < src.length && off + i < total; i++) dst[off + i] += src[i];
    }
    onProgress?.(c1 / length);
  }
  return outBuf;
}
