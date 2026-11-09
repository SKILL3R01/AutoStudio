import { describe, expect, it } from 'vitest';
import { TYPO_DESIGNS, applyDesign, designOf } from './typostyles';
import { FONT_PAIRS, TYPO_PALETTES } from './typography';
import { palOf, pairOf } from '../render/typography';
import type { TypoBlock } from '../types';

const block = (): TypoBlock => ({ id: 'b', start: 1, end: 3, template: 'stack', x: 0.4, y: 0.6, scale: 1, rotate: 0, palette: 'mono-yellow', fontPair: 'spartan-pacifico', bg: 'shadow', locked: false, words: [{ text: 'Hi', start: 1, end: 1.3, role: 'main' }] });

describe('typography styles', () => {
  it('every built-in design uses a real palette and font pair', () => {
    expect(TYPO_DESIGNS.length).toBeGreaterThanOrEqual(20);
    for (const d of TYPO_DESIGNS) expect(TYPO_PALETTES[d.palette] && FONT_PAIRS[d.fontPair], d.id).toBeTruthy();
  });
  it('applies a design but keeps words, timing and position; round-trips as "my style"', () => {
    const b = block();
    applyDesign(b, TYPO_DESIGNS.find((d) => d.id === 'neon-night')!);
    expect(b).toMatchObject({ template: 'mixed', palette: 'neon', start: 1, x: 0.4, words: [{ text: 'Hi' }] });
    expect(b.style?.glow).toBe(0.8);
    const mine = designOf(b, 'Mine', 'm1');
    const c = block();
    applyDesign(c, mine);
    expect(c.style).toEqual(b.style);
    expect(c.style).not.toBe(b.style);
  });
  it('overrides colours and fonts on top of the palette / pair', () => {
    const b = { ...block(), style: { colors: { accent: '#ff00ff' }, fonts: { main: { family: 'Anton', weight: 400 } } } };
    expect(palOf(b).accent).toBe('#ff00ff');
    expect(palOf(b).text).toBe(TYPO_PALETTES['mono-yellow'].text);
    expect(pairOf(b).main.family).toBe('Anton');
    expect(pairOf(b).script).toEqual(FONT_PAIRS['spartan-pacifico'].script);
  });
});
