/** "Kinetic typography" style kit (v6.1): the whole video is type — every word animates on its spoken time. */
import type { MotionItem, MotionPalette } from '../types';
import { W, T, cap, layer, pic, portrait, safeW, u } from './kit';
import type { SceneCtx, SceneTemplate, Slots, StyleKit } from './types';

const P = (bg: string, card: string, text: string, muted: string, accents: string[], font: string): MotionPalette => ({ bg, card, text, muted, accents, font });
const words = (t?: string, max = 9) => (t ?? '').split(/\s+/).filter(Boolean).slice(0, max).join(' ');
const sz = (c: SceneCtx, text: string, width: number, max: number) => Math.max(54 * u(c), Math.min(max * u(c), (width / Math.max(4, text.length * 0.56)) * 1.1));
/** Kinetic type layer: words on their spoken time, letters animated. */
const K = (c: SceneCtx, text: string, o: Partial<MotionItem> = {}) => {
  const width = typeof o.width === 'number' ? o.width : safeW(c);
  return W(c, 'ktype', { text, width, size: sz(c, text, width, 150), font: c.font, color: c.pal.text, accent: c.pal.accents[0], anim: 'wave', style: 'fill', spread: Math.max(0.6, c.dur * 0.55), ...o });
};
const keyOf = (s: Slots) => (s.key ? [s.key] : []);
const bar = (c: SceneCtx, o: Partial<MotionItem>) => layer(c, { type: 'shape', shape: 'rect', color: c.pal.accents[0], in: 'wipe-right', ...o });
const items = (s: Slots, n = 4) => (s.items?.length ? s.items : (s.title ?? '').split(/[,;]| and /)).map((x) => x.trim()).filter(Boolean).slice(0, n);

const T_: SceneTemplate[] = [
  { id: 'punch', name: 'Punch word', fits: ['plain', 'intro'], slots: ['title', 'key'], describe: 'one huge key word slams in, the rest of the line waves in under it',
    build: (s, c) => {
      const key = (s.key ?? (s.title ?? '').split(' ').sort((a, b) => b.length - a.length)[0] ?? '').toUpperCase();
      return [K(c, key, { y: -60 * u(c), anim: 'slam', size: sz(c, key, safeW(c), 260), accent: c.pal.accents[0], key: [key], textStart: Math.max(0, c.keyAt - 0.1) }), K(c, words(s.title, 8), { y: 150 * u(c), size: 64 * u(c), anim: 'wave', color: c.pal.muted })];
    } },
  { id: 'stack', name: 'Stacked lines', fits: ['plain', 'intro', 'question'], slots: ['title', 'key'], describe: 'the line stacked in 2–3 big rows, each row rising out of a mask',
    build: (s, c) => [K(c, words(s.title), { width: safeW(c) * (portrait(c) ? 0.9 : 0.62), anim: 'mask', key: keyOf(s), lineHeight: 0.95 })] },
  { id: 'editorial', name: 'Editorial', fits: ['plain', 'quote'], slots: ['title', 'key', 'label'], describe: 'magazine page: small label, thin rules, left-aligned title tracking in',
    build: (s, c) => {
      const w = safeW(c) * 0.8;
      return [bar(c, { x: 0, y: -230 * u(c), w, h: 3 * u(c), color: c.pal.text }), W(c, 'tag', { text: (s.label ?? 'chapter').toUpperCase(), x: -w / 2 + 120, y: -280 * u(c) }),
        K(c, words(s.title), { width: w, align: 'left', anim: 'track', key: keyOf(s), size: sz(c, words(s.title), w, 120) }), bar(c, { x: 0, y: 240 * u(c), w, h: 3 * u(c), color: c.pal.text, start: 0.3 })];
    } },
  { id: 'swiss', name: 'Swiss grid', fits: ['list', 'plain', 'number'], slots: ['title', 'value', 'key'], describe: 'grid layout: big index number on the left, title on the right, red bar',
    build: (s, c) => {
      const pr = portrait(c), idx = (s.value ?? String(c.k + 1).padStart(2, '0')).slice(0, 4);
      return [K(c, idx, { x: pr ? 0 : -safeW(c) * 0.33, y: pr ? -300 * u(c) : 0, width: 500 * u(c), size: 260 * u(c), anim: 'flip', color: c.pal.accents[0] }),
        bar(c, { x: pr ? 0 : -safeW(c) * 0.12, y: pr ? -130 * u(c) : 0, w: pr ? safeW(c) * 0.7 : 8 * u(c), h: pr ? 8 * u(c) : 360 * u(c) }),
        K(c, words(s.title), { x: pr ? 0 : safeW(c) * 0.2, y: pr ? 120 * u(c) : 0, width: pr ? safeW(c) : safeW(c) * 0.55, align: pr ? 'center' : 'left', anim: 'mask', key: keyOf(s) })];
    } },
  { id: 'brutalist', name: 'Brutalist', fits: ['plain', 'intro', 'question'], slots: ['title', 'key'], describe: 'raw black blocks and huge condensed type decoding from random letters',
    build: (s, c) => [layer(c, { type: 'shape', shape: 'rect', x: -c.frame.w * 0.25, y: -c.frame.h * 0.3, w: c.frame.w * 0.55, h: 40 * u(c), color: c.pal.text, in: 'wipe-right' }),
      K(c, words(s.title, 6), { font: 'Anton', weight: 400, anim: 'scramble', key: keyOf(s), size: sz(c, words(s.title, 6), safeW(c), 220), stagger: 0.02 }),
      layer(c, { type: 'shape', shape: 'rect', x: c.frame.w * 0.25, y: c.frame.h * 0.32, w: c.frame.w * 0.4, h: 22 * u(c), color: c.pal.accents[0], in: 'wipe-left', start: 0.3 })] },
  { id: 'split', name: 'Split screen', fits: ['picture', 'plain', 'compare'], slots: ['title', 'key', 'image'], describe: 'picture on one half, the title drawing itself on the other half',
    build: (s, c) => {
      const pr = portrait(c), half = pr ? { w: c.frame.w, h: c.frame.h / 2 } : { w: c.frame.w / 2, h: c.frame.h };
      return [W(c, 'kphoto', { asset: pic(c, s.image), w: half.w, h: half.h, x: pr ? 0 : -c.frame.w / 4, y: pr ? -c.frame.h / 4 : 0, push: 0.1, in: 'wipe-right' }),
        K(c, words(s.title), { x: pr ? 0 : c.frame.w / 4, y: pr ? c.frame.h / 4 : 0, width: half.w * 0.82, anim: 'stroke', key: keyOf(s) })];
    } },
  { id: 'image-letters', name: 'Picture in the letters', fits: ['picture', 'intro', 'plain'], slots: ['key', 'title', 'image'], describe: 'one huge word filled with the picture, title line under it',
    build: (s, c) => {
      const key = (s.key ?? (s.title ?? '').split(' ').sort((a, b) => b.length - a.length)[0] ?? '').toUpperCase();
      return [K(c, key, { y: -40 * u(c), font: 'Anton', weight: 400, style: 'image', asset: pic(c, s.image), anim: 'elastic', size: sz(c, key, safeW(c), 330), width: safeW(c), textStart: 0.1 }),
        K(c, words(s.title, 8), { y: 220 * u(c), size: 56 * u(c), color: c.pal.muted, anim: 'blur' })];
    } },
  { id: 'outline-fill', name: 'Outline / fill', fits: ['plain', 'list'], slots: ['title', 'key'], describe: 'words alternate solid and outlined, rising like a wave',
    build: (s, c) => [K(c, words(s.title), { style: 'outlineFill', anim: 'wave', key: keyOf(s), font: 'Bebas Neue', weight: 400, size: sz(c, words(s.title), safeW(c), 190) })] },
  { id: 'extrude', name: '3D extruded', fits: ['intro', 'number', 'plain'], slots: ['key', 'title'], describe: 'a thick 3D extruded word slams in, line under it',
    build: (s, c) => {
      const key = (s.key ?? words(s.title, 2)).toUpperCase();
      return [K(c, key, { y: -50 * u(c), style: 'extrude', anim: 'slam', font: 'Anton', weight: 400, size: sz(c, key, safeW(c), 240), color: c.pal.accents[0], textStart: Math.max(0, c.keyAt - 0.1) }), K(c, words(s.title, 8), { y: 170 * u(c), size: 60 * u(c), anim: 'track' })];
    } },
  { id: 'rotating', name: 'Rotating stack', fits: ['list', 'plain'], slots: ['items', 'title'], describe: 'three short lines swing in one after another, rotating into place',
    build: (s, c) => items(s, 3).map((it, i, all) => K(c, it.toUpperCase(), { y: (i - (all.length - 1) / 2) * 170 * u(c), size: sz(c, it, safeW(c), 150), anim: 'flip', start: (i * c.dur) / (all.length + 1), dur: c.dur - (i * c.dur) / (all.length + 1),
      keys: [{ t: 0, rotation: i % 2 ? 8 : -8, ease: 'ease-out' }, { t: 0.5, rotation: 0 }], color: i === all.length - 1 ? c.pal.accents[0] : c.pal.text })) },
  { id: 'counter', name: 'Big counter', fits: ['number', 'percent', 'money'], slots: ['value', 'label', 'title'], describe: 'a huge counting number, the label typing under it',
    build: (s, c) => [W(c, 'stat', { value: s.value ?? '100%', label: '', size: 230 * u(c), y: -50 * u(c) }), K(c, (s.label ?? s.title ?? '').toUpperCase(), { y: 170 * u(c), size: 64 * u(c), anim: 'type', textStart: 0.5 })] },
  { id: 'marker', name: 'Marker highlight', fits: ['plain', 'quote'], slots: ['title', 'key'], describe: 'clean title, a marker swipes over the key word when it is spoken',
    build: (s, c) => [T(c, words(s.title, 12), { size: 96 * u(c), width: safeW(c) * 0.85, color: c.pal.text, in: 'words', highlight: s.key ? [{ word: s.key, style: 'marker', bg: c.pal.accents[0], at: Math.max(0.5, c.keyAt) }] : [] })] },
  { id: 'swap', name: 'Word swap', fits: ['compare', 'question'], slots: ['label', 'key', 'title'], describe: 'the old word appears and is struck out, then the new word replaces it',
    build: (s, c) => {
      const swapAt = Math.max(0.8, Math.min(c.dur - 0.8, c.keyAt || c.dur / 2));
      const before = (s.label ?? 'before').toUpperCase(), after = (s.key ?? words(s.title, 2)).toUpperCase();
      return [K(c, before, { y: -40 * u(c), dur: swapAt, size: sz(c, before, safeW(c), 200), color: c.pal.muted, anim: 'wave' }),
        layer(c, { type: 'shape', shape: 'rect', y: -40 * u(c), w: Math.min(safeW(c), before.length * 110 * u(c)), h: 14 * u(c), color: c.pal.accents[1] ?? c.pal.accents[0], start: swapAt * 0.6, dur: swapAt * 0.4, in: 'wipe-right' }),
        K(c, after, { y: -40 * u(c), start: swapAt, dur: c.dur - swapAt, size: sz(c, after, safeW(c), 220), color: c.pal.accents[0], anim: 'slam', textStart: 0 }),
        K(c, words(s.title, 8), { y: 170 * u(c), size: 56 * u(c), anim: 'blur', start: swapAt, dur: c.dur - swapAt, textStart: 0.2 })];
    } },
  { id: 'script-caps', name: 'Caps + script', fits: ['plain', 'intro', 'quote'], slots: ['title', 'key'], describe: 'big caps with one handwritten script word over them',
    build: (s, c) => [K(c, words(s.title, 6), { anim: 'mask', size: sz(c, words(s.title, 6), safeW(c), 170), lineHeight: 0.95 }),
      K(c, cap(s.key ?? 'yes').toLowerCase(), { font: 'Pacifico', weight: 400, upper: false, anim: 'stroke', color: c.pal.accents[0], size: 120 * u(c), y: 120 * u(c), x: 160 * u(c), rotation: -8, textStart: Math.max(0.3, c.keyAt) })] },
  { id: 'quote', name: 'Quote', fits: ['quote'], slots: ['title', 'label', 'key'], describe: 'giant quote marks, the quote blurring into focus word by word, the author under it',
    build: (s, c) => [T(c, '“', { size: 420 * u(c), color: c.pal.accents[0], x: -safeW(c) * 0.38, y: -170 * u(c), in: 'pop', opacity: 0.85 }),
      K(c, words(s.title, 16), { width: safeW(c) * 0.78, size: sz(c, words(s.title, 16), safeW(c) * 1.4, 92), anim: 'blur', upper: false, key: keyOf(s) }),
      ...(s.label ? [K(c, `— ${s.label}`, { y: 250 * u(c), size: 44 * u(c), color: c.pal.muted, anim: 'track', textStart: c.dur * 0.6 })] : [])] },
  { id: 'list', name: 'List cascade', fits: ['list'], slots: ['items', 'title'], describe: 'items cascade in one per line, each tracking in, numbers in accent colour',
    build: (s, c) => { const it = items(s, 4); return it.map((x, i) => K(c, `${i + 1}  ${x}`, { y: (i - (it.length - 1) / 2) * 130 * u(c), size: Math.min(100 * u(c), sz(c, x, safeW(c), 100)), anim: 'track', key: [String(i + 1)], align: 'left', width: safeW(c) * 0.8, start: (i * c.dur * 0.6) / it.length, dur: c.dur - (i * c.dur * 0.6) / it.length, textStart: 0 })); } },
  { id: 'question', name: 'Big question', fits: ['question'], slots: ['title', 'key'], describe: 'a giant outlined question mark behind the question typing in',
    build: (s, c) => [K(c, '?', { size: 640 * u(c), style: 'outline', anim: 'elastic', color: c.pal.accents[0], width: 600 * u(c), textStart: 0, x: portrait(c) ? 0 : safeW(c) * 0.3, opacity: 0.6 }),
      K(c, words(s.title, 10), { width: safeW(c) * (portrait(c) ? 0.95 : 0.6), x: portrait(c) ? 0 : -safeW(c) * 0.12, anim: 'type', key: keyOf(s), size: sz(c, words(s.title, 10), safeW(c), 110) })] },
  { id: 'chapter', name: 'Chapter title', fits: ['chapter', 'intro'], slots: ['title', 'label'], describe: 'small chapter label, the big title flipping in letter by letter, a line drawing under it',
    build: (s, c) => [W(c, 'tag', { text: (s.label ?? `PART ${c.k + 1}`).toUpperCase(), y: -170 * u(c) }), K(c, words(s.title, 6), { anim: 'flip', size: sz(c, words(s.title, 6), safeW(c), 170) }), bar(c, { y: 150 * u(c), w: safeW(c) * 0.4, h: 8 * u(c), start: 0.5 })] },
  { id: 'photo-title', name: 'Photo + title', fits: ['picture', 'intro', 'outro'], slots: ['title', 'key', 'image'], describe: 'full-screen picture with a dark veil, the title waving in over it',
    build: (s, c) => [W(c, 'kphoto', { asset: pic(c, s.image), w: c.frame.w, h: c.frame.h, veil: 0.45, push: 0.08 }), K(c, words(s.title), { anim: 'wave', key: keyOf(s), color: '#ffffff' })] },
  { id: 'outro', name: 'Outro', fits: ['outro'], slots: ['title', 'sub'], describe: 'closing line bouncing in, a smaller call to action under it',
    build: (s, c) => [K(c, words(s.title, 6), { y: -50 * u(c), anim: 'elastic', size: sz(c, words(s.title, 6), safeW(c), 160) }), K(c, s.sub ?? 'Thanks for watching', { y: 140 * u(c), size: 54 * u(c), color: c.pal.accents[0], anim: 'track', textStart: c.dur * 0.4, upper: false })] },
];

/** A large canvas: each scene arrives from the side and leaves pushing into the next (alternating directions). */
export function frameTypography(items: MotionItem[], c: SceneCtx): MotionItem[] {
  const dir = c.k % 2 ? 1 : -1;
  const out: MotionItem[] = [layer(c, { type: 'background', kind: 'solid', colors: [c.pal.bg, c.pal.bg] }), ...items];
  const cam = layer(c, { type: 'camera', keys: [{ t: 0, x: dir * 260, zoom: 1.08 }, { t: Math.min(0.45, c.dur * 0.3), x: 0, zoom: 1, ease: 'ease-out' }, { t: c.dur, x: -dir * 40, zoom: 1.03, ease: 'linear' }] });
  if (!c.last) cam.keys!.push({ t: Math.max(0, c.dur - 0.22), x: -dir * 60, zoom: 1.04 }, { t: c.dur, x: -dir * 520, zoom: 1.12, ease: 'ease-in' });
  out.push(cam);
  return out;
}

export const TYPOGRAPHY: StyleKit = {
  id: 'typography', name: 'Kinetic typography', genre: 'explainer', status: 'ready',
  description: 'The whole video is type: every word animates on the voice, in modern layouts.',
  includes: ['20 type layouts', '10 letter animations', 'picture inside the letters', 'camera across one big canvas'],
  variants: [
    { id: 'mono', name: 'Mono + yellow', palette: P('#0e0e10', '#f4f1ea', '#ffffff', '#a8a8b0', ['#ffd23f', '#ff4d4d'], 'Montserrat') },
    { id: 'paper', name: 'Paper + red', palette: P('#f4efe3', '#1b1b1b', '#141414', '#6b6560', ['#e63232', '#1f5fff'], 'Archivo Black') },
    { id: 'neon', name: 'Neon night', palette: P('#0a0b1e', '#161a3a', '#ffffff', '#9aa3d6', ['#22e3ff', '#ff3cac'], 'Montserrat') },
    { id: 'bold', name: 'Bold yellow', palette: P('#ffd23f', '#111111', '#111111', '#4a4020', ['#ffffff', '#e63232'], 'Anton') },
    { id: 'arabic', name: 'Arabic', palette: P('#101014', '#f4efe3', '#ffffff', '#b0b0b8', ['#ffc21a', '#ff6b4a'], 'Lalezar') },
  ],
  font: 'Montserrat', templates: T_, frameScene: frameTypography,
  direction: 'Kinetic typography: no illustrations, the words ARE the visuals. One short phrase per scene, ONE key word to emphasise (it gets the accent colour, a slam or the picture inside its letters). Vary layouts (editorial, Swiss grid, brutalist, split screen, outline/fill, 3D extrude, counters, word swaps); use pictures only for picture / split / photo-title scenes.',
  storyShape: 'hook line → 3–6 punchy statements (one key word each, numbers when possible) → a turn ("not X, but Y") → the takeaway → short closing line',
  preview: [
    { template: 'punch', slots: { title: 'Every word moves with your voice', key: 'voice' } },
    { template: 'outline-fill', slots: { title: 'Bold modern type layouts', key: 'modern' } },
    { template: 'swap', slots: { label: 'boring', key: 'ALIVE', title: 'Make your story alive' } },
  ],
  cues: [[/\?\s*$/, 'question'], [/\bnot\b.+\bbut\b/i, 'swap'], [/["“”]/, 'quote']],
};
