import { describe, expect, it } from 'vitest';
import { MOTION_OF, WORDS, kindFromScores, loopPeriod, maskStats, parentOf, pivotFor, poseAt, MOTIONS } from './model';

const W = 100, H = 60;
const rect = (x0: number, y0: number, x1: number, y1: number) => { const m = new Uint8Array(W * H); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };
/** A thin diagonal bar from (x0,y0) to (x1,y1). */
const bar = (x0: number, y0: number, x1: number, y1: number) => { const m = new Uint8Array(W * H); for (let i = 0; i <= 200; i++) { const x = Math.round(x0 + (x1 - x0) * i / 200), y = Math.round(y0 + (y1 - y0) * i / 200); for (const d of [-1, 0, 1]) if (y + d >= 0 && y + d < H) m[(y + d) * W + x] = 1; } return m; };

describe('living illustration model', () => {
  it('mask stats: centre, box, main axis and elongation', () => {
    const s = maskStats(bar(10, 10, 90, 50), W, H);
    expect(s.elong).toBeGreaterThan(5);
    expect(Math.abs(s.axis - Math.atan2(40 / H * H, 80))).toBeLessThan(0.08);
    const r = maskStats(rect(20, 10, 60, 30), W, H);
    expect(r.bbox).toEqual([0.2, 10 / 60, 0.4, 20 / 60]);
    expect(r.elong).toBeCloseTo(2, 0);
  });
  it('pivots: oar at the end touching its boat, boat at its waterline, sail at its top edge', () => {
    const boat: [number, number, number, number] = [0.3, 0.3, 0.4, 0.3];
    const oar = maskStats(bar(45, 25, 15, 55), W, H); // starts inside the boat (x 45) and sticks out down-left
    const pv = pivotFor('oar', oar, boat);
    expect(pv[0]).toBeGreaterThan(0.4);
    const hull = maskStats(rect(30, 18, 70, 36), W, H);
    expect(pivotFor('boat', hull)[1]).toBeGreaterThan(0.5);
    const sail = maskStats(rect(40, 5, 60, 30), W, H);
    expect(pivotFor('sail', sail)[1]).toBeCloseTo(5 / 60, 2);
  });
  it('parents: people and oars belong to the boat they sit on', () => {
    const boxes: [number, number, number, number][] = [[0.3, 0.3, 0.4, 0.3], [0.4, 0.35, 0.05, 0.08], [0.15, 0.4, 0.3, 0.05], [0.8, 0.1, 0.1, 0.1]];
    const kinds = ['boat', 'person', 'oar', 'cloud'] as const;
    expect(parentOf(1, boxes, [...kinds])).toBe(0);
    expect(parentOf(2, boxes, [...kinds])).toBe(0);
    expect(parentOf(3, boxes, [...kinds])).toBeUndefined();
  });
  it('labels: the best phrase wins, weak matches stay rigid', () => {
    const scores = WORDS.map((w) => (w[0] === 'a wooden oar' ? 0.31 : 0.18));
    expect(kindFromScores(scores)).toMatchObject({ kind: 'oar', label: 'wooden oar' });
    expect(kindFromScores(WORDS.map(() => 0.1)).kind).toBe('rigid');
    expect(MOTION_OF.sail).toBe('billow');
    expect(MOTION_OF.boat).toBe('rock');
  });
  it('every motion loops seamlessly over any clip length and stays subtle', () => {
    expect(loopPeriod(4, 10)).toBeCloseTo(10 / 3, 6);
    expect(loopPeriod(4, 1.5)).toBeCloseTo(1.5, 6);
    for (const motion of MOTIONS) for (const span of [2, 3.7, 6, 11.3]) {
      const p = { motion, strength: 1, speed: 1, axis: 0.4, id: 'part' + motion };
      const a = poseAt(p, 0, span), b = poseAt(p, span, span);
      expect(a.rot).toBeCloseTo(b.rot, 6); expect(a.dx).toBeCloseTo(b.dx, 6); expect(a.dy).toBeCloseTo(b.dy, 6); expect(a.bend).toBeCloseTo(b.bend, 6); expect(a.bright).toBeCloseTo(b.bright, 6);
      expect(Math.cos(2 * Math.PI * a.flow)).toBeCloseTo(Math.cos(2 * Math.PI * b.flow), 6);
      for (let t = 0; t <= span; t += span / 40) { const q = poseAt(p, t, span); expect(Math.abs(q.rot)).toBeLessThan(0.25); expect(Math.hypot(q.dx, q.dy)).toBeLessThan(0.03); }
    }
  });
});

import { refineChild } from './model';
describe('pieces of a ship', () => {
  it('above the waterline = sails, thin = masts or oars, children never rock on their own', () => {
    expect(refineChild('animal', { cy: 0.3, elong: 1.5 }, 'boat', 0.7)).toEqual({ kind: 'sail', motion: 'billow' });
    expect(refineChild('boat', { cy: 0.3, elong: 6 }, 'boat', 0.7)).toEqual({ kind: 'rigid', motion: 'still' });
    expect(refineChild('rigid', { cy: 0.75, elong: 6 }, 'boat', 0.7)).toEqual({ kind: 'oar', motion: 'row' });
    expect(refineChild('person', { cy: 0.6, elong: 1.2 }, 'boat', 0.7)).toEqual({ kind: 'person' });
    expect(refineChild('animal', { cy: 0.5, elong: 2 }, 'rigid', 0.7).motion).toBe('still');
  });
});
