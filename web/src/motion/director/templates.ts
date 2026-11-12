/**
 * Motion Director · style bible, storyboard layouts with variety rules, and the template fallback that turns every beat
 * into motion layers without any AI (so a long video is always complete).
 */
import type { MotionItem, MotionPalette } from '../types';
import { PALETTES } from '../recipe';
import { PAPER_PACK } from '../packs/paper';
import { iconName } from '../render';
import type { DBeat, DSection } from './analyze';

export interface StyleBible {
  style: string;
  palette: MotionPalette;
  /** Background colours per mood (problem / solution / recap…), cycled per beat. */
  moods: string[][];
  backgrounds: string[];
  transitions: string[];
  layouts: string[];
  motif: string;
  font: string;
}

export const LAYOUTS = ['headline', 'say', 'kinetic', 'stat', 'donut', 'chart-line', 'bars', 'compare', 'checklist', 'steps', 'cards', 'chips', 'quote', 'phone', 'typing', 'logo-reveal'] as const;
export const PAPER_LAYOUTS = ['slam', 'cutout', 'graph-panel', 'tally', 'typewriter', 'slam-cutout'] as const;
export const TRANSITIONS = ['wipe', 'burst', 'slices', 'band-wipe', 'cut', 'push'];

export function makeBible(style: string): StyleBible {
  if (style === 'pack:paper-explainer') {
    return {
      style, palette: { ...PAPER_PACK.palette }, font: 'Oswald', motif: 'red pen marks + tape',
      moods: [['#efe6d4'], ['#e9dfca'], ['#f3ecdd']], backgrounds: ['paper'], transitions: ['cut', 'wipe', 'push', 'cut'], layouts: [...PAPER_LAYOUTS],
    };
  }
  const pal = PALETTES[style.replace(/^user:.*/, 'dark')] ?? PALETTES.dark;
  const light = /paper|whiteboard|mint/.test(style);
  return {
    style, palette: { ...pal }, font: pal.font ?? 'Montserrat', motif: 'one accent ring that travels between beats',
    moods: light ? [[pal.bg], ['#ffffff'], [pal.accents[0]]] : [[pal.bg, pal.card], [pal.card, pal.bg], [pal.accents[0], pal.bg], [pal.bg, pal.accents[1] ?? pal.card]],
    backgrounds: light ? ['flat', 'dots', 'flat', 'grid'] : ['gradient', 'flat', 'mesh', 'grid', 'glow'],
    transitions: ['wipe', 'burst', 'slices', 'band-wipe', 'push'], layouts: [...LAYOUTS],
  };
}

/** Pick a layout per beat from its hints, never the same layout within 3 beats (kept / locked beats stay). */
export function assignLayouts(beats: DBeat[], sections: DSection[], bible: StyleBible) {
  const paper = bible.style === 'pack:paper-explainer';
  const recent: string[] = [];
  let rot = 0;
  for (const b of beats) {
    if (b.locked && b.layout) {
      recent.push(b.layout);
      continue;
    }
    const sec = sections[b.section];
    const want: string[] = paper
      ? [
          ...(b.hints.includes('date') ? ['typewriter'] : []),
          ...(b.hints.includes('number') && /\b([2-9]|1[0-9])\b/.test(b.text) ? ['tally'] : []),
          ...(b.hints.some((h) => h === 'number' || h === 'percent' || h === 'money') ? ['graph-panel'] : []),
          ...(b.hints.includes('question') ? ['slam'] : []),
          'slam-cutout', 'cutout', 'slam',
        ]
      : [
          ...(b.hints.includes('percent') ? ['donut', 'stat'] : []),
          ...(b.hints.includes('money') ? ['stat', 'chart-line'] : []),
          ...(b.hints.includes('trend') ? ['chart-line', 'bars'] : []),
          ...(b.hints.includes('number') ? ['stat', 'bars'] : []),
          ...(b.hints.includes('compare') ? ['compare'] : []),
          ...(b.hints.includes('list') ? ['checklist', 'steps', 'chips'] : []),
          ...(b.hints.includes('quote') ? ['quote'] : []),
          ...(b.hints.includes('question') ? ['kinetic', 'typing'] : []),
          ...(sec?.mood === 'hook' && b.i === 0 ? ['kinetic'] : []),
          ...(sec?.mood === 'end' && b === beats[beats.length - 1] ? ['logo-reveal'] : []),
          ...(sec?.mood === 'recap' ? ['checklist', 'cards'] : []),
        ];
    const general = paper ? ['slam-cutout', 'graph-panel', 'cutout', 'slam', 'slam-cutout', 'cutout'] : ['headline', 'say', 'cards', 'chips', 'kinetic', 'headline', 'say'];
    const pick = [...want, ...general.slice(rot % general.length), ...general].find((l) => !recent.slice(-3).includes(l)) ?? general[rot % general.length];
    rot++;
    b.layout = pick;
    recent.push(pick);
  }
}

/** Short phrase for a headline: at most `max` words, centred on the first key word. */
export function phrase(b: DBeat, max = 6): string {
  const ws = b.text.split(/\s+/).filter(Boolean);
  if (ws.length <= max) return ws.join(' ');
  const k = b.keys[0] ? Math.max(0, ws.findIndex((w) => w.includes(b.keys[0]))) : 0;
  const a = Math.max(0, Math.min(ws.length - max, k - Math.floor(max / 2)));
  return ws.slice(a, a + max).join(' ').replace(/^[,;:.]+|[,;:]+$/g, '');
}
const numberIn = (t: string) => /[$€£]?\s?\d[\d,.]*\s?(%|k|m|bn|million|billion)?/i.exec(t)?.[0].replace(/\s+/g, '') ?? '';
const splitList = (t: string) => t.split(/,|;|\band\b|،| و/).map((s) => s.trim().replace(/^(first|second|third|finally|then)\s+/i, '')).filter((s) => s.length > 1).slice(0, 4).map((s) => s.split(/\s+/).slice(0, 4).join(' '));
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Layers for one beat (times relative to `t0`, the section start). */
export function templateBeat(b: DBeat, t0: number, bible: StyleBible, k: number, last: boolean, img?: string): MotionItem[] {
  const s = b.start - t0, d = Math.max(1, b.end - b.start);
  const mood = bible.moods[k % bible.moods.length];
  const bgKind = bible.backgrounds[k % bible.backgrounds.length];
  const pal = bible.palette, acc = pal.accents;
  const key = b.keys[0] ?? '';
  const id = (n: string) => `${b.id}_${n}`;
  const it = (o: Partial<MotionItem> & { type: MotionItem['type'] }): MotionItem => ({ id: id(String(o.widget ?? o.type) + Math.random().toString(36).slice(2, 5)), start: s, dur: d, ...o }) as MotionItem;
  const out: MotionItem[] = [it({ type: 'background', kind: bgKind, colors: bgKind === 'paper' ? [mood[0], k % 2 ? 'creased' : ''] : mood })];
  const textColor = bgKind !== 'paper' && /^#(f|e|d)/i.test(mood[0]) ? '#141414' : pal.text;
  const W = (widget: string, o: Partial<MotionItem> = {}) => out.push(it({ type: 'widget', widget, ...o }));
  const ph = phrase(b);
  switch (b.layout) {
    case 'headline': W('headline', { title: ph, gold: key, sub: b.hints.includes('question') ? 'THE QUESTION' : '', size: 104, textColor }); break;
    case 'say': W('say', { text: '', key: b.keys, size: 104, pill: false }); break;
    case 'kinetic': {
      const ws = ph.split(' '), half = Math.ceil(ws.length / 2);
      W('kinetic', { lines: ws.length > 3 ? [ws.slice(0, half).join(' '), ws.slice(half).join(' ')] : [ph], highlight: b.keys, size: 130 });
      break;
    }
    case 'stat': W('stat', { value: numberIn(b.text) || '100%', label: phrase({ ...b, keys: b.keys.slice(1) }, 4), size: 220, y: -20 }); break;
    case 'donut': W('donut', { value: parseFloat(numberIn(b.text)) || 75, label: phrase(b, 3), size: 380, x: -380 }), W('headline', { title: phrase(b, 4), gold: key, size: 84, x: 420, width: 760, textColor }); break;
    case 'chart-line': W('chart-line', { x: -360, w: 800, h: 460, value: numberIn(b.text) || cap(key), label: phrase(b, 2).toUpperCase(), delta: /drop|fell|decline|less/i.test(b.text) ? '-' + (numberIn(b.text) || '30%') : '+' + (numberIn(b.text).replace(/^[+$]/, '') || '30%'), values: /drop|fell|decline|less/i.test(b.text) ? [9, 8, 8.5, 6, 5, 3, 2] : [2, 3, 2.6, 4.2, 3.8, 5.6, 8] }), W('headline', { title: phrase(b, 4), gold: key, size: 80, x: 470, width: 700, textColor }); break;
    case 'bars': W('bars', { x: -360, w: 760, h: 460, values: [35, 55, 48, 90], labels: ['', '', '', cap(key).slice(0, 10)], suffix: '' }), W('headline', { title: phrase(b, 4), gold: key, size: 80, x: 470, width: 700, textColor }); break;
    case 'compare': {
      const parts = b.text.split(/\b(?:vs\.?|versus|instead of|rather than|compared to|but)\b|بدلا من|مقابل|لكن/i);
      const L = (parts[0] ?? '').trim(), R = (parts.slice(1).join(' ') ?? '').trim();
      W('compare', { left: { title: 'Before', items: splitList(L).length ? splitList(L) : [phrase({ ...b, text: L || b.text }, 4)] }, right: { title: 'After', items: splitList(R).length ? splitList(R) : [phrase({ ...b, text: R || b.text }, 4)] }, w: 1400, h: 440, palette: 'paper' });
      break;
    }
    case 'checklist': W('checklist', { items: splitList(b.text).length > 1 ? splitList(b.text) : [ph], w: 900, x: 300 }), W('headline', { title: cap(key), size: 90, x: -560, width: 520, textColor }); break;
    case 'steps': W('steps', { items: (splitList(b.text).length > 1 ? splitList(b.text) : b.keys.length ? b.keys : [ph]).slice(0, 4), w: 1300, y: 40 }); break;
    case 'cards': W('cards', { items: (b.keys.length ? b.keys : [ph]).concat(splitList(b.text)).slice(0, 3).map((t, j) => ({ icon: iconName(t.toLowerCase()), title: cap(t.split(' ').slice(0, 2).join(' ')), sub: '', color: acc[j % acc.length] })), y: 40 }); break;
    case 'chips': W('chips', { items: (splitList(b.text).length > 1 ? splitList(b.text) : b.keys.length ? b.keys : [ph]).slice(0, 4).map((t) => ({ icon: iconName(t.toLowerCase()), title: cap(t) })), y: 120 }), W('headline', { title: phrase(b, 4), gold: key, size: 90, y: -120, textColor }); break;
    case 'quote': W('quote', { text: b.text.replace(/["“”«»]/g, ''), name: '', role: '', highlight: b.keys.slice(0, 1), size: Math.max(38, 60 - b.text.length / 6), palette: 'paper' }); break;
    case 'phone': W('phone', { x: -460, w: 300, title: cap(key), messages: [{ text: phrase(b, 4) }, { text: '…', me: true }] }), W('headline', { title: phrase(b, 4), gold: key, size: 84, x: 330, width: 900, textColor }); break;
    case 'typing': W('typing', { text: phrase(b, 7), button: 'Go', w: 1100 }); break;
    case 'logo-reveal': W('logo-reveal', { name: cap(key) || 'Thanks', tagline: phrase(b, 5), size: 200, y: -40 }), W('rays', { y: -100, color: acc[1] ?? acc[0], size: 300, strength: 0.3, flashes: [0.9] }); break;
    // Paper explainer layouts.
    case 'slam': W('slam', { text: phrase(b, 4), key, size: 140, markAt: Math.max(0.2, (b.words.find((w) => w.w.includes(key))?.t ?? b.start) - b.start) }); break;
    case 'cutout': W('cutout', { asset: img, label: cap(key), w: 560, h: 380, caption: phrase(b, 4).toUpperCase(), tiltDeg: k % 2 ? 4 : -4 }); break;
    case 'slam-cutout': W('cutout', { asset: img, label: cap(key), w: 520, h: 360, x: -440, y: 30, tiltDeg: k % 2 ? 4 : -4 }), W('slam', { text: phrase(b, 3), key, size: 110, x: 440, y: -60, markAt: 0.4 }), W('arrow', { start: s + Math.min(1, d * 0.4), dur: d - Math.min(1, d * 0.4), from: [260, 80], to: [-140, 40], bend: -0.35, color: acc[0] }); break;
    case 'graph-panel': numberIn(b.text) ? (W('graph-panel', { w: 860, h: 520, x: -360, title: phrase(b, 3), value: numberIn(b.text) }), W('typewriter-tag', { text: phrase(b, 4).toUpperCase(), x: 480, y: -60 })) : (W('graph-panel', { w: 820, h: 520, x: -380, title: cap(key), items: (splitList(b.text).length > 1 ? splitList(b.text) : b.keys.length ? b.keys : [phrase(b, 4)]).slice(0, 4) }), W('slam', { text: phrase(b, 3), key, size: 110, x: 450, y: -20 })); break;
    case 'tally': W('tally', { count: Math.min(19, parseInt(numberIn(b.text), 10) || 5), x: -360 }), W('slam', { text: phrase(b, 3), key, size: 110, x: 430, y: 0 }); break;
    case 'typewriter': W('typewriter-tag', { text: (numberIn(b.text) || phrase(b, 3)).toUpperCase(), y: -170 }), W('slam', { text: phrase(b, 4), key, size: 130, y: 40 }); break;
    default: W('headline', { title: ph, gold: key, size: 100, textColor });
  }
  // Every beat moves: a slow push (or drift), and a transition into the next beat (never the same twice in a row).
  out.push(it({ type: 'camera', keys: [{ t: 0, zoom: 1.0, x: 0, y: 0 }, { t: d, zoom: 1.05, x: k % 2 ? 30 : -30, y: 0, ease: 'ease' }] }));
  if (!last) {
    const tr = bible.transitions[k % bible.transitions.length];
    const next = bible.moods[(k + 1) % bible.moods.length];
    if (tr === 'wipe') W('wipe', { start: s + d - 0.5, dur: 1, dir: k % 2 ? 'left' : 'up', colors: [acc[0], next[0]] });
    else if (tr === 'burst') W('burst', { start: s + d - 0.55, dur: 1.1, colors: [acc[0], acc[1] ?? acc[0], next[0]] });
    else if (tr === 'slices') W('slices', { start: s + d - 0.5, dur: 1, count: 9, colors: [acc[0], next[0]], dir: 'up' });
    else if (tr === 'band-wipe') W('band-wipe', { start: s + d - 0.55, dur: 1.1, colors: [acc[1] ?? acc[0], acc[0], next[0]] });
    else if (tr === 'push') out[out.length - 1].keys!.push({ t: d - 0.25, zoom: 1.05 }, { t: d, zoom: 1.35, ease: 'ease-in' });
  }
  return out;
}

/** Whole section from templates (layers relative to the section start). */
export function templateSection(beats: DBeat[], sec: DSection, bible: StyleBible, images: string[] = []): MotionItem[] {
  const own = beats.filter((b) => b.section === sec.i);
  // Pictures for cut-outs: the project's images in turn (each beat its own one while they last).
  const lastSec = Math.max(...beats.map((x) => x.section));
  const items = own.flatMap((b, j) => templateBeat(b, sec.start, bible, b.i, j === own.length - 1 && sec.i === lastSec, images.length ? images[b.i % images.length] : undefined));
  items.push({ id: `s${sec.i}_grain`, type: 'light', light: 'vignette', start: 0, dur: sec.end - sec.start });
  if (bible.backgrounds.includes('paper')) items.push({ id: `s${sec.i}_film`, type: 'light', light: 'film-grain', start: 0, dur: sec.end - sec.start });
  return items;
}
