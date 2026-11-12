/** Motion finishing: sound cues from the layers, chapter title cards between sections, thumbnail picks. */
import type { Project } from '../types';
import type { MotionGroup, MotionItem, MotionPalette } from './types';
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

/** Chapter title cards (2 s, over the motion) at every chapter of the ruler after the first. */
export function applyChapterCards(p: Project, on: boolean, look: { palette: MotionPalette; font: string; paper: boolean }) {
  p.motion = (p.motion ?? []).filter((g) => !g.id.startsWith('dir_ch'));
  const chapters = [...(p.chapters ?? [])].sort((a, b) => a.t - b.t).filter((c) => c.t > 0.5);
  if (!on || !chapters.length) return 0;
  const { palette: pal, font, paper } = look;
  const frame = p.export.aspect === '9:16' ? { w: 1080, h: 1920 } : p.export.aspect === '1:1' ? { w: 1080, h: 1080 } : p.export.aspect === '4:5' ? { w: 1080, h: 1350 } : { w: 1920, h: 1080 };
  chapters.forEach((ch, i) => {
    const title = ch.title.replace(/^./, (c) => c.toUpperCase());
    const dur = 2.2;
    const items: MotionItem[] = [
      { id: 'card', type: 'shape', shape: 'roundrect', w: Math.min(frame.w * 0.8, 1200), h: 300, radius: paper ? 4 : 36, color: paper ? '#fdfbf6' : pal.card, opacity: 0.94, start: 0, dur, in: 'pop', out: 'zoom-out', shadow: true },
      { id: 'tag', type: 'widget', widget: paper ? 'typewriter-tag' : 'tag', text: `PART ${i + 2}`, y: -80, start: 0.1, dur: dur - 0.1 },
      { id: 'title', type: 'text', text: title, size: 110, weight: 900, font, color: paper ? '#1f1e1d' : pal.text, y: 40, width: Math.min(frame.w * 0.75, 1100), in: 'cinematic-rise', out: 'fade-out', start: 0.15, dur: dur - 0.15, highlight: [{ word: title.split(' ')[0], style: paper ? 'marker' : 'color', bg: '#ffe14a', gradient: ['#fbe3a6', '#e8b86a'], at: 0.4 }] },
    ];
    (p.motion ??= []).push({ id: `dir_ch${i}`, name: `Chapter ${i + 2}`, start: ch.t, dur, placement: 'overlay', frame, palette: { ...pal }, items, idea: 'story:chapter' });
  });
  return chapters.length;
}

export interface ThumbBeat { start: number; end: number; text: string; hints: string[]; keys: string[]; layout: string; group: number }
/** The two moments that make the best thumbnails: the hook, numbers, questions, strong headlines — far apart. */
export function thumbnailPicks(beats: ThumbBeat[], n = 2): ThumbBeat[] {
  const score = (b: ThumbBeat, i: number) => (i < 3 ? 3 : 0) + (b.hints.some((h) => h === 'number' || h === 'percent' || h === 'money') ? 2 : 0) + (b.hints.includes('question') ? 2 : 0)
    + (/stat|number|headline|slam|kinetic|donut|counter/.test(b.layout) ? 1.5 : 0) + Math.min(2, b.keys.join('').length / 8) - (b.text.split(' ').length > 12 ? 1 : 0);
  const sorted = beats.map((b, i) => ({ b, s: score(b, i) })).sort((a, c) => c.s - a.s).map((x) => x.b);
  const out: ThumbBeat[] = [];
  for (const b of sorted) if (out.length < n && !out.some((x) => x.group === b.group)) out.push(b);
  for (const b of sorted) if (out.length < n && !out.includes(b)) out.push(b);
  return out;
}
