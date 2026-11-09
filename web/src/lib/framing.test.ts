import { describe, expect, it } from 'vitest';
import { cropRect, focusShift } from './framing';

describe('framing', () => {
  it('a 16:9 image in a 9:16 frame shows a centred vertical slice, moved by the focus point but never past the edge', () => {
    const ia = 16 / 9, fa = 9 / 16;
    const c = cropRect(ia, fa, { x: 0.5, y: 0.5 });
    expect(c.w).toBeCloseTo(fa / ia);
    expect(c.x).toBeCloseTo((1 - c.w) / 2);
    expect(cropRect(ia, fa, { x: 1, y: 0.5 }).x).toBeCloseTo(1 - c.w);
    expect(cropRect(ia, fa, { x: 0.5, y: 0.5, zoom: 2 }).w).toBeCloseTo(c.w / 2);
  });
  it('focus shift moves the image toward the focus point and stays within the overflow', () => {
    // 1920x1080 image covering a 1080x1920 frame: scale 1920/1080, overflow on x only
    const s = 1920 / 1080;
    const left = focusShift(1920, 1080, 1080, 1920, s, { x: 0, y: 0.5 });
    expect(left.dx).toBeCloseTo((1920 * s - 1080) / 2);
    expect(left.dy).toBe(0);
    expect(focusShift(1920, 1080, 1080, 1920, s, { x: 0.5, y: 0.5 }).dx).toBe(0);
  });
});
