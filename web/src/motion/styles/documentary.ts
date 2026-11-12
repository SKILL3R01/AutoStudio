/** "Documentary collage" style kit: warm paper, taped cut-out photos, graph sheets, slam headlines, red pen marks. */
import type { MotionItem } from '../types';
import { PAPER_PACK } from '../packs/paper';
import { W, T, cap, layer, pair, pic, portrait, safeW, u } from './kit';
import type { SceneCtx, SceneTemplate, Slots, StyleKit } from './types';

const RED = '#d8342c', INK = '#1f1e1d';
const tilt = (c: SceneCtx, n = 0) => (((c.k + n) % 3) - 1) * 4;
const slam = (c: SceneCtx, s: Slots, at: { x: number; y: number }, width: number, size = 130) =>
  W(c, 'slam', { ...at, text: (s.title ?? '').split(' ').slice(0, 5).join(' '), key: s.key ?? '', size: size * u(c), markAt: Math.max(0.3, c.keyAt), maxW: width });
const cut = (c: SceneCtx, s: Slots, at: { x: number; y: number }, w: number, h: number, n = 0, o: Partial<MotionItem> = {}) =>
  W(c, 'cutout', { ...at, asset: pic(c, n ? s.image2 : s.image, n), label: cap(s.label ?? s.key), w, h, tiltDeg: tilt(c, n), caption: s.sub ? s.sub.toUpperCase() : '', ...o });
const items = (s: Slots, n = 4) => (s.items?.length ? s.items : [s.title ?? '']).filter(Boolean).slice(0, n);

const T_: SceneTemplate[] = [
  { id: 'slam', name: 'Slam headline', fits: ['plain', 'intro', 'question'], slots: ['title', 'key'], describe: 'CAPS headline slams in, yellow highlighter on the key word',
    build: (s, c) => [slam(c, s, { x: 0, y: 0 }, safeW(c), 150)] },
  { id: 'cutout-slam', name: 'Photo + headline', fits: ['plain', 'picture'], slots: ['image', 'label', 'title', 'key'], describe: 'a taped cut-out photo, a slam headline beside it and a red pen arrow',
    build: (s, c) => { const p = pair(c); return [cut(c, s, p.vis, 520 * u(c), 360 * u(c)), slam(c, s, p.txt, p.txtW, 110), W(c, 'arrow', { start: Math.min(1, c.dur * 0.4), dur: c.dur - Math.min(1, c.dur * 0.4), from: [p.txt.x * 0.6, p.txt.y * 0.6 + 80 * u(c)], to: [p.vis.x * 0.5, p.vis.y * 0.5 + 20], bend: -0.35, color: RED })]; } },
  { id: 'big-photo', name: 'Big photo', fits: ['picture', 'plain', 'date'], slots: ['image', 'label', 'sub', 'date'], describe: 'one big taped photo with a typed caption and a date / place tag',
    build: (s, c) => [cut(c, s, { x: 0, y: -20 }, (portrait(c) ? 0.8 : 0.5) * c.frame.w, (portrait(c) ? 0.3 : 0.5) * c.frame.h), ...(s.date ? [W(c, 'typewriter-tag', { text: s.date.toUpperCase(), y: -(portrait(c) ? 0.2 : 0.33) * c.frame.h, start: 0.4, dur: c.dur - 0.4 })] : [])] },
  { id: 'sheet-number', name: 'Number on graph paper', fits: ['number', 'percent', 'money'], slots: ['value', 'title', 'label'], describe: 'a graph-paper sheet with the number written big in red, a typed label',
    build: (s, c) => { const p = pair(c); return [W(c, 'graph-panel', { ...p.vis, w: Math.min(820, p.visW), h: 520 * u(c), title: s.label ?? '', value: s.value ?? '' }), slam(c, s, p.txt, p.txtW, 100)]; } },
  { id: 'sheet-list', name: 'Notes on graph paper', fits: ['list'], slots: ['items', 'title', 'key'], describe: 'handwritten notes appearing on a graph sheet, headline beside',
    build: (s, c) => { const p = pair(c); return [W(c, 'graph-panel', { ...p.vis, w: Math.min(800, p.visW), h: 520 * u(c), title: cap(s.key), items: items(s) }), slam(c, s, p.txt, p.txtW, 100)]; } },
  { id: 'tally', name: 'Tally marks', fits: ['number'], slots: ['value', 'title', 'key'], describe: 'red pen tally marks counting up to the number (≤ 19), headline beside',
    build: (s, c) => { const p = pair(c); return [W(c, 'tally', { ...p.vis, count: Math.min(19, parseInt(s.value ?? '5', 10) || 5) }), slam(c, s, p.txt, p.txtW, 110)]; } },
  { id: 'date-slam', name: 'Date + headline', fits: ['date', 'intro'], slots: ['date', 'title', 'key'], describe: 'a typed date / place tag, then the headline slams in',
    build: (s, c) => [W(c, 'typewriter-tag', { text: (s.date ?? s.label ?? '').toUpperCase(), y: -170 * u(c) }), slam(c, s, { x: 0, y: 40 * u(c) }, safeW(c), 130)] },
  { id: 'before-after', name: 'Before / after', fits: ['compare'], slots: ['image', 'image2', 'label', 'sub', 'left', 'right'], describe: 'two taped photos side by side labelled (label / sub), a pen arrow between them',
    build: (s, c) => {
      const pr = portrait(c), a = pr ? { x: 0, y: -c.frame.h * 0.2 } : { x: -c.frame.w * 0.22, y: 0 }, b = pr ? { x: 0, y: c.frame.h * 0.17 } : { x: c.frame.w * 0.22, y: 0 };
      return [cut(c, { ...s, label: s.label ?? s.left?.[0] ?? 'Before' }, a, 460 * u(c), 320 * u(c), 0, { caption: (s.label ?? 'BEFORE').toUpperCase() }), cut(c, { ...s, label: s.sub ?? s.right?.[0] ?? 'After' }, b, 460 * u(c), 320 * u(c), 1, { caption: (s.sub ?? 'AFTER').toUpperCase(), start: 0.5, dur: c.dur - 0.5 }),
        W(c, 'arrow', { start: 0.9, dur: c.dur - 0.9, from: [a.x * 0.35, a.y * 0.35], to: [b.x * 0.35, b.y * 0.35], bend: 0.3, color: RED })];
    } },
  { id: 'document', name: 'Document line', fits: ['quote', 'plain'], slots: ['title', 'key', 'label'], describe: 'a paper document with a typed line, the key words highlighted',
    build: (s, c) => {
      const w = Math.min(1100, safeW(c)), h = 420 * u(c);
      return [layer(c, { type: 'shape', shape: 'rect', w, h, color: '#fdfbf6', shadow: true, rotation: -1.5, in: 'drop-in' }), W(c, 'tape', { y: -h / 2, x: -w * 0.3, angle: -12, start: 0.3, dur: c.dur - 0.3 }),
        ...(s.label ? [W(c, 'typewriter-tag', { text: s.label.toUpperCase(), y: -h / 2 + 50, x: w / 2 - 200, size: 24, start: 0.2, dur: c.dur - 0.2 })] : []),
        T(c, s.title ?? '', { font: 'Consolas', weight: 500, size: Math.max(34, 54 - (s.title ?? '').length / 5) * u(c), color: INK, width: w - 120, align: 'left', in: 'typewriter', highlight: s.key ? [{ word: s.key, style: 'marker', bg: '#ffe14a', at: Math.max(0.8, c.keyAt) }] : [], rotation: -1.5 })];
    } },
  { id: 'circle-detail', name: 'Circled detail', fits: ['picture', 'plain'], slots: ['image', 'label', 'title'], describe: 'a photo with one detail circled in red pen and a typed label',
    build: (s, c) => [cut(c, s, { x: portrait(c) ? 0 : -80, y: portrait(c) ? -120 : 0 }, (portrait(c) ? 0.8 : 0.48) * c.frame.w, (portrait(c) ? 0.3 : 0.5) * c.frame.h), W(c, 'circle-draw', { start: 0.8, dur: c.dur - 0.8, x: portrait(c) ? 60 : 40, y: portrait(c) ? -150 : -40, w: 220 * u(c), h: 140 * u(c), color: RED }),
      W(c, 'typewriter-tag', { text: (s.title ?? s.label ?? '').split(' ').slice(0, 4).join(' ').toUpperCase(), x: portrait(c) ? 0 : c.frame.w * 0.3, y: portrait(c) ? c.frame.h * 0.22 : -120, start: 1.1, dur: c.dur - 1.1 })] },
  { id: 'quote-paper', name: 'Quote on paper', fits: ['quote'], slots: ['title', 'key', 'label'], describe: 'a quote card on paper, the key word marked, who said it',
    build: (s, c) => [W(c, 'quote', { text: s.title ?? '', name: s.label ?? '', role: '', highlight: s.key ? [s.key] : [], w: Math.min(1100, safeW(c)), h: 420, size: Math.max(36, 58 - (s.title ?? '').length / 6), palette: 'paper' })] },
  { id: 'question-mark', name: 'Big question', fits: ['question'], slots: ['title', 'key'], describe: 'the question slams in and the key word is circled in red',
    build: (s, c) => [slam(c, s, { x: 0, y: 0 }, safeW(c), 130), W(c, 'circle-draw', { start: Math.max(0.6, c.keyAt), dur: c.dur - Math.max(0.6, c.keyAt), w: 300 * u(c), h: 150 * u(c), y: 4, color: RED })] },
  { id: 'pin-place', name: 'Place pin', fits: ['date', 'plain'], slots: ['date', 'title', 'key'], describe: 'a red map pin drops, a typed place / date tag, the headline',
    build: (s, c) => { const p = pair(c); return [layer(c, { type: 'icon', name: 'map-pin', style: 'line', color: RED, size: 220 * u(c), ...p.vis, in: 'drop-in', loop: 'float' }), W(c, 'typewriter-tag', { text: (s.date ?? s.key ?? '').toUpperCase(), x: p.vis.x, y: p.vis.y + 170 * u(c), start: 0.4, dur: c.dur - 0.4 }), slam(c, s, p.txt, p.txtW, 100)]; } },
  { id: 'three-photos', name: 'Three photos', fits: ['list', 'picture'], slots: ['items'], describe: 'three small taped photos landing one after another, typed labels (items)',
    build: (s, c) => items(s, 3).map((t, i, all) => {
      const pr = portrait(c), x = pr ? 0 : (i - (all.length - 1) / 2) * c.frame.w * 0.29, y = pr ? (i - (all.length - 1) / 2) * c.frame.h * 0.27 : 0;
      return cut(c, { ...s, label: t, sub: t }, { x, y }, 380 * u(c), 280 * u(c), i, { start: i * 0.35, dur: c.dur - i * 0.35 });
    }) },
  { id: 'note', name: 'Sticky note', fits: ['plain', 'list'], slots: ['title', 'items'], describe: 'a yellow sticky note with handwriting, taped down',
    build: (s, c) => {
      const w = 620 * u(c);
      return [layer(c, { type: 'shape', shape: 'rect', w, h: w * 0.9, color: '#ffe680', shadow: true, rotation: tilt(c) - 2, in: 'drop-in' }), W(c, 'tape', { y: -w * 0.45, angle: -6, start: 0.3, dur: c.dur - 0.3 }),
        T(c, [s.title, ...(s.items ?? [])].filter(Boolean).slice(0, 4).join('\n'), { font: 'Permanent Marker', weight: 400, size: 56 * u(c), color: INK, width: w - 80, rotation: tilt(c) - 2, in: 'wipe-reveal', reveal: 'right', revealAt: 0.4, revealDur: 1.2 })];
    } },
  { id: 'stamp', name: 'Stamp', fits: ['plain', 'quote', 'outro'], slots: ['title', 'label'], describe: 'a red rubber stamp word (label, e.g. TRUE / BANNED / 1952) over the headline',
    build: (s, c) => [slam(c, s, { x: 0, y: -60 * u(c) }, safeW(c), 110), T(c, (s.label ?? 'TRUE').toUpperCase(), { y: 120 * u(c), x: 160 * u(c), size: 120 * u(c), font: 'Oswald', weight: 700, color: RED, stroke: { color: RED, width: 3 }, rotation: -12, in: 'stomp', start: Math.max(0.6, c.keyAt), dur: c.dur - Math.max(0.6, c.keyAt), shadow: false })] },
  { id: 'timeline', name: 'Timeline of dates', fits: ['date', 'list'], slots: ['items'], describe: 'dates / steps along a dotted line (items like "1952 first flight")',
    build: (s, c) => [W(c, 'steps', { items: items(s), w: Math.min(1300, safeW(c) * 0.85), palette: 'paper', scale: portrait(c) ? 0.75 : 1, color: RED })] },
  { id: 'counter-paper', name: 'Counter', fits: ['number', 'money', 'percent'], slots: ['value', 'label'], describe: 'a big number counting up in ink with a highlighter label',
    build: (s, c) => [W(c, 'stat', { value: s.value ?? '100', label: s.label ?? '', size: 220 * u(c), palette: 'paper', color: RED, y: -30 }), W(c, 'tape', { x: -260 * u(c), y: -190 * u(c), angle: -20 })] },
  { id: 'chapter', name: 'Chapter card', fits: ['chapter', 'intro'], slots: ['label', 'title'], describe: 'a typed PART label and a slam title on paper',
    build: (s, c) => [W(c, 'typewriter-tag', { text: (s.label ?? 'PART 1').toUpperCase(), y: -130 * u(c) }), slam(c, s, { x: 0, y: 40 * u(c) }, safeW(c), 150)] },
  { id: 'closing', name: 'Closing line', fits: ['outro'], slots: ['title', 'key'], describe: 'the closing line slams in, a strip of tape on the corner',
    build: (s, c) => [slam(c, s, { x: 0, y: 0 }, safeW(c), 140), W(c, 'tape', { x: safeW(c) * 0.4, y: -c.frame.h * 0.3, angle: 30, start: 0.5, dur: c.dur - 0.5 })] },
];

const PAPERS = ['#efe6d4', '#e9dfca', '#f3ecdd', '#ece2cf'];
/** Paper on every scene (creased every other), grain + vignette, a slow drift; cuts and paper slides between scenes. */
export function frameDocumentary(items: MotionItem[], c: SceneCtx): MotionItem[] {
  const out: MotionItem[] = [layer(c, { type: 'background', kind: 'paper', colors: [PAPERS[c.k % PAPERS.length], c.k % 2 ? 'creased' : ''] }), ...items];
  const cam = layer(c, { type: 'camera', keys: [{ t: 0, zoom: 1 }, { t: c.dur, zoom: 1.04, x: c.k % 2 ? 20 : -20, ease: 'ease' }] });
  out.push(cam);
  if (!c.last && c.k % 3 === 1) out.push(W(c, 'wipe', { start: Math.max(0, c.dur - 0.5), dur: 1, dir: 'left', colors: ['#d9cfbd', PAPERS[(c.k + 1) % PAPERS.length]] }));
  if (!c.last && c.k % 3 === 2) cam.keys!.push({ t: Math.max(0, c.dur - 0.25), zoom: 1.04 }, { t: c.dur, zoom: 1.25, ease: 'ease-in' });
  out.push(layer(c, { type: 'light', light: 'film-grain' }), layer(c, { type: 'light', light: 'vignette' }));
  return out;
}

export const DOCUMENTARY: StyleKit = {
  id: 'documentary', name: 'Documentary collage', genre: 'documentary', status: 'ready',
  description: 'Warm paper, taped photos, red pen marks, slam headlines — like the best explainer channels.',
  includes: ['20 scene designs', 'your photos as cut-outs', 'pen arrows & circles', 'film grain'],
  variants: [
    { id: 'warm', name: 'Warm paper', palette: PAPER_PACK.palette },
    { id: 'archive', name: 'Archive', palette: { ...PAPER_PACK.palette, bg: '#e4dccb', accents: ['#8c2f1b', '#e9c46a', '#264653'] } },
    { id: 'blueprint', name: 'Blue ink', palette: { ...PAPER_PACK.palette, accents: ['#1f4fa8', '#ffe14a', '#d8342c'] } },
  ],
  font: 'Oswald', templates: T_, frameScene: frameDocumentary,
  direction: PAPER_PACK.direction,
  storyShape: PAPER_PACK.script ?? 'hook paradox → context with a date and place → the problem → the reveal → what changed → closing line',
  preview: [
    { template: 'cutout-slam', slots: { title: 'Why mornings win', key: 'mornings', label: 'Sunrise' } },
    { template: 'sheet-number', slots: { value: '3×', title: 'Three times faster', key: 'faster', label: 'The study' } },
    { template: 'date-slam', slots: { date: 'London, 1952', title: 'It started here', key: 'started' } },
  ],
};
