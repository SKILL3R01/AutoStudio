import { describe, expect, it } from 'vitest';
import { mergeWindows, windows } from './asrchunks';

describe('chunked transcription', () => {
  it('covers the whole audio with overlapping windows', () => {
    expect(windows(20)).toEqual([{ start: 0, end: 20 }]);
    const w = windows(60);
    expect(w[0]).toEqual({ start: 0, end: 28 });
    expect(w[1].start).toBe(26);
    expect(w[w.length - 1].end).toBe(60);
  });
  it('merges words without duplicates across the overlap', () => {
    const w = [{ start: 0, end: 28 }, { start: 26, end: 54 }];
    const merged = mergeWindows(w, [
      [{ text: 'a', start: 1, end: 1.3 }, { text: 'edge', start: 26.5, end: 26.9 }, { text: 'late', start: 27.5, end: 27.9 }],
      [{ text: 'edge', start: 0.5, end: 0.9 }, { text: 'late', start: 1.5, end: 1.9 }, { text: 'b', start: 10, end: 10.4 }],
    ]);
    expect(merged.map((x) => x.text)).toEqual(['a', 'edge', 'late', 'b']);
    expect(merged[3].start).toBe(36);
  });
});
