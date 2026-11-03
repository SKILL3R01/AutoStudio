import { describe, expect, it } from 'vitest';
import { applyAutoEdit, assignUnique, buildClips, planScenes, snapToBeat } from './autoedit';
import { newProject } from './project';
import type { Word } from '../types';

/** "One. Two three. Four five six." spread over 9 s, then silence to 12 s. */
const words: Word[] = [
  { text: 'One.', start: 1, end: 1.5 },
  { text: 'Two', start: 3, end: 3.4 }, { text: 'three.', start: 3.5, end: 4 },
  { text: 'Four', start: 6, end: 6.4 }, { text: 'five', start: 6.5, end: 7 }, { text: 'six.', start: 8.5, end: 9 },
];

describe('auto-edit planning', () => {
  it('covers 0 → end, cuts on sentences, keeps scenes ≥ 1 s', () => {
    const s = planScenes(words, 12, { target: 2, snapBeats: false });
    expect(s[0].start).toBe(0);
    expect(s[s.length - 1].end).toBe(12);
    // Cuts after sentences and before the long pause ahead of “six.”
    expect(s.map((x) => x.start)).toEqual([0, 3, 6, 8.5]);
    expect(s[1].text).toBe('Two three.');
    for (const x of s) expect(x.end - x.start).toBeGreaterThanOrEqual(1);
  });
  it('snaps cuts to nearby beats', () => {
    expect(snapToBeat(3, [2.5, 3.2, 4])).toBe(3.2);
    expect(snapToBeat(3, [2, 4])).toBe(3);
    const s = planScenes(words, 12, { target: 2, snapBeats: true }, [2.8, 6.1]);
    expect(s.map((x) => x.start)).toEqual([0, 2.8, 6.1, 8.5]);
  });
  it('splits evenly when there is no transcript', () => {
    expect(planScenes([], 10, { target: 4, snapBeats: false }).map((x) => +x.start.toFixed(2))).toEqual([0, 3.33, 6.67]);
  });
  it('assigns each scene a different best asset', () => {
    // scene 0 likes asset 0 most, scene 1 also likes asset 0 but less → gets asset 1.
    expect(assignUnique([[0.9, 0.2], [0.8, 0.7]])).toEqual([0, 1]);
    expect(assignUnique([[0.1], [0.05]], 0.08)).toEqual([0, null]);
  });
  it('builds clips with varied motion, placeholders and transitions', () => {
    const scenes = planScenes(words, 12, { target: 2, snapBeats: false });
    const clips = buildClips(scenes, (i) => (i === 1 ? undefined : `a${i}`), (id) => id === 'a2', { motion: 'vary', transitions: 'soft' });
    expect(clips.map((c) => c.start)).toEqual([0, 3, 6, 8.5]);
    expect(clips[1].fill).toBeTruthy();
    expect(clips[0].motion).toBe('zoomIn');
    expect(clips[2].motion).toBe('none');
    expect(clips.map((c) => c.transition)).toEqual(['none', 'crossfade', 'crossfade', 'crossfade']);
    const p = newProject();
    applyAutoEdit(p, clips, [{ assetId: 'a0', title: 't', creator: 'c', license: 'CC0', page: 'x', required: false }]);
    expect(p.clips).toHaveLength(4);
    expect(p.credits).toHaveLength(1);
  });
});
