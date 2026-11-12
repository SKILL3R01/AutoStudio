/** "Cartoon" style kit (v5.3): the story scene designs with bean-head cartoon characters in bright painted sets. */
import type { MotionItem } from '../types';
import { FACES } from '../characters/stick';
import { W, layer } from './kit';
import { STICK } from './stick';
import type { SceneCtx, StyleKit } from './types';

const INK = '#2b1a2e';
/** Bright, bouncy framing: cartoon look on every character and set, ink-outlined titles, pop / burst transitions. */
export function frameCartoon(items: MotionItem[], c: SceneCtx): MotionItem[] {
  const dark = c.pal.text !== INK && /^#(?:[0-5])/i.test(c.pal.bg);
  const toon = items.map((it): MotionItem => {
    if (it.type === 'widget' && (it.widget === 'character' || it.widget === 'set')) return { ...it, look: 'cartoon', rim: false };
    if (it.type === 'widget' && it.widget === 'bubble') return { ...it, line: INK };
    if (it.type === 'text') return { ...it, stroke: { color: dark ? INK : '#ffffff', width: 10 }, in: it.in === 'cinematic-rise' ? 'pop-up' : it.in };
    return it;
  });
  const out: MotionItem[] = [layer(c, { type: 'background', kind: 'flat', colors: [c.pal.bg] }), ...toon];
  const cam = layer(c, { type: 'camera', keys: [{ t: 0, zoom: 1.0 }, { t: Math.min(0.35, c.dur / 3), zoom: 1.03, ease: 'overshoot' }, { t: c.dur, zoom: 1.06, x: c.k % 2 ? 20 : -20, ease: 'ease' }] });
  out.push(cam);
  if (!c.last) {
    const acc = c.pal.accents;
    out.push(W(c, c.k % 2 ? 'burst' : 'wipe', { start: Math.max(0, c.dur - 0.5), dur: 1, dir: c.k % 4 < 2 ? 'left' : 'up', colors: [acc[0], acc[1] ?? acc[0], c.pal.bg], count: 9 }));
  }
  return out;
}

export const CARTOON: StyleKit = {
  ...STICK,
  id: 'cartoon', name: 'Cartoon', genre: 'cartoon', status: 'ready',
  description: 'Bean-head cartoon characters with ink outlines in bright painted sets — fun stories and kids’ explainers.',
  includes: ['18 scene designs', 'cartoon cast with big eyes', 'talks with your voice', 'painted sets'],
  variants: [
    { id: 'day', name: 'Sunny day', palette: { bg: '#8fd3ff', card: '#fff6e5', text: INK, muted: '#6b5a6e', accents: ['#ff7a45', '#ffd23f', '#4caf50'], font: 'Poppins' } },
    { id: 'candy', name: 'Candy', palette: { bg: '#ffd6e8', card: '#fff4fa', text: INK, muted: '#7a5a6e', accents: ['#7b61ff', '#ffb703', '#06d6a0'], font: 'Poppins' } },
    { id: 'sunset', name: 'Sunset', palette: { bg: '#ffb38a', card: '#ffe8d6', text: INK, muted: '#6b4a3e', accents: ['#3a86ff', '#ffbe0b', '#fb5607'], font: 'Poppins' } },
    { id: 'night', name: 'Bedtime', palette: { bg: '#24305e', card: '#374785', text: '#fdfdfd', muted: '#a8b0d6', accents: ['#f76c6c', '#f8e9a1', '#a8d0e6'], font: 'Poppins' } },
  ],
  font: 'Poppins', frameScene: frameCartoon,
  direction: `Playful cartoon story: a bean-head hero with big eyes (and sometimes a friend) acting out the narration in bright painted sets with ink outlines, short punchy speech bubbles, bouncy timing, one joke or surprise per scene. Extra slots: mood = ${FACES.join(' | ')}; place = street | office | home | classroom | night | stage | park. Keep bubbles ≤ 7 words.`,
  storyShape: 'hook fact → setting → 2–4 escalating beats → "But…" → ironic payoff',
  preview: [
    { template: 'walk-in', slots: { title: 'Meet Max', key: 'Max', place: 'street' } },
    { template: 'shocked-number', slots: { value: '3,000', label: 'cups of coffee' } },
    { template: 'celebrate', slots: { title: 'He did it!', key: 'did', place: 'park' } },
  ],
};
