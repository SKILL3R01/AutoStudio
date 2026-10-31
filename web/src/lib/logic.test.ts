import { describe, expect, it } from 'vitest';
import { detectTime, parseClock } from './timecode';
import { buildLines, parseCaptionFile, spreadWords } from './captions';
import { layoutKeywords, pickKeywords } from './keywords';
import { splitScenes } from './scenes';
import { ops, statuses, type ReviewItem } from '../editor/review';
import { defaultKeywordSettings } from './project';
import type { CaptionSettings, Word } from '../types';

describe('detectTime', () => {
  it.each([
    ['0-03.png', 3], ['01-32-420.mp4', 92.42], ['1-02-03-500.png', 3723.5], ['0_03.png', 3], ['00:03.jpg', 3],
    ['[00:03.5] intro.png', 3.5], ['1m32s.png', 92], ['92s.png', 92], ['t=92.png', 92], ['12.5.png', 12.5],
  ])('%s → %s s', (name, t) => {
    const g = detectTime(name);
    expect(g.kind).toBe('timestamp');
    expect(g.time).toBeCloseTo(t);
  });
  it('reads Flow names as sequence + variant', () => expect(detectTime('007-a lighthouse_v2.png')).toMatchObject({ kind: 'sequence', seq: 7, variant: 2 }));
  it('rejects camera names', () => expect(detectTime('IMG_20240101_123456.jpg').kind).toBe('rejected'));
  it('treats copy markers as missing', () => expect(detectTime('image (16).png').kind).toBe('none'));
  it('flags bare numbers as ambiguous', () => expect(detectTime('scene 7.png')).toMatchObject({ kind: 'number', time: 7 }));
});

describe('parseClock', () => {
  it.each([['1:32.4', 92.4], ['92', 92], ['92.5s', 92.5], ['1m32', 92], ['1:02:03', 3723], ['', null], ['abc', null]])('%s', (s, t) => {
    const v = parseClock(s);
    if (t === null) expect(v).toBeNull();
    else expect(v).toBeCloseTo(t);
  });
});

const item = (name: string, time: number | null, extra: Partial<ReviewItem> = {}): ReviewItem => ({
  id: name, file: new Blob(), name, kind: 'image', guess: detectTime(name), time, confirmed: time !== null, include: true, selected: false, url: '', ...extra,
});

describe('review ops', () => {
  it('fills missing rows between named neighbours', () => {
    const out = ops.fillMissing([item('a1.png', 0), item('a2.png', null), item('a3.png', null), item('a4.png', 9)], 20);
    expect(out.map((i) => i.time)).toEqual([0, 3, 6, 9]);
  });
  it('marks duplicates and missing', () => {
    const st = statuses([item('x.png', 3), item('y.png', 3), item('z.png', null)], 10);
    expect([...st.values()]).toEqual(['duplicate', 'duplicate', 'missing']);
  });
  it('maps Flow sequences to scene times and keeps one variant', () => {
    const items = [item('001_v1.png', null), item('001_v2.png', null), item('002_v1.png', null)];
    const mapped = ops.keepOneVariant(ops.mapFlow(items, [{ seq: 1, start: 0, text: '', prompt: '' }, { seq: 2, start: 4.5, text: '', prompt: '' }]));
    expect(mapped.map((i) => [i.time, i.include])).toEqual([[0, true], [0, false], [4.5, true]]);
  });
});

const words = (text: string, dur = 0.4): Word[] => text.split(' ').map((t, i) => ({ text: t, start: i * dur, end: i * dur + dur * 0.9 }));
const settings: CaptionSettings = { enabled: true, mode: 'full', style: 'neon', font: '', size: 1, position: 80, maxWords: 4, uppercase: false, wordLevel: true };

describe('captions', () => {
  it('groups words into lines at punctuation and max words', () => {
    const lines = buildLines(words('one two three. four five six seven eight'), [], settings);
    expect(lines.map((l) => l.words.map((w) => w.text).join(' '))).toEqual(['one two three.', 'four five six seven', 'eight']);
  });
  it('parses SRT cues', () => {
    const r = parseCaptionFile('a.srt', '1\n00:00:01,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nBye\n', 10);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].start).toBe(1);
  });
  it('spreads words across a range', () => {
    const w = spreadWords('a bb ccc', 0, 3);
    expect(w[0].start).toBe(0);
    expect(w[2].end).toBeCloseTo(3);
  });
});

describe('keywords', () => {
  const ws = words('Have you ever gone to bed full of plans for the morning and woken up already behind? Every single morning you lose the same fight', 0.5);
  it('picks content words, not stop words', () => {
    const k = pickKeywords(ws, { ...defaultKeywordSettings(), density: 3 });
    expect(k.length).toBeGreaterThan(2);
    expect(k.every((x) => !['the', 'you', 'to', 'of', 'and'].includes(x.text.toLowerCase()))).toBe(true);
  });
  it('layout is deterministic for a seed and respects locks', () => {
    const s = defaultKeywordSettings();
    const picks = pickKeywords(ws, s);
    const a = layoutKeywords(picks, s, '16:9');
    const b = layoutKeywords(picks, s, '16:9');
    expect(a.map((k) => [k.x, k.font, k.color])).toEqual(b.map((k) => [k.x, k.font, k.color]));
    const locked = a.map((k, i) => (i === 0 ? { ...k, locked: true, x: 0.123 } : k));
    const c = layoutKeywords(locked, { ...s, seed: 99 }, '16:9', locked);
    expect(c[0].x).toBe(0.123);
    expect(a.every((k) => k.x >= 0 && k.x <= 1 && k.y >= 0 && k.y <= 1)).toBe(true);
  });
});

describe('splitScenes', () => {
  it('cuts scenes near the target length at sentence ends', () => {
    const sc = splitScenes(words('a b c d. e f g h i j. k l', 1), 4);
    expect(sc[0].text).toBe('a b c d.');
    expect(sc.length).toBeGreaterThanOrEqual(2);
  });
});
