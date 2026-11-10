import { describe, expect, it } from 'vitest';
import { chapterIssues, suggestChapters, youtubeChapters } from './chapters';

describe('chapters', () => {
  it('formats YouTube chapters from 0:00 and flags short / too few chapters', () => {
    const ch = [{ id: 'b', t: 75, title: 'Point one' }, { id: 'a', t: 2, title: 'Intro' }, { id: 'c', t: 3700, title: 'End' }];
    expect(youtubeChapters(ch)).toBe('0:00 Intro\n1:15 Point one\n1:01:40 End');
    expect(chapterIssues(ch, 3800)).toEqual([]);
    expect(chapterIssues(ch.slice(0, 2), 80)).toEqual(['YouTube needs at least 3 chapters', '“Point one” is shorter than 10 s']);
  });
  it('suggests chapters at sentence starts, the first one called Intro at 0', () => {
    const words = Array.from({ length: 120 }, (_, i) => ({ text: i % 10 === 9 ? `word${i}.` : `word${i}`, start: i * 2, end: i * 2 + 1 }));
    const ch = suggestChapters(words, 240, 4);
    expect(ch[0]).toMatchObject({ t: 0, title: 'Intro' });
    expect(ch.length).toBe(4);
    for (const c of ch.slice(1)) expect(words.find((w) => w.start === c.t)!.text).toMatch(/^word\d*0$/);
  });
});
