/** Motion Director · conversation prompts, applying section answers, variety enforcement and assembly checks. */
import type { MotionGroup, MotionItem } from '../types';
import type { Project } from '../../types';
import { buildMotionPrompt } from '../prompt';
import { recipeToGroup } from '../recipe';
import type { DBeat, DSection } from './analyze';
import { templateSection, type StyleBible } from './templates';
import type { UserPack } from '../packs/importer';

export interface DirectorState {
  style: string;
  sectionLen: number;
  bible: StyleBible;
  beats: DBeat[];
  sections: DSection[];
  /** Per section: where its layers came from. */
  status: ('empty' | 'template' | 'ai' | 'locked')[];
  createdAt: number;
}

const fmt = (t: number) => t.toFixed(2);
const beatLine = (b: DBeat, t0: number) => `B${b.i + 1} ${fmt(b.start - t0)}–${fmt(b.end - t0)} s [${b.layout}${b.note ? ` · ${b.note}` : ''}] “${b.text}”${b.keys.length ? ` key: ${b.keys.join(', ')}` : ''}`;
const wordLine = (b: DBeat, t0: number) => b.words.map((w) => `${fmt(w.t - t0)} ${w.w}`).join(' ');

/** The bible as prompt text (same for every section, so the look never drifts). */
export const bibleText = (b: StyleBible) => `STYLE BIBLE (locked for the whole video — every section uses it):
- palette: ${JSON.stringify(b.palette)}
- background moods (cycle them per beat): ${b.moods.map((m) => m.join(' + ')).join(' · ')}; background kinds: ${b.backgrounds.join(', ')}
- font: ${b.font}; key words: gold gradient / marker on the spoken key word
- motif: ${b.motif}
- transitions (rotate, never the same twice in a row): ${b.transitions.join(', ')}
- every beat has a slow camera push (zoom 1 → 1.05); nothing static for more than 1 s`;

/** First message of the conversation: the full contract + bible + whole storyboard + section 1. */
export function firstMessage(st: DirectorState, p: Project, userPack?: UserPack): string {
  const total = st.sections[st.sections.length - 1]?.end ?? 0;
  const contract = buildMotionPrompt({ idea: `A ${Math.round(total / 60)}-minute pure motion-graphics video for my voiceover. I send it SECTION BY SECTION in this chat; you answer each section with ONE recipe.`, placement: 'full', aspect: p.export.aspect, length: 'auto', style: st.style, language: 'auto', userPack, assets: (p.assets ?? []).filter((a) => a.kind === 'image').slice(0, 40).map((a) => a.name) });
  const board = st.sections.map((s) => `SECTION ${s.i + 1} (${fmt(s.start)}–${fmt(s.end)} s, mood ${s.mood}${s.title ? `, “${s.title}”` : ''})\n` + st.beats.filter((b) => b.section === s.i).map((b) => '  ' + beatLine(b, 0)).join('\n')).join('\n');
  return `${contract}

${bibleText(st.bible)}

STORYBOARD of the whole video (times from the video start; the [layout] is a suggestion — you may choose a better widget, but keep one idea per beat and the timing):
${board}

RULES FOR EVERY SECTION ANSWER:
- ONE JSON recipe per answer, for that section only. "start" times are seconds FROM THE SECTION START (the first beat starts near 0).
- Cover the whole section: one background per beat, the beat's main visual, its key word landing ON the spoken word (use the word timings), and a transition into the next beat starting 0.5 s before it.
- Never the same layout or transition twice in a row; keep the style bible.

${sectionMessage(st, 0, true)}`;
}

/** Message for one section (short: the chat already knows the contract and the bible). */
export function sectionMessage(st: DirectorState, i: number, inFirst = false): string {
  const s = st.sections[i];
  if (!s) return '';
  const own = st.beats.filter((b) => b.section === i);
  const prev = st.beats.filter((b) => b.section === i - 1).slice(-1)[0];
  return `${inFirst ? 'NOW ' : ''}SECTION ${i + 1} of ${st.sections.length} — ${fmt(s.end - s.start)} s long, mood ${s.mood}. Times below are FROM THE SECTION START.
${prev ? `It continues from: “${prev.text}” (${prev.layout}).\n` : ''}Beats:
${own.map((b) => beatLine(b, s.start)).join('\n')}
Spoken words (time word):
${own.map((b) => `B${b.i + 1}: ${wordLine(b, s.start)}`).join('\n')}
${i === st.sections.length - 1 ? 'This is the LAST section: end on a strong final beat (logo / statement / call to action).' : 'End with a transition into the next section.'}
Answer with ONE JSON object only.`;
}

/** Ask the chat to redo one section (keeps the bible and the timing). */
export function redoMessage(st: DirectorState, i: number, how: 'stronger' | 'simpler' | 'different' | string): string {
  const ask = how === 'stronger' ? 'make it STRONGER: more depth (layers, light, camera), bolder key words, something changing every 0.5–1 s'
    : how === 'simpler' ? 'make it SIMPLER: fewer layers, bigger and calmer type, more breathing room, one visual per beat'
    : how === 'different' ? 'use DIFFERENT layouts and transitions for every beat than in your last answer'
    : how;
  return `Redo SECTION ${i + 1} of ${st.sections.length}: ${ask}. Same style bible, same beat timings (from the section start), same spoken words.
${sectionMessage(st, i)}`;
}

/** Stateless prompt for the local assistant (it has no chat memory): contract + bible + this section. */
export function localPrompt(st: DirectorState, i: number, p: Project, userPack?: UserPack): string {
  const contract = buildMotionPrompt({ idea: `Section ${i + 1} of a long pure motion-graphics video for my voiceover.`, placement: 'full', aspect: p.export.aspect, length: String(Math.round(st.sections[i].end - st.sections[i].start)), style: st.style, language: 'auto', userPack });
  return `${contract}\n\n${bibleText(st.bible)}\n\n${sectionMessage(st, i)}`;
}

/** The Motion block of a section (one block per section, tagged). */
export const sectionGroupId = (i: number) => `dir_s${i}`;
export function sectionGroup(p: Project, st: DirectorState, i: number, items: MotionItem[], source: 'template' | 'ai'): MotionGroup {
  const s = st.sections[i];
  const frame = p.export.aspect === '9:16' ? { w: 1080, h: 1920 } : p.export.aspect === '1:1' ? { w: 1080, h: 1080 } : p.export.aspect === '4:5' ? { w: 1080, h: 1350 } : { w: 1920, h: 1080 };
  return { id: sectionGroupId(i), name: `${source === 'ai' ? '✦' : '▢'} ${i + 1}. ${s.title || 'Section'}`, start: s.start, dur: s.end - s.start, placement: 'full', frame, palette: { ...st.bible.palette }, items, idea: `director:${source}` };
}

/** Put a section's block into the project (replacing the previous one). */
export function placeSection(p: Project, g: MotionGroup) {
  p.motion = [...(p.motion ?? []).filter((x) => x.id !== g.id), g].sort((a, b) => a.start - b.start);
}

/** Fill sections from templates (all, or only the empty / template ones). */
export function fillTemplates(p: Project, st: DirectorState, only?: number[]) {
  st.sections.forEach((s, i) => {
    if (only && !only.includes(i)) return;
    if (st.status[i] === 'locked' || st.status[i] === 'ai') return;
    placeSection(p, sectionGroup(p, st, i, templateSection(st.beats, s, st.bible, (p.assets ?? []).filter((a) => a.kind === 'image').map((a) => a.id)), 'template'));
    st.status[i] = 'template';
  });
}

/** Read a pasted / generated answer for section i; returns the report for the UI. */
export function applySectionAnswer(p: Project, st: DirectorState, i: number, raw: string) {
  const s = st.sections[i];
  const r = recipeToGroup(raw, s.start, 'full', '');
  if (!r.group) return { ok: false as const, report: r.report, warnings: r.warnings, fixes: [] as string[] };
  let items = r.group.items;
  // Answers sometimes use video times instead of section times: shift them back.
  const minStart = Math.min(...items.map((x) => x.start));
  if (minStart > (s.end - s.start) * 0.6 && minStart >= s.start - 1) items = items.map((x) => ({ ...x, start: x.start - s.start }));
  // Clip to the section length.
  const len = s.end - s.start;
  items = items.filter((x) => x.start < len).map((x) => (x.start + x.dur > len ? { ...x, dur: len - x.start } : x));
  const fixes = enforceVariety(items, st.bible);
  const g = sectionGroup(p, st, i, items, 'ai');
  if (r.group.palette) g.palette = { ...st.bible.palette, ...r.group.palette };
  placeSection(p, g);
  st.status[i] = 'ai';
  return { ok: true as const, report: r.report, warnings: [...r.warnings, ...coverageGaps(items, len).map((gp) => `no background ${gp[0].toFixed(1)}–${gp[1].toFixed(1)} s`)], fixes };
}

/** No transition widget twice in a row and no background kind three times in a row (fixed in place). Returns what changed. */
export function enforceVariety(items: MotionItem[], bible: StyleBible): string[] {
  const fixes: string[] = [];
  const TR = new Set(['wipe', 'burst', 'slices', 'band-wipe']);
  const trs = items.filter((x) => x.type === 'widget' && TR.has(String(x.widget))).sort((a, b) => a.start - b.start);
  const pool = bible.transitions.filter((t) => TR.has(t));
  for (let j = 1; j < trs.length; j++)
    if (trs[j].widget === trs[j - 1].widget) {
      const alt = (pool.length ? pool : [...TR]).find((t) => t !== trs[j - 1].widget && t !== trs[j + 1]?.widget) ?? 'wipe';
      fixes.push(`transition at ${trs[j].start.toFixed(1)} s: ${trs[j].widget} → ${alt}`);
      trs[j].widget = alt;
    }
  const bgs = items.filter((x) => x.type === 'background').sort((a, b) => a.start - b.start);
  for (let j = 2; j < bgs.length; j++)
    if (bgs[j].kind === bgs[j - 1].kind && bgs[j].kind === bgs[j - 2].kind && bible.backgrounds.length > 1) {
      const alt = bible.backgrounds.find((k) => k !== bgs[j].kind)!;
      fixes.push(`background at ${bgs[j].start.toFixed(1)} s: ${bgs[j].kind} → ${alt}`);
      bgs[j].kind = alt;
    }
  return fixes;
}

/** Time ranges of a section (0 … len) with no background (a hole in a pure-motion video). */
export function coverageGaps(items: MotionItem[], len: number): [number, number][] {
  const r = items.filter((x) => x.type === 'background').map((x) => [x.start, x.start + x.dur] as [number, number]).sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let t = 0;
  for (const [a, b] of r) {
    if (a > t + 0.2) gaps.push([t, a]);
    t = Math.max(t, b);
  }
  if (len > t + 0.2) gaps.push([t, len]);
  return gaps;
}

/** Whole-video checks: holes, texts too long, too many texts at once, layers outside the frame. */
export function directorChecks(p: Project, st: DirectorState): string[] {
  const out: string[] = [];
  st.sections.forEach((s, i) => {
    const g = p.motion?.find((x) => x.id === sectionGroupId(i));
    if (!g) return void out.push(`Section ${i + 1} is empty`);
    if (g.hidden) out.push(`Section ${i + 1} is hidden`);
    for (const [a, b] of coverageGaps(g.items, g.dur)) out.push(`Section ${i + 1}: nothing behind ${(s.start + a).toFixed(1)}–${(s.start + b).toFixed(1)} s`);
    for (const it of g.items) {
      const txt = String(it.text ?? it.title ?? '');
      if (txt.split(/\s+/).length > 14) out.push(`Section ${i + 1}: long text at ${(s.start + it.start).toFixed(1)} s (“${txt.slice(0, 30)}…”)`);
      if (Math.abs(it.x ?? 0) > g.frame.w * 0.5 || Math.abs(it.y ?? 0) > g.frame.h * 0.5) out.push(`Section ${i + 1}: a ${it.type} at ${(s.start + it.start).toFixed(1)} s is outside the frame`);
    }
    for (let t = 0; t < g.dur; t += 0.5) {
      const texts = g.items.filter((it) => (it.type === 'text' || ['headline', 'kinetic', 'slam', 'say'].includes(String(it.widget))) && t >= it.start && t < it.start + it.dur).length;
      if (texts > 2) {
        out.push(`Section ${i + 1}: ${texts} headlines at once around ${(s.start + t).toFixed(1)} s`);
        break;
      }
    }
  });
  return out;
}
