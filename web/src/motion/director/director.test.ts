import { describe, expect, it } from 'vitest';
import { analyzeVoice, hintsOf, makeBeats, type DWord } from './analyze';
import { assignLayouts, makeBible } from './templates';
import { applySectionAnswer, coverageGaps, directorChecks, enforceVariety, fillTemplates, firstMessage, sectionMessage, type DirectorState } from './director';
import type { Project } from '../../types';

/** A fake narration: n sentences of ~8 words at 2.6 words / s with short pauses. */
function narration(n: number): DWord[] {
  const out: DWord[] = [];
  const sentences = ['Most people wake up already tired every single morning.', 'Forty percent of us check the phone first.', 'Coffee, emails, and notifications fill the first hour.', 'But what if the morning worked for you instead?', 'In 2019 a study followed three thousand people.', 'Their energy grew by thirty percent in a month.'];
  let t = 0.3;
  for (let i = 0; i < n; i++) {
    for (const w of sentences[i % sentences.length].split(' ')) out.push({ w, t, end: (t += 0.38) - 0.04 });
    t += 0.5;
  }
  return out;
}
const project = () => ({ export: { aspect: '16:9' }, motion: [] }) as unknown as Project;

function setup(n = 60, style = 'dark') {
  const { beats, sections } = analyzeVoice(narration(n), 55);
  const bible = makeBible(style);
  assignLayouts(beats, sections, bible);
  const st: DirectorState = { style, sectionLen: 55, bible, beats, sections, status: sections.map(() => 'empty'), createdAt: 0 };
  return st;
}

describe('voice analysis', () => {
  it('finds hints', () => {
    expect(hintsOf('Forty percent of us')).toContain('percent');
    expect(hintsOf('In 2019 a study')).toContain('date');
    expect(hintsOf('But what if instead?')).toEqual(expect.arrayContaining(['compare', 'question']));
    expect(hintsOf('Coffee, emails, and notifications')).toContain('list');
  });
  it('beats are 1.8–5 s and cover the voice without gaps', () => {
    const ws = narration(30), beats = makeBeats(ws);
    for (const b of beats) expect(b.end - b.start).toBeLessThan(5.2);
    for (let i = 1; i < beats.length; i++) expect(beats[i].start).toBeCloseTo(beats[i - 1].end, 5);
    expect(beats.length).toBeGreaterThan(20);
  });
  it('a 10-minute voice becomes ~11 sections of about a minute', () => {
    const st = setup(170);
    const total = st.sections[st.sections.length - 1].end;
    expect(total).toBeGreaterThan(540);
    expect(st.sections.length).toBeGreaterThanOrEqual(8);
    expect(st.sections.length).toBeLessThanOrEqual(14);
    for (const s of st.sections.slice(0, -1)) expect(s.end - s.start).toBeGreaterThan(35);
    expect(st.sections[0].mood).toBe('hook');
  });
});

describe('storyboard + templates', () => {
  it('never repeats a layout within 3 beats', () => {
    const st = setup(60);
    const ls = st.beats.map((b) => b.layout);
    for (let i = 1; i < ls.length; i++) expect(ls.slice(Math.max(0, i - 3), i)).not.toContain(ls[i]);
    expect(new Set(ls).size).toBeGreaterThan(5);
  });
  it('template sections are complete (no holes) for both styles', () => {
    for (const style of ['dark', 'pack:paper-explainer']) {
      const st = setup(40, style);
      const p = project();
      fillTemplates(p, st);
      expect(p.motion).toHaveLength(st.sections.length);
      for (const g of p.motion!) expect(coverageGaps(g.items, g.dur)).toEqual([]);
      expect(directorChecks(p, st).filter((c) => /nothing behind|empty|outside/.test(c))).toEqual([]);
    }
  });
});

describe('conversation + answers', () => {
  it('first message has the contract, bible and storyboard; later ones are short', () => {
    const st = setup(60), p = project();
    const first = firstMessage(st, p), second = sectionMessage(st, 1);
    expect(first).toMatch(/STYLE BIBLE/);
    expect(first).toMatch(/STORYBOARD/);
    expect(first).toMatch(/NOW SECTION 1 of/);
    expect(second).toMatch(/SECTION 2 of/);
    expect(second.length).toBeLessThan(first.length / 3);
  });
  it('applies an answer (also when it used video times) and fixes repeated transitions', () => {
    const st = setup(60), p = project();
    fillTemplates(p, st);
    const s = st.sections[1];
    const raw = JSON.stringify({ palette: 'dark', items: [
      { type: 'background', kind: 'flat', colors: ['#111'], start: s.start, dur: 30 },
      { type: 'background', kind: 'flat', colors: ['#222'], start: s.start + 30, dur: s.end - s.start - 30 },
      { type: 'widget', id: 'wipe', start: s.start + 10, dur: 1 },
      { type: 'widget', id: 'wipe', start: s.start + 20, dur: 1 },
    ] });
    const r = applySectionAnswer(p, st, 1, raw);
    expect(r.ok).toBe(true);
    const g = p.motion!.find((x) => x.id === 'dir_s1')!;
    expect(g.items[0].start).toBe(0);
    expect(r.fixes.length).toBe(1);
    expect(st.status[1]).toBe('ai');
    expect(p.motion).toHaveLength(st.sections.length);
  });
  it('enforceVariety leaves good sequences alone', () => {
    const st = setup(10);
    expect(enforceVariety([{ id: 'a', type: 'widget', widget: 'wipe', start: 1, dur: 1 }, { id: 'b', type: 'widget', widget: 'burst', start: 4, dur: 1 }], st.bible)).toEqual([]);
  });
});
