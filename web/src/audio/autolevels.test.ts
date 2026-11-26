import { describe, expect, it } from 'vitest';
import { gatedRms, levelLock, lufs, master } from './autolevels';
const SR = 8000;
const tone = (f: number, a: number, s = 4) => Float32Array.from({ length: SR * s }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / SR));
const db = (x: number) => 20 * Math.log10(x);
describe('auto levels (mix.py rules)', () => {
  it('music lands exactly 6 dB under the voice; SFX ≤ −6 dB with peaks under 0.7 × the voice peak', () => {
    const voice = tone(200, 0.3), music = tone(330, 0.05), sfx = new Float32Array(SR * 4);
    sfx[1000] = 0.9; for (let i = 0; i < SR * 4; i += 50) sfx[i] += 0.01;
    const { gm, gs, report } = levelLock([voice], [music], [sfx], SR);
    expect(db(gatedRms(music.map((x) => x * gm), SR) / gatedRms(voice, SR))).toBeCloseTo(-6.02, 1);
    expect(report.sfxVsVoice!).toBeLessThanOrEqual(-6.0);
    expect(0.9 * gs).toBeLessThanOrEqual(0.7 * 0.3 + 1e-9);
  });
  it('master: one gain to about −14 LUFS, peaks never above −1 dBFS', () => {
    const x = tone(440, 0.05, 6), y = Float32Array.from(x);
    y[3000] = 0.9;
    const before = lufs([x], SR);
    const r = master([y], SR);
    expect(r.lufsBefore).toBeCloseTo(before, 0);
    expect(Math.max(...Array.from(y, Math.abs))).toBeLessThanOrEqual(0.892);
    expect(lufs([y], SR)).toBeGreaterThan(-15.5);
  });
});
