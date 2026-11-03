import { describe, expect, it } from 'vitest';
import { combineGrades, LOOKS, needsGpu, NEUTRAL, parseCube, sampleLut } from './grade';
import { layoutPen, parsePath, parseSvgFont, penFont, PEN_FONTS, type PenFont } from './strokefont';

/** A 2³ cube that inverts colours. */
const INVERT = `TITLE "Invert"
# comment
LUT_3D_SIZE 2
1 1 1
0 1 1
1 0 1
0 0 1
1 1 0
0 1 0
1 0 0
0 0 0
`;

describe('colour grading', () => {
  it('parses .cube LUTs (red fastest) and samples them', () => {
    const lut = { id: 'x', ...parseCube(INVERT) };
    expect(lut.name).toBe('Invert');
    expect(lut.size).toBe(2);
    expect(sampleLut(lut, 0, 0, 0)).toEqual([1, 1, 1]);
    expect(sampleLut(lut, 1, 0, 0)).toEqual([0, 1, 1]);
    const mid = sampleLut(lut, 0.25, 0.5, 0.75);
    expect(mid[0]).toBeCloseTo(0.75, 1);
    expect(mid[2]).toBeCloseTo(0.25, 1);
  });
  it('rejects 1D and incomplete LUTs', () => {
    expect(() => parseCube('LUT_1D_SIZE 4\n0 0 0')).toThrow(/1D/);
    expect(() => parseCube('LUT_3D_SIZE 4\n0 0 0')).toThrow(/incomplete/);
  });
  it('combines project and clip grades; only real grades use the GPU', () => {
    const g = combineGrades({ ...NEUTRAL, contrast: 1.2, temperature: 0.3, lut: 'a' }, { ...NEUTRAL, contrast: 0.5, temperature: -0.1, vignette: 0.4 });
    expect(g.contrast).toBeCloseTo(0.6);
    expect(g.temperature).toBeCloseTo(0.2);
    expect(g.lut).toBe('a');
    expect(g.vignette).toBe(0.4);
    expect(needsGpu(NEUTRAL)).toBe(false);
    expect(needsGpu({ ...NEUTRAL, saturation: 0, vignette: 0.5 })).toBe(false);
    expect(needsGpu(g)).toBe(true);
    expect(LOOKS.length).toBeGreaterThan(8);
  });
});

describe('pen fonts', () => {
  it('parses M / L / C path commands into polylines', () => {
    const s = parsePath('M 0 0 L 10 0 L 10 10 M 20 0 C 20 10 30 10 30 0');
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(s[1]).toHaveLength(9);
    expect(s[1][8]).toEqual([30, 0]);
  });
  it('loads every bundled font with letters, digits and punctuation', () => {
    for (const id of Object.keys(PEN_FONTS) as PenFont[]) {
      const f = penFont(id);
      expect(f.em).toBe(1000);
      for (const ch of 'aZ09!?,') expect(f.glyphs.get(ch)?.strokes.length ?? 0, `${id} ${ch}`).toBeGreaterThan(0);
    }
  });
  it('lays out a word left to right with a measurable stroke length', () => {
    const L = layoutPen('Hello', 'allure', 100);
    expect(L.strokes.length).toBeGreaterThan(2);
    expect(L.width).toBeGreaterThan(150);
    expect(L.ends[L.ends.length - 1]).toBeCloseTo(L.length);
    expect(Math.min(...L.strokes.flat().map((p) => p[1]))).toBeLessThan(0);
    expect(parseSvgFont('<font horiz-adv-x="300"><font-face units-per-em="1000" ascent="800"/><glyph unicode="&amp;" d="M 0 0 L 1 1"/></font>').glyphs.has('&')).toBe(true);
  });
});
