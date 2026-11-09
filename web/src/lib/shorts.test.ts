import { describe, expect, it } from 'vitest';
import { newProject } from './project';
import { newAudioClip, TRACK_IDS } from './audiotracks';
import { extractRange, suggestMoments } from './shorts';
import { defaultClip } from './project';

describe('Make Shorts version', () => {
  it('copies the range shifted to 0, trims clips / audio / captions, and links to the original', () => {
    const p = newProject();
    p.assets = [{ id: 'v', kind: 'video', name: 'v', mime: '', duration: 60 }, { id: 'vo', kind: 'audio', name: 'vo', mime: '', duration: 60 }];
    p.clips = [{ ...defaultClip('v', 0), id: 'a' }, { ...defaultClip('v', 20), id: 'b', trimIn: 5 }];
    p.length = 60;
    p.audio = [newAudioClip(TRACK_IDS.voice, 'vo', 0, 60, 'voice')];
    p.words = [{ text: 'early', start: 5, end: 5.5 }, { text: 'inside', start: 16, end: 16.4 }, { text: 'late', start: 50, end: 50.5 }];
    const q = extractRange(p, 15, 45);
    expect(q.export.aspect).toBe('9:16');
    expect(q.sourceProjectId).toBe(p.id);
    expect(q.clips.map((c) => [c.start, c.trimIn])).toEqual([[0, 15], [5, 5]]);
    expect(q.length).toBe(30);
    expect(q.audio.map((c) => [c.start, c.duration, c.trimIn])).toEqual([[0, 30, 15]]);
    expect(q.words.map((w) => [w.text, w.start])).toEqual([['inside', 1]]);
    expect(p.clips).toHaveLength(2);
  });
  it('suggests moments on sentence boundaries, preferring strong openings', () => {
    const say = (text: string, t0: number) => text.split(' ').map((w, i) => ({ text: w, start: t0 + i * 0.5, end: t0 + i * 0.5 + 0.4 }));
    const words = [...say('This is a slow and gentle start to our story today.', 0), ...say('Nothing much happens here at all for a long while really.', 10), ...say('Why do 9 out of 10 people fail at this?', 40), ...say('Because they skip the one step that matters most every single time.', 50)];
    const m = suggestMoments(words, 1);
    expect(m[0].text.startsWith('Why')).toBe(true);
    expect(m[0].end - m[0].start).toBeGreaterThanOrEqual(15);
  });
});
