/**
 * Typography style library: ready-made designs (layout + palette + fonts + background + animation + overrides)
 * and the user's own saved styles ("My styles", every project). Applying a style keeps the words and timing.
 */
import type { TypoBg, TypoBlock, TypoEnter, TypoExit, TypoStyle, TypoTemplate } from '../types';

export interface TypoDesign {
  id: string;
  name: string;
  group: string;
  template: Exclude<TypoTemplate, 'random'>;
  palette: string;
  fontPair: string;
  bg: TypoBg;
  enter?: TypoEnter;
  exit?: TypoExit;
  speed?: number;
  timing?: TypoBlock['timing'];
  style?: TypoStyle;
}

const d = (id: string, name: string, group: string, template: TypoDesign['template'], palette: string, fontPair: string, bg: TypoBg, extra: Partial<TypoDesign> = {}): TypoDesign => ({ id, name, group, template, palette, fontPair, bg, ...extra });

export const TYPO_DESIGNS: TypoDesign[] = [
  d('news-punch', 'News punch', 'Bold', 'punch', 'mono-yellow', 'bebas-marker', 'shadow', { enter: 'slam' }),
  d('headline-stack', 'Headline stack', 'Bold', 'stack', 'mono-yellow', 'anton-dancing', 'shadow', { enter: 'pop' }),
  d('poster', 'Yellow poster', 'Bold', 'stack', 'yellow-frame', 'archivo-dancing', 'frame', { enter: 'drop' }),
  d('fire-impact', 'Fire impact', 'Bold', 'punch', 'fire', 'anton-dancing', 'shadow', { enter: 'zoom', style: { glow: 0.35 } }),
  d('elegant-script', 'Elegant script', 'Elegant', 'scriptCaps', 'mono-yellow', 'barlow-pacifico', 'shadow', { enter: 'fade', speed: 0.8 }),
  d('wedding', 'Soft gold', 'Elegant', 'scriptCaps', 'mono-yellow', 'archivo-dancing', 'none', { enter: 'fade', speed: 0.7, style: { colors: { text: '#fff7e6', accent: '#e8c27a', minor: '#f3e6cc' }, glow: 0.15 } }),
  d('pen-signature', 'Pen signature', 'Handwritten', 'scriptCaps', 'mono-yellow', 'spartan-pacifico', 'shadow', { enter: 'pen' }),
  d('outline-draw', 'Outline draw', 'Handwritten', 'stack', 'mono-yellow', 'spartan-pacifico', 'none', { enter: 'outline' }),
  d('doodle-notes', 'Doodle notes', 'Handwritten', 'mixed', 'doodle', 'oswald-caveat', 'card', { enter: 'draw' }),
  d('minimal-white', 'Minimal white', 'Minimal', 'stackSide', 'mono-yellow', 'barlow-pacifico', 'none', { enter: 'fade', style: { caps: 'none', colors: { accent: '#ffffff' } } }),
  d('clean-card', 'Clean card', 'Minimal', 'stackSide', 'black-yellow', 'archivo-dancing', 'card', { enter: 'slide' }),
  d('typewriter-doc', 'Typewriter', 'Minimal', 'stack', 'mono-yellow', 'oswald-caveat', 'card', { enter: 'typewriter', style: { caps: 'none' } }),
  d('neon-night', 'Neon night', 'Neon', 'mixed', 'neon', 'bebas-marker', 'none', { enter: 'pop', style: { glow: 0.8 } }),
  d('cyber-mint', 'Cyber mint', 'Neon', 'stack', 'mint', 'anton-dancing', 'none', { enter: 'zoom', style: { glow: 0.6 } }),
  d('pink-glow', 'Pink glow', 'Neon', 'scriptCaps', 'neon', 'barlow-pacifico', 'none', { enter: 'pop', style: { glow: 0.7, colors: { accent: '#ff4fd8', text: '#ffffff', minor: '#ffd6f5' } } }),
  d('retro-80s', 'Retro 80s', 'Retro', 'punch', 'fire', 'bebas-marker', 'shadow', { enter: 'slide', style: { colors: { text: '#ffe66d', accent: '#ff5e9c', minor: '#4ef0ff' }, glow: 0.4 } }),
  d('vintage-film', 'Vintage film', 'Retro', 'scriptCaps', 'doodle', 'oswald-caveat', 'none', { enter: 'fade', speed: 0.8, style: { colors: { text: '#f4e4c1', accent: '#e07a3f', minor: '#e8d5b0' } } }),
  d('shorts-big', 'Shorts big', 'Shorts', 'punch', 'mono-yellow', 'anton-dancing', 'shadow', { enter: 'slam', speed: 1.3, timing: 'lead' }),
  d('shorts-beat', 'On the beat', 'Shorts', 'stack', 'fire', 'bebas-marker', 'shadow', { enter: 'pop', speed: 1.4, timing: 'beat' }),
  d('arabic-bold', 'Arabic bold', 'Arabic', 'stack', 'mono-yellow', 'arabic', 'shadow', { enter: 'pop' }),
  d('arabic-elegant', 'Arabic elegant', 'Arabic', 'scriptCaps', 'mono-yellow', 'arabic', 'none', { enter: 'outline', style: { glow: 0.2 } }),
];

export const DESIGN_GROUPS = [...new Set(TYPO_DESIGNS.map((x) => x.group))];

const KEY = 'typoDesigns';
export const loadMyDesigns = (): TypoDesign[] => JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
export const saveMyDesigns = (list: TypoDesign[]) => localStorage.setItem(KEY, JSON.stringify(list));

/** The design part of a block (for "save as my style"). */
export function designOf(b: TypoBlock, name: string, id: string): TypoDesign {
  return { id, name, group: 'My styles', template: b.template, palette: b.palette, fontPair: b.fontPair, bg: b.bg, enter: b.enter, exit: b.exit, speed: b.speed, timing: b.timing, style: b.style && structuredClone(b.style) };
}

/** Apply a design to a block draft (words, timing and position stay). */
export function applyDesign(b: TypoBlock, x: TypoDesign) {
  Object.assign(b, { template: x.template, palette: x.palette, fontPair: x.fontPair, bg: x.bg, enter: x.enter, exit: x.exit, speed: x.speed, timing: x.timing, style: x.style && structuredClone(x.style) });
}
