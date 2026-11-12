import { describe, expect, it } from 'vitest';
import { POSES, poseOf, stateAt } from './stick';
import { STICK, moodOf } from '../styles/stick';
import type { SceneCtx } from '../styles/types';
import { fixLayout } from '../layout';

const ctx = (w: number, h: number, k = 0): SceneCtx => ({ dur: 4, frame: { w, h }, pal: STICK.variants[0].palette, font: 'Montserrat', k, keyAt: 1.2, last: false, images: [] });
const D = Math.PI / 180;
/** Lowest point of a leg below the hip (thigh + shin, H = 560). */
const legDrop = (t1: number, s1: number) => 560 * 0.2 * (Math.cos(t1 * D) + Math.cos((t1 + s1) * D));

describe('stick figure characters', () => {
  it('every pose is finite at any time and blends smoothly between keys', () => {
    for (const p of POSES) for (const t of [0, 0.37, 1.9]) for (const v of Object.values(poseOf(p, t))) expect(Number.isFinite(v), p).toBe(true);
    const it = { id: 'c', type: 'widget', widget: 'character', start: 0, dur: 4, poses: [{ t: 0, pose: 'stand' }, { t: 1, pose: 'celebrate' }] } as never;
    const a = stateAt(it, 0.99).pose.ru, mid = stateAt(it, 1.17).pose.ru, b = stateAt(it, 1.5).pose.ru;
    expect(mid).toBeGreaterThan(a);
    expect(mid).toBeLessThan(b);
    expect(stateAt(it, 1.5).face).toBe('happy');
  });
  it('the feet stay on the ground: sitting lowers the hips', () => {
    const st = poseOf('stand', 0), sit = poseOf('sit', 0);
    expect(Math.max(legDrop(sit.lt, sit.ls), legDrop(sit.rt, sit.rs))).toBeLessThan(Math.max(legDrop(st.lt, st.ls), legDrop(st.rt, st.rs)) * 0.7);
  });
  it('guesses the mood from the words unless the AI gives one', () => {
    expect(moodOf({ title: 'He lost everything' })).toBe('sad');
    expect(moodOf({ title: 'But then, suddenly' })).toBe('surprised');
    expect(moodOf({ title: 'Why does this happen?' })).toBe('thinking');
    expect(moodOf({ title: 'He lost everything', mood: 'angry' })).toBe('angry');
  });
  it('all 18 designs build in 16:9 and 9:16, with a set, a character inside the frame, and layout leaves the cast alone', () => {
    expect(STICK.templates.length).toBe(18);
    expect(STICK.status).toBe('ready');
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
      const c = ctx(w, h, 3);
      for (const tpl of STICK.templates) {
        const items = tpl.build({ title: 'Sam lost his job, and then everything changed', key: 'job', value: '40%', label: 'of people', items: ['Wake', 'Walk', 'Write'], left: ['Before'], right: ['After'], date: '1999', place: 'night' }, c);
        expect(items.some((x) => x.widget === 'set'), tpl.id).toBe(true);
        const chars = items.filter((x) => x.widget === 'character');
        expect(chars.length, tpl.id).toBeGreaterThan(0);
        for (const ch of chars) {
          const size = ch.size as number, x0 = ch.keys?.length ? ch.keys[ch.keys.length - 1].x ?? ch.x ?? 0 : ch.x ?? 0;
          expect((ch.y ?? 0) + size / 2, `${tpl.id} feet on the ground`).toBeCloseTo(h * (h > w ? 0.22 : 0.3), 0);
          expect(Math.abs(x0) + size * 0.3, `${tpl.id} inside`).toBeLessThanOrEqual(w * 0.5 + 1);
        }
        const fixed = fixLayout(STICK.frameScene(items, c), c.frame).items;
        for (const ch of chars) expect(fixed.find((x) => x.id === ch.id)!.x, `${tpl.id} cast not moved`).toBe(ch.x);
      }
    }
  });
});

import { pickTemplates } from '../story/model';
describe('stick figure scene picks follow the story', () => {
  it('uses the story cues before the generic hints', () => {
    const texts = ['Meet Sam. Every morning, Sam woke up late and ran to work.', 'At his desk, he felt tired before the day even started.', 'Why was every day the same? He tried everything.', 'One night, alone on the street, he almost gave up.', 'Then it clicked. What if the first hour belonged to him?', 'Sam told his friend: one hour, no phone, every morning!', 'Sam smiled. Small change, big difference.'];
    const scenes = texts.map((text, i) => ({ id: `s${i}`, start: i * 4, end: i * 4 + 4, text, words: [], hints: ['plain' as const], keys: [], templateId: '', slots: {}, source: 'template' as const }));
    pickTemplates(scenes, STICK, true);
    expect(scenes.map((s) => s.templateId)).toEqual(['walk-in', 'desk', 'shrug', 'alone', 'idea', 'two-talk', 'celebrate']);
  });
});

describe('cartoon sample picks', () => {
  it('“his friend said” is a conversation, a colon alone is not speech', () => {
    const texts = ['His friend said: try water first, then one coffee!', 'Suddenly, he had more energy than ever.', 'He counted: three thousand cups in one year!'];
    const scenes = texts.map((text, i) => ({ id: `s${i}`, start: i * 4, end: i * 4 + 4, text, words: [], hints: ['number' as const], keys: [], templateId: '', slots: {}, source: 'template' as const }));
    pickTemplates(scenes, STICK, true);
    expect(scenes.map((s) => s.templateId).slice(0, 2)).toEqual(['two-talk', 'idea']);
    expect(scenes[2].templateId).not.toBe('say');
  });
});
