/** "Clean explainer" style kit: flat cards, icons, charts and counters on calm gradients (SaaS / education / finance). */
import { PALETTES } from '../recipe';
import type { MotionItem } from '../types';
import { W, T, cap, pair, portrait, safeW, titleSize, u, layer } from './kit';
import type { SceneCtx, SceneTemplate, Slots, StyleKit } from './types';

const head = (c: SceneCtx, s: Slots, at: { x: number; y: number }, width: number, size?: number) =>
  W(c, 'headline', { x: at.x, y: at.y, title: s.title ?? '', gold: s.key, sub: s.sub ?? '', width, size: size ?? titleSize(s.title ?? '', width, portrait(c) ? 96 : 92), align: 'center' });
const items = (s: Slots, n = 4) => (s.items?.length ? s.items : [s.title ?? '']).filter(Boolean).slice(0, n);
const num = (v?: string, d = 75) => (v ? parseFloat(v.replace(/[^\d.]/g, '')) || d : d);

const T_: SceneTemplate[] = [
  { id: 'headline', name: 'Headline', fits: ['plain', 'intro'], slots: ['title', 'key', 'sub'], describe: 'one bold headline, key word in gold, small caps line under it',
    build: (s, c) => [head(c, s, { x: 0, y: 0 }, safeW(c), titleSize(s.title ?? '', safeW(c), 120))] },
  { id: 'say', name: 'Spoken words', fits: ['plain'], slots: ['key'], describe: 'the spoken words appear one by one with the voice, key word in gold',
    build: (s, c) => [W(c, 'say', { text: '', key: s.key ? [s.key] : [], size: 110 * u(c), pill: false })] },
  { id: 'kinetic', name: 'Kinetic lines', fits: ['intro', 'question', 'plain'], slots: ['title', 'key'], describe: 'two short punchy lines one after another',
    build: (s, c) => {
      const ws = (s.title ?? '').split(' '), h = Math.ceil(ws.length / 2);
      return [W(c, 'kinetic', { lines: ws.length > 3 ? [ws.slice(0, h).join(' '), ws.slice(h).join(' ')] : [s.title ?? ''], highlight: s.key ? [s.key] : [], size: 130 * u(c) })];
    } },
  { id: 'big-number', name: 'Big number', fits: ['number', 'money', 'percent'], slots: ['value', 'label'], describe: 'a huge counting number with a label under it',
    build: (s, c) => [W(c, 'rays', { y: -30, size: 320 * u(c), strength: 0.25, color: c.pal.accents[1] ?? c.pal.accents[0], flashes: [1.2] }), W(c, 'stat', { value: s.value ?? '100%', label: s.label ?? s.title ?? '', size: 230 * u(c), y: -30 })] },
  { id: 'donut', name: 'Percent ring', fits: ['percent'], slots: ['value', 'title', 'key'], describe: 'a ring filling to the percentage, headline beside it',
    build: (s, c) => { const p = pair(c); return [W(c, 'donut', { ...p.vis, value: num(s.value), label: s.label ?? '', size: 380 * u(c) }), head(c, s, p.txt, p.txtW)]; } },
  { id: 'chart-up', name: 'Line chart', fits: ['trend', 'money', 'number'], slots: ['value', 'label', 'title', 'key'], describe: 'a line chart drawing itself with a counter and a +/- delta, headline beside it',
    build: (s, c) => {
      const p = pair(c), down = /-|drop|fell|less|decline/i.test(`${s.value} ${s.title}`);
      return [W(c, 'chart-line', { ...p.vis, w: Math.min(800, p.visW), h: 460 * (portrait(c) ? 1.1 : 1), value: s.value ?? '', label: (s.label ?? '').toUpperCase(), delta: down ? '-' + (s.value ?? '30%').replace(/^[-+]/, '') : '+' + (s.value ?? '30%').replace(/^[-+$]/, ''), values: down ? [9, 8, 8.5, 6, 5, 3, 2] : [2, 3, 2.6, 4.2, 3.8, 5.6, 8] }), head(c, s, p.txt, p.txtW)];
    } },
  { id: 'bars', name: 'Bar chart', fits: ['number', 'trend', 'compare'], slots: ['items', 'title', 'key'], describe: 'bars growing (items = bar labels), headline beside it',
    build: (s, c) => { const p = pair(c); const it = items(s, 4); return [W(c, 'bars', { ...p.vis, w: Math.min(780, p.visW), h: 460, values: [35, 55, 48, 90].slice(-Math.max(2, it.length)), labels: it.map((x) => x.split(' ')[0].slice(0, 10)), suffix: '' }), head(c, s, p.txt, p.txtW)]; } },
  { id: 'compare', name: 'Compare', fits: ['compare'], slots: ['left', 'right', 'label', 'sub'], describe: 'two cards side by side, ✗ old way vs ✓ new way (label = left title, sub = right title)',
    build: (s, c) => [W(c, 'compare', { left: { title: s.label ?? 'Before', items: (s.left?.length ? s.left : [s.title ?? '']).slice(0, 4) }, right: { title: s.sub ?? 'After', items: (s.right?.length ? s.right : [s.key ?? '']).slice(0, 4) }, w: Math.min(1400, safeW(c)), h: portrait(c) ? 520 : 440, scale: portrait(c) ? 0.8 : 1, palette: 'paper' })] },
  { id: 'checklist', name: 'Checklist', fits: ['list'], slots: ['items', 'title'], describe: 'boxes ticking one by one, short title beside',
    build: (s, c) => { const p = pair(c, true); return [W(c, 'checklist', { ...p.vis, items: items(s), w: Math.min(900, p.visW) }), head(c, { title: s.title ?? '' }, p.txt, p.txtW)]; } },
  { id: 'steps', name: 'Steps', fits: ['list', 'date'], slots: ['items'], describe: 'numbered steps on a dotted path, highlight moving',
    build: (s, c) => [W(c, 'steps', { items: items(s), w: Math.min(1300, safeW(c) * 0.85), y: 20, scale: portrait(c) ? 0.75 : 1 })] },
  { id: 'chips', name: 'Chips', fits: ['list', 'plain'], slots: ['items', 'title', 'key'], describe: 'headline + a row of icon chips',
    build: (s, c) => [head(c, s, { x: 0, y: -120 * u(c) }, safeW(c)), W(c, 'chips', { items: items(s).map((t) => ({ icon: t.toLowerCase().split(' ')[0], title: cap(t) })), y: 130 * u(c), scale: portrait(c) ? 0.8 : 1 })] },
  { id: 'cards', name: 'Three cards', fits: ['list', 'plain'], slots: ['items'], describe: 'three feature cards with icons',
    build: (s, c) => [W(c, 'cards', { items: items(s, 3).map((t, i) => ({ icon: t.toLowerCase().split(' ')[0], title: cap(t.split(' ').slice(0, 3).join(' ')), sub: '', color: c.pal.accents[i % c.pal.accents.length] })), w: Math.min(1400, safeW(c)), cardH: 240, scale: portrait(c) ? 0.85 : 1 })] },
  { id: 'phone-chat', name: 'Phone chat', fits: ['plain', 'question'], slots: ['title', 'key', 'items'], describe: 'a phone with chat bubbles (items = messages), headline beside it',
    build: (s, c) => { const p = pair(c); const m = items(s, 3); return [W(c, 'phone', { ...p.vis, w: 300 * u(c) * (portrait(c) ? 1.3 : 1), title: cap(s.key) || 'Chat', messages: (m.length > 1 ? m : [s.title ?? '…', '…']).map((t, i) => ({ text: t, me: i % 2 === 1 })) }), head(c, s, p.txt, p.txtW)]; } },
  { id: 'search', name: 'Search box', fits: ['question'], slots: ['title'], describe: 'a search / prompt box typing the question, then the button is clicked',
    build: (s, c) => [W(c, 'typing', { text: s.title ?? '', button: 'Go', w: Math.min(1100, safeW(c)) })] },
  { id: 'quote', name: 'Quote card', fits: ['quote'], slots: ['title', 'key', 'label'], describe: 'a quote card (title = the quote, label = who said it)',
    build: (s, c) => [W(c, 'quote', { text: s.title ?? '', name: s.label ?? '', role: '', highlight: s.key ? [s.key] : [], w: Math.min(1100, safeW(c)), h: 420, size: Math.max(36, 58 - (s.title ?? '').length / 6), palette: 'paper' })] },
  { id: 'bento', name: 'Bento facts', fits: ['number', 'list'], slots: ['value', 'label', 'items'], describe: 'a grid of colourful fact panels (a number, a mini chart, words)',
    build: (s, c) => [W(c, 'bento', { w: Math.min(1500, safeW(c)), h: portrait(c) ? 900 : 520, cells: [{ type: 'stat', value: s.value ?? '100%', label: s.label ?? '' }, { type: 'chart', values: [2, 4, 3, 6, 8] }, ...items(s, 3).map((t) => ({ type: 'text', text: t.toUpperCase() })), { type: 'icon', icon: 'sparkles' }].slice(0, 6) })] },
  { id: 'icon-hero', name: 'Big icon', fits: ['plain', 'intro'], slots: ['icon', 'title', 'key'], describe: 'one big glossy icon with light rays and a headline',
    build: (s, c) => { const p = pair(c); return [W(c, 'rays', { ...p.vis, size: 260 * u(c), strength: 0.3, color: c.pal.accents[1] ?? c.pal.accents[0] }), layer(c, { type: 'icon', name: s.icon ?? 'sparkles', style: 'gradient', color: c.pal.accents[0], size: 150 * u(c), ...p.vis, in: 'elastic-pop', loop: 'float' }), head(c, s, p.txt, p.txtW)]; } },
  { id: 'progress', name: 'Progress bar', fits: ['percent', 'number'], slots: ['value', 'title', 'key'], describe: 'headline + a progress bar filling to the value',
    build: (s, c) => [head(c, s, { x: 0, y: -110 * u(c) }, safeW(c)), W(c, 'progress', { value: num(s.value, 70), label: s.label ?? '', w: Math.min(1000, safeW(c)), y: 140 * u(c) })] },
  { id: 'window-code', name: 'App window', fits: ['plain', 'list'], slots: ['items', 'title', 'key'], describe: 'an app window typing lines (items), headline beside it',
    build: (s, c) => { const p = pair(c); return [W(c, 'window', { ...p.vis, w: Math.min(820, p.visW), h: 480, title: cap(s.key) || 'app', lines: items(s, 5).length > 1 ? items(s, 5) : ['', '', '', ''] }), head(c, s, p.txt, p.txtW)]; } },
  { id: 'stat-trio', name: 'Three numbers', fits: ['number', 'list'], slots: ['items'], describe: 'three counters side by side (items like "40% phones")',
    build: (s, c) => items(s, 3).map((t, i, all) => { const v = /[\d.,]+%?|\$[\d.,]+[kmb]?/i.exec(t)?.[0] ?? String((i + 1) * 3); const lab = t.replace(v, '').trim(); const step = portrait(c) ? 0 : (safeW(c) / all.length); return W(c, 'stat', { x: portrait(c) ? 0 : -safeW(c) / 2 + step * (i + 0.5), y: portrait(c) ? (i - (all.length - 1) / 2) * 360 : -20, value: v, label: lab, size: 150 * u(c), start: i * 0.25, dur: c.dur - i * 0.25 }); }) },
  { id: 'highlight', name: 'Highlighted sentence', fits: ['plain', 'quote'], slots: ['title', 'key'], describe: 'the sentence large with a marker swipe on the key word',
    build: (s, c) => [T(c, s.title ?? '', { size: titleSize(s.title ?? '', safeW(c) * 1.6, 96), width: safeW(c), align: 'center', in: 'saas-words', highlight: s.key ? [{ word: s.key, style: 'marker', bg: c.pal.accents[1] ?? '#ffd23f', at: Math.max(0.4, c.keyAt) }] : [] })] },
  { id: 'question', name: 'Question', fits: ['question'], slots: ['title', 'key'], describe: 'the question big with a circled key word and a question badge',
    build: (s, c) => [layer(c, { type: 'icon', name: 'circle-help', style: 'badge', color: c.pal.accents[0], size: 90 * u(c), y: -200 * u(c), in: 'elastic-pop', loop: 'pulse' }), T(c, s.title ?? '', { y: 40 * u(c), size: titleSize(s.title ?? '', safeW(c) * 1.6, 100), width: safeW(c), align: 'center', highlight: s.key ? [{ word: s.key, style: 'circle', color: c.pal.accents[0], at: Math.max(0.5, c.keyAt) }] : [] })] },
  { id: 'chapter', name: 'Chapter card', fits: ['chapter', 'intro'], slots: ['label', 'title'], describe: 'a chapter title card (label = "PART 2")',
    build: (s, c) => [W(c, 'tag', { text: s.label ?? 'CHAPTER', y: -110 * u(c) }), T(c, s.title ?? '', { y: 30 * u(c), size: titleSize(s.title ?? '', safeW(c), 130), width: safeW(c), align: 'center', in: 'pro-rise-glow', gradient: ['#ffffff', c.pal.accents[1] ?? c.pal.accents[0]] })] },
  { id: 'outro', name: 'Logo outro', fits: ['outro'], slots: ['title', 'sub'], describe: 'logo reveal with a tagline, rays and sparkles (title = name)',
    build: (s, c) => [W(c, 'rays', { y: -60, size: 320 * u(c), strength: 0.3, color: c.pal.accents[1] ?? c.pal.accents[0], flashes: [1] }), W(c, 'logo-reveal', { name: s.title ?? 'Thanks', tagline: s.sub ?? '', size: 200 * u(c), y: -40 }), W(c, 'sparkles', { y: -110, count: 8, spread: 260, at: [0.9] })] },
];

const MOODS = (p: StyleKit['variants'][number]['palette']) => [[p.bg, p.card], [p.card, p.bg], [p.bg, p.accents[0]], [p.bg, p.accents[1] ?? p.card]];
const BG = ['gradient', 'flat', 'mesh', 'grid', 'glow'];
const TR = ['wipe', 'burst', 'slices', 'band-wipe', 'push'];

/** Background per scene (moods cycle), a slow camera push, a transition into the next scene, vignette. */
export function frameExplainer(items: MotionItem[], c: SceneCtx): MotionItem[] {
  const moods = MOODS(c.pal), mood = moods[c.k % moods.length], next = moods[(c.k + 1) % moods.length];
  const out: MotionItem[] = [layer(c, { type: 'background', kind: BG[c.k % BG.length], colors: mood }), ...items];
  const cam = layer(c, { type: 'camera', keys: [{ t: 0, zoom: 1 }, { t: c.dur, zoom: 1.05, x: c.k % 2 ? 30 : -30, ease: 'ease' }] });
  out.push(cam);
  if (!c.last) {
    const tr = TR[c.k % TR.length], acc = c.pal.accents;
    if (tr === 'push') cam.keys!.push({ t: Math.max(0, c.dur - 0.25), zoom: 1.05 }, { t: c.dur, zoom: 1.35, ease: 'ease-in' });
    else out.push(W(c, tr, { start: Math.max(0, c.dur - 0.55), dur: 1.1, dir: c.k % 2 ? 'left' : 'up', colors: tr === 'burst' ? [acc[0], acc[1] ?? acc[0], next[0]] : [acc[0], next[0]], count: 9 }));
  }
  out.push(layer(c, { type: 'light', light: 'vignette' }));
  return out;
}

export const EXPLAINER: StyleKit = {
  id: 'explainer', name: 'Clean explainer', genre: 'explainer', status: 'ready',
  description: 'Flat cards, icons, charts and counters — clear and modern.',
  includes: ['24 scene designs', 'charts & counters', 'icons', 'smooth transitions'],
  variants: [
    { id: 'dark', name: 'Midnight', palette: PALETTES.dark }, { id: 'brand', name: 'Warm gold', palette: PALETTES.brand }, { id: 'ocean', name: 'Ocean', palette: PALETTES.ocean },
    { id: 'sunset', name: 'Sunset', palette: PALETTES.sunset }, { id: 'neon', name: 'Neon', palette: PALETTES.neon }, { id: 'hud', name: 'Tech HUD', palette: PALETTES.hud },
  ],
  font: 'Montserrat', templates: T_, frameScene: frameExplainer,
  direction: 'Clean modern explainer: flat cards with soft shadows, icons, counters and charts, one idea per scene, bold headline with ONE gold key word, calm gradient backgrounds that change mood per scene, smooth wipes / bursts between scenes.',
  storyShape: 'hook question → why it matters → 3–5 clear points (one number or example each) → what to do → short call to action',
  preview: [
    { template: 'big-number', slots: { value: '+1,200', label: 'new viewers' } },
    { template: 'chart-up', slots: { value: '$2.4M', label: 'Revenue', title: 'It grows every month', key: 'grows' } },
    { template: 'checklist', slots: { items: ['Script', 'Voice', 'Motion'], title: 'Done in minutes' } },
  ],
};
