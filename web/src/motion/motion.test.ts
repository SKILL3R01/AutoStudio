import { describe, expect, it } from 'vitest';
import { cameraAt, ease, familyOf, keyed, poseAt } from './anim';
import { splitGroup, stretchGroup } from './edit';
import { recipeToGroup } from './recipe';
import { buildMotionPrompt, frameFor } from './prompt';
import type { Project } from '../types';
import type { MotionItem } from './types';

const item = (o: Partial<MotionItem>): MotionItem => ({ id: 'a', type: 'text', start: 0, dur: 3, ...o });

describe('motion animation', () => {
  it('eases stay in range and end at 1', () => {
    for (const n of ['linear', 'ease', 'fast-slow', 'strong', 'overshoot', 'bounce', 'spring']) expect(ease(n, 1)).toBeCloseTo(1, 2);
    expect(ease('hold', 0.5)).toBe(0);
  });
  it('maps preset names onto animation families', () => {
    expect(familyOf('saas-words')).toBe('words');
    expect(familyOf('typewriter')).toBe('letters');
    expect(familyOf('stomp')).toBe('stomp');
    expect(familyOf('cinematic-rise')).toBe('rise');
    expect(familyOf('elastic-pop')).toBe('pop');
    expect(familyOf('something-unknown')).toBe('fade');
  });
  it('enter, exit and keys', () => {
    const it0 = item({ in: 'fade-in', out: 'fade-out', x: 100, keys: [{ t: 0, x: -500 }, { t: 1, x: 100, ease: 'linear' }] });
    expect(poseAt(it0, 0).alpha).toBe(0);
    expect(poseAt(it0, 1.5).alpha).toBe(1);
    expect(poseAt(it0, 2.99).alpha).toBeLessThan(0.1);
    expect(poseAt(it0, 0.5).dx).toBeCloseTo(-300);
    expect(keyed(it0.keys, 'x', 5, 0)).toBe(100);
  });
  it('camera zooms between its keys', () => {
    const cam = item({ type: 'camera', start: 1, dur: 2, keys: [{ t: 0, zoom: 1 }, { t: 2, zoom: 2, ease: 'linear' }] });
    expect(cameraAt([cam], 2).zoom).toBeCloseTo(1.5);
    expect(cameraAt([cam], 5).zoom).toBe(1);
  });
});

describe('motion blocks', () => {
  const raw = JSON.stringify({ palette: 'dark', items: [{ type: 'text', text: 'A', start: 0, dur: 4, in: 'fade-in', keys: [{ t: 2, x: 10 }] }, { type: 'text', text: 'B', start: 5, dur: 3 }] });
  it('stretch scales layer times and keys', () => {
    const g = recipeToGroup(raw, 0, 'full').group!;
    expect(g.dur).toBe(8);
    stretchGroup(g, 16);
    expect(g.items[1].start).toBe(10);
    expect(g.items[0].keys![0].t).toBe(4);
  });
  it('split cuts crossing layers and keeps the rest', () => {
    const g = recipeToGroup(raw, 10, 'full').group!;
    const p = { motion: [g] } as unknown as Project;
    const id = splitGroup(p, g.id, 12)!;
    expect(p.motion).toHaveLength(2);
    const b = p.motion!.find((x) => x.id === id)!;
    expect(b.start).toBe(12);
    expect(b.dur).toBe(6);
    expect(p.motion![0].items[0].dur).toBe(2);
    expect(b.items.map((i) => i.text)).toEqual(['A', 'B']);
    expect(b.items[0].in).toBeUndefined();
    expect(b.items[1].start).toBe(3);
  });
});

describe('motion prompt', () => {
  it('uses the band frame and lists the vocabulary', () => {
    expect(frameFor('band', '9:16')).toEqual({ w: 1920, h: 540 });
    expect(frameFor('full', '9:16')).toEqual({ w: 1080, h: 1920 });
    const pr = buildMotionPrompt({ idea: 'لماذا نحتاج الصبر', placement: 'full', aspect: '16:9', length: 'auto', style: 'free', language: 'auto', narration: [{ t: 0.4, w: 'hello' }] });
    expect(pr).toMatch(/Arabic \(right-to-left\)/);
    expect(pr).toMatch(/0\.40 hello/);
    expect(pr).toMatch(/chart-line/);
    expect(pr).toMatch(/Safe area \|x\| < 845/);
  });
});
