import { describe, expect, it } from 'vitest';
import { cleanPicks } from './typography';

describe('cleanPicks', () => {
  it('accepts messy LLM answers', () => {
    expect(cleanPicks({ phrases: [{ from: '2', to: 4, main: 3 }, { from: 5, to: 6, main: '5, 6' }, { from: 9, to: 99 }] }, 20))
      .toEqual([{ from: 2, to: 4, main: [3], template: undefined }, { from: 5, to: 6, main: [5, 6], template: undefined }]);
    expect(cleanPicks([{ from: 1, to: 1, main: null, template: 'stack' }], 5)).toEqual([{ from: 1, to: 1, main: [], template: 'stack' }]);
    expect(cleanPicks('nonsense', 5)).toEqual([]);
  });
});
