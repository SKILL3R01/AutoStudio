import { describe, expect, it } from 'vitest';
import { newProject } from './project';
import { activePips, newPip, pipBox, placePip, splitPip } from './pip';
import { projectLength } from '../store';

describe('picture-in-picture / B-roll', () => {
  it('places overlays on a free track, a new one when busy, and extends the video length', () => {
    const p = newProject();
    const a = placePip(p, 'img', 2, 4);
    const b = placePip(p, 'img2', 3, 4);
    expect(p.videoTracks).toHaveLength(2);
    expect(a.trackId).not.toBe(b.trackId);
    expect(placePip(p, 'img3', 10, 2).trackId).toBe(a.trackId);
    expect(projectLength(p)).toBe(12);
  });
  it('draws higher tracks on top and hides muted tracks', () => {
    const p = newProject();
    const a = placePip(p, 'img', 0, 5);
    const b = placePip(p, 'img2', 0, 5);
    expect(activePips(p, 1).map((c) => c.id)).toEqual([a.id, b.id]);
    p.videoTracks[1].muted = true;
    expect(activePips(p, 1).map((c) => c.id)).toEqual([a.id]);
    expect(activePips(p, 6)).toEqual([]);
  });
  it('splits with continuous source time', () => {
    const p = newProject();
    const a = placePip(p, 'vid', 2, 6);
    expect(splitPip(p, a.id, 5)).toBe(true);
    expect(p.pips.map((c) => [c.start, c.duration, c.trimIn])).toEqual([[2, 3, 0], [5, 3, 3]]);
  });
  it('preset boxes: full screen covers the frame, half covers one side, window keeps the source aspect', () => {
    expect(pipBox(newPip('t', 'a', 0, 1, 'broll'), 1920, 1080, 1)).toEqual({ cx: 960, cy: 540, w: 1920, h: 1080 });
    expect(pipBox(newPip('t', 'a', 0, 1, 'side'), 1920, 1080, 1)).toEqual({ cx: 1440, cy: 540, w: 960, h: 1080 });
    const w = pipBox(newPip('t', 'a', 0, 1, 'corner'), 1920, 1080, 16 / 9);
    expect(w.w / w.h).toBeCloseTo(16 / 9);
  });
});
