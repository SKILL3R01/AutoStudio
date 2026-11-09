import { describe, expect, it } from 'vitest';
import { isDepthMotion, parallaxCamera } from './motion';
import { DEPTH_MOTIONS } from '../types';

describe('3D depth moves', () => {
  it('every move is a depth move with a small, smooth, distinct camera path', () => {
    expect(DEPTH_MOTIONS.length).toBe(11);
    const paths = DEPTH_MOTIONS.map((m) => {
      expect(isDepthMotion(m)).toBe(true);
      const pts = Array.from({ length: 41 }, (_, k) => parallaxCamera(m, k / 40, (k / 40) * 5, 0.12, 1));
      for (const c of pts) {
        expect(Math.abs(c.ox)).toBeLessThan(0.05);
        expect(Math.abs(c.oy)).toBeLessThan(0.05);
        expect(c.push).toBeGreaterThanOrEqual(0);
        expect(c.push).toBeLessThan(0.15);
      }
      for (let k = 1; k < pts.length; k++) expect(Math.abs(pts[k].ox - pts[k - 1].ox) + Math.abs(pts[k].oy - pts[k - 1].oy)).toBeLessThan(0.01);
      return JSON.stringify(pts.map((c) => [c.ox.toFixed(3), c.oy.toFixed(3), c.push.toFixed(3), c.zoom.toFixed(3)]));
    });
    expect(new Set(paths).size).toBe(DEPTH_MOTIONS.length);
    expect(isDepthMotion('zoomIn')).toBe(false);
  });
});
