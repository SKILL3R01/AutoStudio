/** Motion finishing: sound cues from the layers, chapter title cards between sections, thumbnail picks. */
import type { Project } from '../types';
import type { MotionGroup, MotionItem } from './types';
import type { DirectorState } from './director/director';
import { ensureTrack, newAudioClip } from '../lib/audiotracks';

export interface SoundCue { t: number; sound: string; volume: number; dur: number }
const DUR: Record<string, number> = { whoosh: 0.8, swoosh: 0.45, pop: 0.18, click: 0.05, impact: 0.9, riser: 2.2, chime: 2, shutter: 0.3, typing: 1, ding: 1.6, boom: 1.8 };

/** What a layer sounds like (synth SFX names from audio/sfx.ts) and when, relative to the layer start. */
function cuesOf(it: MotionItem): [number, string, number][] {
  const w = String(it.widget ?? '');
  if (it.type !== 'widget') return it.type === 'text' && /stomp|slam|punch/.test(String(it.in ?? '')) ? [[0, 'impact', 0.35]] : [];
  switch (w) {
    case 'wipe': case 'slices': case 'band-wipe': return [[0.15, 'swoosh', 0.5]];
    case 'burst': case 'speed-lines': return [[0, 'whoosh', 0.45]];
    case 'slam': return [[0, 'impact', 0.55]];
    case 'stat': case 'donut': case 'chart-line': case 'bars': case 'progress': return [[0.2, 'pop', 0.4]];
    case 'checklist': return (Array.isArray(it.items) ? it.items : []).slice(0, 6).map((_, i) => [0.45 + i * 0.35, 'click', 0.45] as [number, string, number]);
    case 'logo-reveal': return [[-1.4, 'riser', 0.35], [0.7, 'chime', 0.4]];
    case 'cutout': return [[0.05, 'shutter', 0.35]];
    case 'typing': case 'prompt-bar': return [[0.4, 'typing', 0.35]];
    case 'button': case 'cta-orb': return [[typeof it.press === 'number' ? it.press : it.dur * 0.6, 'click', 0.55]];
    case 'cursor': return (Array.isArray(it.points) ? it.points : []).flatMap((q, i, all) => (Array.isArray(q) && q[2] === 'click' ? [[(it.dur / all.length) * (i + 0.7), 'click', 0.5] as [number, string, number]] : []));
    case 'confetti': case 'sparkles': return [[Array.isArray(it.at) && typeof it.at[0] === 'number' ? it.at[0] : 0.2, 'chime', 0.25]];
    case 'plus-badge': return [[0.2, 'pop', 0.4]];
    case 'starburst': return [[0, 'boom', 0.3]];
    case 'kinetic': return [[0, 'pop', 0.3]];
    default: return [];
  }
}

/** All cues of the motion blocks (project time), thinned so two cues are at least 0.25 s apart (the louder wins). */
export function motionSoundCues(groups: MotionGroup[] = []): SoundCue[] {
  const all: SoundCue[] = [];
  for (const g of groups) {
    if (g.hidden) continue;
    for (const it of g.items)
      for (const [dt, sound, volume] of cuesOf(it)) {
        const t = g.start + it.start + dt;
        if (t >= 0 && t < g.start + g.dur) all.push({ t: Math.round(t * 100) / 100, sound, volume, dur: DUR[sound] ?? 0.6 });
      }
  }
  all.sort((a, b) => a.t - b.t);
  const out: SoundCue[] = [];
  for (const c of all) {
    const last = out[out.length - 1];
    if (last && c.t - last.t < 0.25) {
      if (c.volume > last.volume) out[out.length - 1] = c;
    } else out.push(c);
  }
  return out;
}

/** Replace the motion sound effects (clips with id `msfx_*`) on the SFX track. Returns how many were added. */
export function applyMotionSound(p: Project, level = 1): number {
  p.audio = p.audio.filter((c) => !c.id.startsWith('msfx_'));
  const cues = motionSoundCues(p.motion);
  if (!cues.length) return 0;
  const tid = ensureTrack(p, 'sfx');
  cues.forEach((c, i) => p.audio.push(newAudioClip(tid, '', c.t, c.dur, 'sfx', { id: `msfx_${i}_${Math.round(c.t * 100)}`, sound: c.sound, volume: Math.min(1, c.volume * level) })));
  return cues.length;
}

/** Chapter title cards (2 s, over the motion) at the start of every section after the first. */
export function applyChapterCards(p: Project, st: DirectorState, on: boolean) {
  p.motion = (p.motion ?? []).filter((g) => !g.id.startsWith('dir_ch'));
  if (!on) return 0;
  const pal = st.bible.palette;
  const paper = st.bible.backgrounds.includes('paper');
  const frame = p.export.aspect === '9:16' ? { w: 1080, h: 1920 } : p.export.aspect === '1:1' ? { w: 1080, h: 1080 } : p.export.aspect === '4:5' ? { w: 1080, h: 1350 } : { w: 1920, h: 1080 };
  st.sections.slice(1).forEach((s) => {
    const title = (s.title || `Part ${s.i + 1}`).replace(/^./, (c) => c.toUpperCase());
    const dur = Math.min(2.2, (s.end - s.start) * 0.3);
    const items: MotionItem[] = [
      { id: 'card', type: 'shape', shape: 'roundrect', w: Math.min(frame.w * 0.8, 1200), h: 300, radius: paper ? 4 : 36, color: paper ? '#fdfbf6' : pal.card, opacity: 0.94, start: 0, dur, in: 'pop', out: 'zoom-out', shadow: true },
      { id: 'tag', type: 'widget', widget: paper ? 'typewriter-tag' : 'tag', text: `PART ${s.i + 1}`, y: -80, start: 0.1, dur: dur - 0.1 },
      { id: 'title', type: 'text', text: title, size: 110, weight: 900, font: st.bible.font, color: paper ? '#1f1e1d' : pal.text, y: 40, width: Math.min(frame.w * 0.75, 1100), in: 'cinematic-rise', out: 'fade-out', start: 0.15, dur: dur - 0.15, highlight: [{ word: title.split(' ')[0], style: paper ? 'marker' : 'color', bg: '#ffe14a', gradient: ['#fbe3a6', '#e8b86a'], at: 0.4 }] },
    ];
    (p.motion ??= []).push({ id: `dir_ch${s.i}`, name: `Chapter ${s.i + 1}`, start: s.start, dur, placement: 'overlay', frame, palette: { ...pal }, items, idea: 'director:chapter' });
  });
  return st.sections.length - 1;
}

/** The two beats that make the best thumbnails: the hook, numbers, questions, strong headlines — from different sections. */
export function thumbnailPicks(st: DirectorState, n = 2) {
  const score = (b: DirectorState['beats'][number]) =>
    (b.section === 0 ? 3 : 0) + (b.hints.some((h) => h === 'number' || h === 'percent' || h === 'money') ? 2 : 0) + (b.hints.includes('question') ? 2 : 0)
    + (['stat', 'headline', 'slam', 'slam-cutout', 'kinetic', 'donut'].includes(b.layout) ? 1.5 : 0) + Math.min(2, b.keys.join('').length / 8) - (b.text.split(' ').length > 12 ? 1 : 0);
  const sorted = [...st.beats].sort((a, b) => score(b) - score(a));
  const out: typeof sorted = [];
  for (const b of sorted) if (!out.some((x) => x.section === b.section) && out.length < n) out.push(b);
  for (const b of sorted) if (out.length < n && !out.includes(b)) out.push(b);
  return out;
}
