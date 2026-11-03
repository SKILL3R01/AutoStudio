import { describe, expect, it } from 'vitest';
import { detectSilences, remapTime, speechRangesFromLevels, type Levels } from '../audio/silence';
import { cleanReply, parseJsonLoose } from './llm';
import { profileFor, type HardwareInfo } from './perf';
import { clipMotionXform } from '../render/motion';
import { effectAmount } from '../render/renderer';
import { toReviewItems, statuses } from '../editor/review';
import type { Clip } from '../types';

/** Levels with speech (-20 dB) everywhere except the given silent ranges (-70 dB), 10 ms frames. */
function levels(duration: number, silent: [number, number][]): Levels {
  const hop = 0.01, n = Math.round(duration / hop);
  const db = new Float32Array(n).fill(-20);
  for (const [a, b] of silent) for (let f = Math.round(a / hop); f < Math.round(b / hop); f++) db[f] = -70;
  return { hop, db, floor: -70, duration };
}

describe('silence detection', () => {
  const lv = levels(10, [[2, 3.5], [6, 6.3], [9, 10]]);
  it('finds pauses longer than the minimum, with padding', () => {
    const r = detectSilences(lv, { threshold: 'auto', minPause: 0.6, padding: 0.1 });
    expect(r).toHaveLength(2);
    expect(r[0].start).toBeCloseTo(2.1, 2);
    expect(r[0].end).toBeCloseTo(3.4, 2);
    // A trailing pause runs to the end of the file (no padding at the very end).
    expect(r[1].end).toBeCloseTo(10, 2);
  });
  it('speech ranges are the gaps between pauses', () => {
    const s = speechRangesFromLevels(lv, 0.35);
    expect(s.map((x) => [+x.start.toFixed(2), +x.end.toFixed(2)])).toEqual([[0, 2], [3.5, 9]]);
    // A 0.3 s gap is shorter than the 0.35 s minimum, so it stays speech; a lower minimum splits it.
    expect(speechRangesFromLevels(lv, 0.2)).toHaveLength(3);
  });
  it('remaps times after cuts and snaps times inside a cut', () => {
    const cuts = [{ start: 2, end: 3 }, { start: 5, end: 6 }];
    expect(remapTime(1, cuts)).toBe(1);
    expect(remapTime(2.5, cuts)).toBe(2);
    expect(remapTime(4, cuts)).toBe(3);
    expect(remapTime(8, cuts)).toBe(6);
  });
});

describe('LLM reply parsing', () => {
  it('handles fences, prose, think blocks and trailing commas', () => {
    expect(parseJsonLoose('Sure!\n```json\n[{"i":0}]\n```\nDone')).toEqual([{ i: 0 }]);
    expect(parseJsonLoose('Here: [{"from":1,"to":2},] hope it helps {x}')).toEqual([{ from: 1, to: 2 }]);
    expect(parseJsonLoose('Note [not json] then {"a":"b ] }"}')).toEqual({ a: 'b ] }' });
    expect(cleanReply('<think>hmm</think> Answer')).toBe('Answer');
    expect(cleanReply('<think>cut off mid-thought')).toBe('');
    expect(() => parseJsonLoose('no json here')).toThrow();
  });
});

describe('performance profile', () => {
  const hw = (p: Partial<HardwareInfo>): HardwareInfo => ({ ramGB: 16, cores: 8, cpu: '', gpu: 'Intel UHD', webgpu: true, source: 'desktop', ...p });
  it('picks low / medium / high', () => {
    expect(profileFor(hw({ ramGB: 8 }))).toBe('low');
    expect(profileFor(hw({ webgpu: false }))).toBe('low');
    expect(profileFor(hw({}))).toBe('medium');
    expect(profileFor(hw({ gpu: 'NVIDIA GeForce RTX 3060' }))).toBe('high');
  });
});

describe('custom motion and effect scope', () => {
  const clip = (o: Partial<Clip>): Clip => ({ id: 'c', assetId: 'a', start: 0, motion: 'custom', transition: 'none', transitionDuration: 0.5, ...o }) as Clip;
  it('interpolates custom framing, with reverse', () => {
    const c = clip({ motionCustom: { from: { scale: 1, x: 0, y: 0 }, to: { scale: 2, x: 0.2, y: 0 } }, motionEasing: 'linear' });
    expect(clipMotionXform(c, 'custom', 0.5, 1, 0.1, 0)).toEqual({ scale: 1.5, dx: 0.1, dy: 0 });
    expect(clipMotionXform({ ...c, motionReverse: true }, 'custom', 0, 0, 0.1, 0).scale).toBe(2);
  });
  it('applies effects only inside their scope, with fades', () => {
    const clips = [clip({ id: 'a', start: 0 }), clip({ id: 'b', start: 4 })];
    expect(effectAmount({ kind: 'grain', intensity: 1 }, 2, clips, 8)).toBe(1);
    const range = { kind: 'grain' as const, intensity: 1, scope: { kind: 'range' as const, start: 2, end: 4 }, fadeIn: 1 };
    expect(effectAmount(range, 1, clips, 8)).toBe(0);
    expect(effectAmount(range, 2.5, clips, 8)).toBeCloseTo(0.5);
    const onB = { kind: 'grain' as const, intensity: 1, scope: { kind: 'clips' as const, ids: ['b'] } };
    expect(effectAmount(onB, 2, clips, 8)).toBe(0);
    expect(effectAmount(onB, 5, clips, 8)).toBe(1);
  });
});

describe('sound files in the import review', () => {
  it('first audio is the voiceover, the rest music; audio never blocks', () => {
    const f = (name: string, type: string) => new File([new Uint8Array(4)], name, { type });
    const items = toReviewItems([f('voice.mp3', 'audio/mpeg'), f('bed.mp3', 'audio/mpeg'), f('0-03.png', 'image/png')]);
    const audio = items.filter((i) => i.kind === 'audio');
    // Rows are sorted by name: bed.mp3 comes first and becomes the voiceover.
    expect(audio.map((a) => [a.name, a.audioRole])).toEqual([['bed.mp3', 'voiceover'], ['voice.mp3', 'music']]);
    expect([...statuses(items, null).values()]).toEqual(['ok', 'ok', 'ok']);
    expect(toReviewItems([f('a.wav', 'audio/wav')], true)[0].audioRole).toBe('music');
  });
});
