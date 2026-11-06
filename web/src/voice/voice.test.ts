import { describe, expect, it } from 'vitest';
import { checkSample, detectLanguage, paragraphsOf } from './library';
import { wsola } from '../audio/pitch';
import { FX_PRESETS, defaultFx } from '../audio/enhance';

const NL = String.fromCharCode(10);
const fakeBuf = (sec: number, amp: number) => {
  const d = Float32Array.from({ length: Math.round(sec * 1000) }, (_, i) => amp * Math.sin(i / 5));
  return { duration: sec, getChannelData: () => d } as unknown as AudioBuffer;
};

describe('Voice Studio', () => {
  it('splits scripts into paragraphs and merges tiny ones', () => {
    expect(paragraphsOf(['First paragraph that is long enough to stand alone here.', 'Second one is also quite long enough, really.', 'Ok.'].join(NL + NL))).toEqual([
      'First paragraph that is long enough to stand alone here.',
      'Second one is also quite long enough, really. Ok.',
    ]);
    expect(paragraphsOf('  ' + NL + NL + ' ')).toEqual([]);
  });
  it('detects Arabic scripts', () => {
    expect(detectLanguage('هل استيقظت يوماً')).toBe('ar');
    expect(detectLanguage('Hello there')).toBe('en');
  });
  it('flags short, clipping and quiet samples', () => {
    expect(checkSample(fakeBuf(12, 0.3)).issues).toEqual([]);
    expect(checkSample(fakeBuf(3, 0.3)).issues[0]).toMatch(/short/);
    expect(checkSample(fakeBuf(12, 1)).issues.some((i) => /clips/.test(i))).toBe(true);
    expect(checkSample(fakeBuf(12, 0.005)).issues.some((i) => /quiet/.test(i))).toBe(true);
  });
  it('time-stretches speech by the requested pace (WSOLA)', () => {
    const sr = 16000;
    const x = Float32Array.from({ length: sr * 2 }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / sr));
    expect(wsola(x, 1.25, sr).length).toBe(Math.round(x.length / 1.25));
    expect(wsola(x, 0.8, sr).length).toBe(Math.round(x.length / 0.8));
    const y = wsola(x, 1.1, sr);
    expect(Math.max(...y.slice(2000, 20000).map(Math.abs))).toBeGreaterThan(0.8);
  });
  it('has presets with sane ranges', () => {
    for (const [k, v] of Object.entries(FX_PRESETS)) {
      expect(Math.abs(v.fx.bass) <= 6 && v.fx.compress <= 1 && v.fx.room <= 0.5, k).toBe(true);
    }
    expect(defaultFx()).toMatchObject({ preset: 'clean', targetLufs: -14 });
  });
});
