/** v3.9 chapters on the ruler: suggestions from the transcript and YouTube chapter text. */
import type { Project, Word } from '../types';
import { uid } from './util';

export interface Chapter { id: string; t: number; title: string }

export const fmtChapter = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

/** YouTube chapter lines; the first chapter is moved to 0:00 as YouTube requires. */
export function youtubeChapters(ch: Chapter[]): string {
  const list = [...ch].sort((a, b) => a.t - b.t);
  if (!list.length) return '';
  return list.map((c, i) => `${fmtChapter(i === 0 ? 0 : c.t)} ${c.title}`).join('\n');
}

/** Problems YouTube would reject: fewer than 3 chapters or any shorter than 10 s. */
export function chapterIssues(ch: Chapter[], length: number): string[] {
  const list = [...ch].sort((a, b) => a.t - b.t);
  const out: string[] = [];
  if (list.length < 3) out.push('YouTube needs at least 3 chapters');
  list.forEach((c, i) => {
    const end = i + 1 < list.length ? list[i + 1].t : length;
    if (end - (i === 0 ? 0 : c.t) < 10) out.push(`“${c.title}” is shorter than 10 s`);
  });
  return out;
}

/** Split the narration into about `n` sections at sentence starts; titles are the first words of each section. */
export function suggestChapters(words: Word[], length: number, n = Math.max(3, Math.min(8, Math.round(length / 60)))): Chapter[] {
  if (!words.length) return [];
  const starts = words.filter((_w, i) => i === 0 || /[.!?]["”’)]?$/.test(words[i - 1].text));
  const out: Chapter[] = [];
  for (let k = 0; k < n; k++) {
    const want = (k * length) / n;
    const s = starts.reduce((best, w) => (Math.abs(w.start - want) < Math.abs(best.start - want) ? w : best), starts[0]);
    if (out.some((c) => Math.abs(c.t - s.start) < 10)) continue;
    const i = words.indexOf(s);
    const title = words.slice(i, i + 5).map((w) => w.text.replace(/[.,!?;:]+$/, '')).join(' ');
    out.push({ id: uid(), t: k === 0 ? 0 : s.start, title: k === 0 ? 'Intro' : title.charAt(0).toUpperCase() + title.slice(1) });
  }
  return out;
}

export const chaptersOf = (p: Project) => [...(p.chapters ?? [])].sort((a, b) => a.t - b.t);
