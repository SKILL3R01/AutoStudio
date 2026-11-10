import { describe, expect, it } from 'vitest';
import { applyFix, durationFlags, fixPlan, fmtClock, moveClip, parseClock, setClipStart } from './timeline';
import { newProject, defaultClip } from './project';

const proj = (starts: number[]) => {
  const p = newProject();
  p.clips = starts.map((s, i) => ({ ...defaultClip(`a${i}`, s), id: `c${i}` }));
  return p;
};

describe('timeline helpers', () => {
  it('parses typed times', () => {
    expect(parseClock('1:23.450')).toBeCloseTo(83.45);
    expect(parseClock('83.45')).toBeCloseTo(83.45);
    expect(parseClock('0:12:340')).toBeCloseTo(12.34);
    expect(parseClock('1:02:03.5')).toBeCloseTo(3723.5);
    expect(parseClock('abc')).toBeNull();
    expect(fmtClock(83.45)).toBe('1:23.450');
  });
  it('reorders clips keeping durations, with no gaps or overlaps', () => {
    const p = proj([0, 3, 5, 9]);
    const out = moveClip(p.clips, 0, 2, 12);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c0', 'c3']);
    expect(out.map((c) => c.start)).toEqual([0, 2, 6, 9]);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThan(out[i - 1].start);
  });
  it('keeps a typed start inside the neighbours', () => {
    const p = proj([0, 3, 5]);
    setClipStart(p, 1, 10, 8);
    expect(p.clips[1].start).toBeCloseTo(4.9);
    setClipStart(p, 1, -2, 8);
    expect(p.clips[1].start).toBeCloseTo(0.1);
  });
  it('flags too-short and too-long clips unless ignored', () => {
    const p = proj([0, 0.5, 3, 30]);
    expect(durationFlags(p, 32).map((f) => [f.id, f.kind])).toEqual([['c0', 'short'], ['c2', 'long']]);
    p.clips[2].ignoreDuration = true;
    expect(durationFlags(p, 32).map((f) => f.id)).toEqual(['c0']);
  });
});

describe('fix short clips', () => {
  it('suggests merge for tiny clips, extend for short ones, ignore for long ones, and applies them', () => {
    const p = proj([0, 3, 3.3, 4, 5, 30]);
    const plan = fixPlan(p, 32);
    expect(plan.map((f) => [f.id, f.action])).toEqual([['c1', 'mergePrev'], ['c2', 'extend'], ['c4', 'ignore']]);
    applyFix(p, plan, 32, () => {});
    expect(p.clips.map((c) => [c.id, c.start])).toEqual([['c0', 0], ['c2', 3], ['c3', 4], ['c4', 5], ['c5', 30]]);
    expect(p.clips.find((c) => c.id === 'c4')!.ignoreDuration).toBe(true);
    expect(durationFlags(p, 32)).toEqual([]);
  });
});
