import { describe, expect, it } from 'vitest';
import { applyChapterCards, applyMotionSound, motionSoundCues, thumbnailPicks } from './finish';
import { analyzeVoice, type DWord } from './director/analyze';
import { assignLayouts, makeBible } from './director/templates';
import { fillTemplates, type DirectorState } from './director/director';
import { timeLeft } from '../export/exporter';
import type { Project } from '../types';
import type { MotionGroup } from './types';

const words = (n: number): DWord[] => {
  const out: DWord[] = [];
  let t = 0.3;
  const s = ['Forty percent of us check the phone first.', 'Coffee, emails, and notifications fill the first hour.', 'Why does the morning feel so hard?', 'In 2019 a study followed three thousand people.'];
  for (let i = 0; i < n; i++) {
    for (const w of s[i % s.length].split(' ')) out.push({ w, t, end: (t += 0.38) - 0.04 });
    t += 0.5;
  }
  return out;
};
function project(): { p: Project; st: DirectorState } {
  const { beats, sections } = analyzeVoice(words(60), 45);
  const bible = makeBible('dark');
  assignLayouts(beats, sections, bible);
  const st: DirectorState = { style: 'dark', sectionLen: 45, bible, beats, sections, status: sections.map(() => 'empty'), createdAt: 0 };
  const p = { export: { aspect: '16:9' }, motion: [], audio: [], audioTracks: [{ id: 'trk_sfx', kind: 'sfx', name: 'SFX' }], assets: [] } as unknown as Project;
  fillTemplates(p, st);
  return { p, st };
}

describe('motion finishing', () => {
  it('sound cues follow transitions and headlines, at least 0.25 s apart', () => {
    const g = { id: 'g', start: 10, dur: 6, hidden: false, items: [
      { id: 'a', type: 'widget', widget: 'wipe', start: 2, dur: 1 },
      { id: 'b', type: 'widget', widget: 'slam', start: 2.2, dur: 2 },
      { id: 'c', type: 'widget', widget: 'checklist', start: 3, dur: 3, items: ['a', 'b'] },
    ] } as unknown as MotionGroup;
    const cues = motionSoundCues([g]);
    expect(cues[0]).toMatchObject({ t: 12.2, sound: 'impact' });
    for (let i = 1; i < cues.length; i++) expect(cues[i].t - cues[i - 1].t).toBeGreaterThanOrEqual(0.25);
    expect(cues.some((c) => c.sound === 'click')).toBe(true);
  });
  it('places SFX clips once (re-running replaces them) and adds chapter cards', () => {
    const { p, st } = project();
    const n = applyMotionSound(p);
    expect(n).toBeGreaterThan(5);
    applyMotionSound(p);
    expect(p.audio.filter((c) => c.id.startsWith('msfx_'))).toHaveLength(n);
    expect(applyChapterCards(p, st, true)).toBe(st.sections.length - 1);
    expect(p.motion!.filter((g) => g.id.startsWith('dir_ch'))).toHaveLength(st.sections.length - 1);
    applyChapterCards(p, st, false);
    expect(p.motion!.some((g) => g.id.startsWith('dir_ch'))).toBe(false);
  });
  it('thumbnail picks come from different sections and start with the hook', () => {
    const { st } = project();
    const picks = thumbnailPicks(st);
    expect(picks).toHaveLength(2);
    expect(picks[0].section).not.toBe(picks[1].section);
  });
  it('formats time left', () => {
    expect(timeLeft(0)).toBe('estimating…');
    expect(timeLeft(42)).toBe('42 s left');
    expect(timeLeft(1260)).toBe('about 21 min left');
  });
});
