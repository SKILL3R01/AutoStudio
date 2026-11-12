import { describe, expect, it } from 'vitest';
import { MUSIC_STYLES, composeMusic, musicCurve, sceneKind, type MusicScene } from './music';
import { SOUND_KITS, motionSoundCues } from '../motion/finish';
import type { MotionGroup } from '../motion/types';

const scenes: MusicScene[] = [
  { start: 0, end: 8, kind: 'intro' }, { start: 8, end: 20, kind: 'calm' }, { start: 20, end: 30, kind: 'reveal' }, { start: 30, end: 40, kind: 'outro' },
];

describe('style music', () => {
  it('scene kinds come from the designs', () => {
    expect(sceneKind('walk-in', 0, 5)).toBe('intro');
    expect(sceneKind('shocked-number', 2, 5)).toBe('reveal');
    expect(sceneKind('present-list', 2, 5)).toBe('calm');
    expect(sceneKind('say', 4, 5)).toBe('outro');
  });
  for (const st of Object.values(MUSIC_STYLES))
    it(`${st.name}: notes inside the video, silence before the reveal, a hit on it, busier when it matters`, () => {
      const ev = composeMusic(st, scenes, 40);
      expect(ev.length).toBeGreaterThan(40);
      for (const e of ev) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(40);
        expect(Number.isFinite(e.f) && e.f > 20).toBe(true);
      }
      expect(ev.some((e) => e.t > 19.65 && e.t < 20 && e.inst !== 'hit')).toBe(false);
      expect(ev.some((e) => e.inst === 'hit' && e.t === 20)).toBe(true);
      const per = (a: number, b: number) => ev.filter((e) => e.t >= a && e.t < b).length / (b - a);
      expect(per(30, 37)).toBeGreaterThan(per(8, 20));
    });
  it('the volume curve dips before the reveal and fades out at the end', () => {
    const c = musicCurve(scenes, 40);
    const at = (t: number) => {
      const i = c.findIndex((p) => p.t > t);
      if (i <= 0) return c[c.length - 1].v;
      const a = c[i - 1], b = c[i];
      return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    };
    expect(at(19.8)).toBeLessThan(0.2);
    expect(at(15)).toBe(1);
    expect(c[c.length - 1]).toEqual({ t: 40, v: 0 });
  });
});

describe('style sound kits', () => {
  const g = (items: MotionGroup['items']): MotionGroup[] => [{ id: 'g', name: 'g', start: 0, dur: 6, placement: 'full', frame: { w: 1920, h: 1080 }, palette: { bg: '#000', card: '#111', text: '#fff', muted: '#888', accents: ['#f00'] }, items }];
  const shocked = { id: 'c', type: 'widget' as const, widget: 'character', start: 0, dur: 6, poses: [{ t: 0, pose: 'walk' }, { t: 2, pose: 'shocked' }, { t: 4, pose: 'celebrate' }] };
  it('characters sound: footsteps, a hit (a boing in Cartoon), a ta-da', () => {
    expect(motionSoundCues(g([shocked]), SOUND_KITS.stick).map((c) => c.sound)).toEqual(['steps', 'thud', 'tada']);
    expect(motionSoundCues(g([shocked]), SOUND_KITS.cartoon).map((c) => c.sound)).toEqual(['steps', 'boing', 'tada']);
  });
  it('documentary uses paper and pen sounds', () => {
    const items = [{ id: 'w', type: 'widget' as const, widget: 'wipe', start: 0, dur: 1 }, { id: 'a', type: 'widget' as const, widget: 'arrow', start: 2, dur: 1 }, { id: 't', type: 'widget' as const, widget: 'typewriter-tag', start: 4, dur: 1 }];
    expect(motionSoundCues(g(items), SOUND_KITS.documentary).map((c) => c.sound)).toEqual(['paper', 'pen', 'typewriter']);
    expect(motionSoundCues(g(items), SOUND_KITS.explainer).map((c) => c.sound)).toEqual(['swoosh', 'swoosh', 'click']);
  });
});
