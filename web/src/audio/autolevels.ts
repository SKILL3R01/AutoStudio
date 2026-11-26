/**
 * Auto levels (v5.7) — the same rules as the kit's mix.py: music at exactly 50 % of the voice's gated RMS (−6 dB),
 * SFX at 50 % or less with peaks capped at 0.7 × the voice peak, no ducking / compression; then ONE linear gain on the
 * whole mix to about −14 LUFS and a −1 dBFS peak limiter. Pure functions on Float32Arrays (mono or per channel).
 */
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

/** mix.py's gated RMS: 0.4 s windows, drop windows 30 dB under the loudest, then those 10 dB under the gated RMS. */
export function gatedRms(x: Float32Array, sr: number, win = 0.4): number {
  const n = Math.max(1, Math.round(win * sr)), k = Math.floor(x.length / n);
  if (!k) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }
  const r: number[] = [];
  for (let b = 0; b < k; b++) { let s = 0; for (let i = b * n; i < (b + 1) * n; i++) s += x[i] * x[i]; r.push(Math.sqrt(s / n)); }
  const top = Math.max(...r);
  let g = r.filter((v) => v > top * 10 ** (-30 / 20));
  const rms = Math.sqrt(g.reduce((a, v) => a + v * v, 0) / Math.max(1, g.length));
  g = g.filter((v) => v > rms * 10 ** (-10 / 20));
  return g.length ? Math.sqrt(g.reduce((a, v) => a + v * v, 0) / g.length) : 0;
}
const peak = (x: Float32Array) => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };
const monoOf = (chs: Float32Array[]) => { if (chs.length === 1) return chs[0]; const o = new Float32Array(chs[0].length); for (const c of chs) for (let i = 0; i < o.length; i++) o[i] += c[i] / chs.length; return o; };

/** Gains for the music and SFX stems so they sit at the locked ratio under the voice. */
export function levelLock(voice: Float32Array[], music: Float32Array[], sfx: Float32Array[], sr: number) {
  const v = monoOf(voice), rv = gatedRms(v, sr), vp = peak(v);
  const rm = music.length ? gatedRms(monoOf(music), sr) : 0, rs = sfx.length ? gatedRms(monoOf(sfx), sr) : 0;
  const gm = rv && rm ? (0.5 * rv) / rm : 1;
  let gs = rv && rs ? (0.5 * rv) / rs : 1;
  const sp = sfx.length ? peak(monoOf(sfx)) * gs : 0;
  if (vp && sp > 0.7 * vp) gs *= (0.7 * vp) / sp;
  return { gm, gs, report: { voiceDb: db(rv), musicVsVoice: rm ? db(rm * gm) - db(rv) : null, sfxVsVoice: rs ? db(rs * gs) - db(rv) : null, sfxPeakVsVoicePeak: sp ? db(sp * (gs / (rv && rs ? (0.5 * rv) / rs : 1))) - db(vp) : null } };
}

/** Integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, 75 % overlap, −70 LUFS and −10 LU gates). */
export function lufs(chs: Float32Array[], sr: number): number {
  const kw = (x: Float32Array) => {
    // pre-filter (high shelf) + RLB high-pass, coefficients for 48 kHz (close enough at 44.1 kHz)
    const st = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
    let y = x;
    for (const [b0, b1, b2, a1, a2] of st) {
      const o = new Float32Array(y.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < y.length; i++) { const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v; }
      y = o;
    }
    return y;
  };
  const f = chs.map(kw), n = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), blocks: number[] = [];
  for (let s = 0; s + n <= f[0].length; s += hop) { let e = 0; for (const c of f) { let a = 0; for (let i = s; i < s + n; i++) a += c[i] * c[i]; e += a / n; } blocks.push(e); }
  const L = (e: number) => -0.691 + 10 * Math.log10(Math.max(e, 1e-12));
  let g = blocks.filter((e) => L(e) > -70);
  if (!g.length) return -70;
  const rel = L(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter((e) => L(e) > rel);
  return L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
}

/** One linear gain to the target loudness, then a look-ahead peak limiter at `ceiling` (linear). In place. */
export function master(chs: Float32Array[], sr: number, target = -14, ceiling = 0.891) {
  const I = lufs(chs, sr), gain = 10 ** ((target - I) / 20);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= gain;
  const look = Math.round(0.005 * sr), rel = Math.exp(-1 / (0.05 * sr)), len = chs[0].length;
  const need = new Float32Array(len);
  for (let i = 0; i < len; i++) { let m = 0; for (const c of chs) m = Math.max(m, Math.abs(c[i])); need[i] = m > ceiling ? ceiling / m : 1; }
  // gain envelope: the minimum over the look-ahead window, then a smooth release
  let g = 1;
  for (let i = 0; i < len; i++) {
    let want = 1; for (let j = i; j < Math.min(len, i + look); j++) if (need[j] < want) want = need[j];
    g = want < g ? want : want - (want - g) * rel;
    for (const c of chs) c[i] *= g;
  }
  return { lufsBefore: I, gainDb: 20 * Math.log10(gain) };
}
