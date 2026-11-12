import { describe, expect, it } from 'vitest';
import { GX, GY, busyGrid, type FootageAnalysis } from './footage';
import { freeZones, placeSuggestion, speakerSide, suggestLayers } from './place';
import { boxOf } from '../layout';
import { PALETTES } from '../recipe';

/** 10 s of a talking head: one face left of centre, calm wall on the right, busy bottom-left. */
function talkingHead(two = false): FootageAnalysis {
  const busy = Array.from({ length: GY }, (_, y) => Array.from({ length: GX }, (_, x) => (x < 8 && y > 5 ? 0.8 : 0.1))).flat();
  const faces = Array.from({ length: 20 }, (_, i) => two ? [[0.12, 0.2, 0.2, 0.35, i < 10 ? 0.6 : 0.05], [0.66, 0.2, 0.2, 0.35, i < 10 ? 0.05 : 0.6]] : [[0.25, 0.18, 0.22, 0.4, 0.3]]) as FootageAnalysis['faces'];
  return { fps: 2, aspect: '16:9', faces, win: 5, busy: [busy, busy], createdAt: 0, key: '' };
}
const frame = { w: 1920, h: 1080 };
const words = (s: string, t0 = 0) => s.split(' ').map((w, i) => ({ text: w, start: t0 + i * 0.4, end: t0 + i * 0.4 + 0.35 }));

describe('smart layers', () => {
  it('free zones avoid the face and the busy area', () => {
    const z = freeZones(talkingHead(), 1);
    expect(z.length).toBeGreaterThan(0);
    const big = z[0];
    // The biggest calm zone is on the right (the face is on the left).
    expect(big.x + big.w / 2).toBeGreaterThan(0.5);
  });
  it('finds who speaks when two people are on screen', () => {
    const an = talkingHead(true);
    expect(speakerSide(an, 0, 4)).toBe('left');
    expect(speakerSide(an, 5.5, 9)).toBe('right');
  });
  it('turns the transcript into suggestions (one at a time, names win)', () => {
    const ws = [...words("Hi, I'm Sarah Jones and welcome back."), ...words('Forty percent of people check the phone first.', 4), ...words('Coffee, emails, news, and notifications fill the hour.', 9), ...words('The secret is always the first hour!', 14), ...words('Subscribe for more.', 18)];
    const s = suggestLayers(ws, [{ t: 12, title: 'The fix' }]);
    const kinds = s.map((x) => x.kind);
    expect(kinds).toContain('name');
    expect(s.find((x) => x.kind === 'name')!.title).toBe('Sarah Jones');
    expect(kinds).toContain('cta');
    for (let i = 1; i < s.length; i++) expect(s[i].t).toBeGreaterThanOrEqual(s[i - 1].t + s[i - 1].dur - 0.001);
  });
  it('places a layer in free space, never over the face, inside the frame', () => {
    const an = talkingHead();
    for (const kind of ['name', 'number', 'quote', 'topic', 'cta', 'list'] as const) {
      const g = placeSuggestion({ id: 'x', kind, t: 1, dur: 3, title: 'Sarah Jones', value: '40%', items: ['a b', 'c d'], on: true }, an, frame, PALETTES.dark);
      const b = boxOf(g.items[0])!;
      const face = { x: (0.25 + 0.11 - 0.5) * 1920, y: (0.18 + 0.2 - 0.5) * 1080, w: 0.22 * 1920, h: 0.4 * 1080 };
      const ov = Math.max(0, Math.min(b.x + b.w / 2, face.x + face.w / 2) - Math.max(b.x - b.w / 2, face.x - face.w / 2)) * Math.max(0, Math.min(b.y + b.h / 2, face.y + face.h / 2) - Math.max(b.y - b.h / 2, face.y - face.h / 2));
      expect(ov / (b.w * b.h), kind).toBeLessThan(0.1);
      expect(Math.abs(b.x) + b.w / 2, kind).toBeLessThanOrEqual(1920 * 0.47 + 2);
      expect(g.placement).toBe('overlay');
    }
  });
  it('busy grid: a flat image is calm, an edgy one busy', () => {
    const w = 64, h = 36, flat = new Float32Array(w * h).fill(0.5), edgy = new Float32Array(w * h).map((_, i) => (((i % w) >> 1) % 2 ? 1 : 0));
    expect(Math.max(...busyGrid(flat, null, w, h))).toBeLessThan(0.05);
    expect(Math.min(...busyGrid(edgy, null, w, h))).toBeGreaterThan(0.5);
  });
});
