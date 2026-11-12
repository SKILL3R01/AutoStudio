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

import { HX, HY, detectCam, detectHud } from './footage';
describe('smart layers · gameplay', () => {
  const game = (): FootageAnalysis => ({
    ...talkingHead(), faces: Array.from({ length: 20 }, () => [[0.8, 0.7, 0.08, 0.14, 0.2]]) as FootageAnalysis['faces'],
    busy: [new Array(GX * GY).fill(0.9), new Array(GX * GY).fill(0.9)], hud: [{ x: 0.02, y: 0.88, w: 0.3, h: 0.08 }, { x: 0.82, y: 0.03, w: 0.15, h: 0.25 }], cam: { x: 0.74, y: 0.62, w: 0.22, h: 0.33 }, motion: 0.08,
  });
  it('finds HUD areas: sharp edges that never change while the picture moves', () => {
    const edge = new Array(HX * HY).fill(0.05), diff = new Array(HX * HY).fill(0.06);
    for (let y = 15; y < 17; y++) for (let x = 1; x < 9; x++) (edge[y * HX + x] = 0.2), (diff[y * HX + x] = 0.002); // health bar bottom-left
    const { hud, motion } = detectHud(edge, diff);
    expect(motion).toBeGreaterThan(0.05);
    expect(hud.length).toBe(1);
    expect(hud[0].x).toBeLessThan(0.1);
    expect(hud[0].y).toBeGreaterThan(0.8);
    // A still picture (no motion) has no HUD.
    expect(detectHud(edge, new Array(HX * HY).fill(0.001)).hud.length).toBe(0);
  });
  it('finds a facecam: a small face that stays in a corner', () => {
    const cam = detectCam(game().faces)!;
    expect(cam).toBeTruthy();
    expect(cam.x).toBeGreaterThan(0.6);
    expect(cam.y).toBeGreaterThan(0.5);
    expect(detectCam(talkingHead().faces)).toBeUndefined();
  });
  it('gameplay: hype alerts, a kill counter and a facecam frame from what is said', () => {
    const ws = [...words("Okay let's go into the next room."), ...words('Got him, that was a headshot.', 4), ...words('No way, the boss is here!', 8), ...words('Round 2 starts now.', 12)];
    const s = suggestLayers(ws, [], { game: true, an: game(), length: 16 });
    const kinds = s.map((x) => x.kind);
    expect(kinds[0]).toBe('facecam');
    expect(kinds).toContain('alert');
    expect(kinds).toContain('counter');
    expect(s.find((x) => x.kind === 'counter')!.value).toBe('×1');
    expect(kinds).toContain('topic');
  });
  it('gameplay placement keeps clear of the HUD, the facecam and the centre of the action', () => {
    const an = game(), boxes = [...an.hud!, an.cam!, { x: 0.3, y: 0.25, w: 0.4, h: 0.5 }];
    for (const kind of ['alert', 'counter', 'topic', 'cta'] as const) {
      const g = placeSuggestion({ id: 'x', kind, t: 1, dur: 2, title: 'NO WAY!', value: '×2', on: true }, an, frame, PALETTES.dark, true);
      const b = boxOf(g.items.find((i) => i.id === 'main')!)!;
      for (const r of boxes) {
        const R = { x: (r.x + r.w / 2 - 0.5) * 1920, y: (r.y + r.h / 2 - 0.5) * 1080, w: r.w * 1920, h: r.h * 1080 };
        const ov = Math.max(0, Math.min(b.x + b.w / 2, R.x + R.w / 2) - Math.max(b.x - b.w / 2, R.x - R.w / 2)) * Math.max(0, Math.min(b.y + b.h / 2, R.y + R.h / 2) - Math.max(b.y - b.h / 2, R.y - R.h / 2));
        expect(ov / (b.w * b.h), `${kind} vs ${JSON.stringify(r)}`).toBeLessThan(0.15);
      }
    }
    const cam = placeSuggestion({ id: 'c', kind: 'facecam', t: 0, dur: 16, title: 'LIVE', on: true }, an, frame, PALETTES.dark, true).items[0];
    expect(cam.w).toBeCloseTo(0.22 * 1920, 0);
    expect(cam.x).toBeCloseTo((0.74 + 0.11 - 0.5) * 1920, 0);
  });
});
