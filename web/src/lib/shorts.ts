/** v3.3 "Make Shorts version": copy a time range of a long video into a linked vertical project. */
import type { Project, Word } from '../types';
import { clipEnd } from '../store';
import { uid } from './util';

/** Copy everything inside [a, b) into a new 9:16 project starting at 0 (media is shared, edits are separate). */
export function extractRange(p: Project, a: number, b: number): Project {
  const q = structuredClone(p);
  const dur = b - a;
  const inside = (s: number, e: number) => e > a + 0.01 && s < b - 0.01;
  const cut = <T extends { start: number; duration: number; trimIn?: number }>(x: T): T => {
    const s = Math.max(a, x.start), e = Math.min(b, x.start + x.duration);
    const r = { ...x, start: s - a, duration: e - s };
    if (x.trimIn !== undefined) r.trimIn = x.trimIn + (s - x.start);
    return r;
  };
  // Main track: clips overlapping the range, the first one starting at 0 (video trimmed to match).
  const clips = p.clips.map((c, i) => ({ c, s: i === 0 ? 0 : c.start, e: clipEnd(p, i) })).filter(({ s, e }) => inside(s, e));
  q.clips = clips.map(({ c, s }, k) => {
    const isVideo = p.assets.find((x) => x.id === c.assetId)?.kind === 'video';
    const from = Math.max(a, s);
    return { ...structuredClone(c), id: uid(), start: k === 0 ? 0 : from - a, trimIn: isVideo ? c.trimIn + (from - s) * (c.speed ?? 1) : c.trimIn, transition: k === 0 ? 'none' : c.transition };
  });
  q.length = q.clips.length ? dur : 0;
  q.audio = p.audio.filter((c) => inside(c.start, c.start + c.duration)).map((c) => ({ ...cut(c), id: uid(), fadeIn: c.start < a ? 0.15 : c.fadeIn, fadeOut: c.start + c.duration > b ? 0.3 : c.fadeOut }));
  q.pips = p.pips.filter((c) => inside(c.start, c.start + c.duration)).map((c) => ({ ...cut(c), id: uid() }));
  q.overlays = p.overlays.filter((o) => inside(o.start, o.start + o.duration)).map((o) => ({ ...cut(o), id: uid() }));
  const shiftW = <T extends { start: number; end: number }>(w: T): T => ({ ...w, start: w.start - a, end: w.end - a });
  q.words = p.words.filter((w) => w.start >= a && w.end <= b + 0.05).map(shiftW);
  q.lines = p.lines.filter((l) => l.start >= a && l.end <= b + 0.05).map((l) => ({ ...shiftW(l), words: l.words.map(shiftW) }));
  q.typo = p.typo.filter((t) => t.start >= a && t.end <= b + 0.05).map((t) => ({ ...shiftW(t), id: uid(), words: t.words.map(shiftW) }));
  q.effects = p.effects.map((e) => (e.scope?.kind === 'range' ? { ...e, scope: { ...e.scope, start: Math.max(0, e.scope.start - a), end: Math.min(dur, e.scope.end - a) } } : e)).filter((e) => e.scope?.kind !== 'range' || e.scope.end > e.scope.start);
  q.id = 'p_' + uid();
  q.name = `${p.name} · Short`;
  q.createdAt = q.updatedAt = Date.now();
  q.export = { ...q.export, aspect: '9:16' };
  q.sourceProjectId = p.id;
  q.sourceRange = [a, b];
  q.wizardStep = undefined;
  return q;
}

const HOOK = /^(why|how|what|the secret|never|stop|imagine|did you|here'?s|this is|most people|nobody|everyone|you)\b/i;

/** Suggest 15–60 s moments that start and end on sentence boundaries; strong openings and numbers score higher. */
export function suggestMoments(words: Word[], max = 3, min = 15, maxLen = 60): { start: number; end: number; text: string; score: number }[] {
  const sents: { start: number; end: number; text: string }[] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?]["”’)]?$/.test(w.text) || w === words[words.length - 1]) {
      sents.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((x) => x.text).join(' ') });
      cur = [];
    }
  }
  const cands: { start: number; end: number; text: string; score: number }[] = [];
  for (let i = 0; i < sents.length; i++) {
    let text = '';
    for (let j = i; j < sents.length; j++) {
      text += (text ? ' ' : '') + sents[j].text;
      const len = sents[j].end - sents[i].start;
      if (len > maxLen) break;
      if (len < min) continue;
      let score = 0;
      if (HOOK.test(sents[i].text)) score += 3;
      if (/\?/.test(sents[i].text)) score += 2;
      score += Math.min(3, (text.match(/\d+/g) ?? []).length);
      if (/!/.test(text)) score += 1;
      score += 1 - Math.abs(len - 35) / 35;
      cands.push({ start: sents[i].start, end: sents[j].end, text, score });
    }
  }
  const out: typeof cands = [];
  for (const c of cands.sort((x, y) => y.score - x.score)) {
    if (out.length >= max) break;
    if (out.some((o) => c.start < o.end && c.end > o.start)) continue;
    out.push(c);
  }
  return out.sort((x, y) => x.start - y.start);
}
