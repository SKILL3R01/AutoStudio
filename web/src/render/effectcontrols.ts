/**
 * Effects 2.0: named controls for every effect (colours, size, speed, direction…), stored in `EffectLayer.opts`,
 * plus blend mode and area (whole frame, top, bottom, behind / in front of the subject using the clip's depth map).
 */
import type { EffectKind, EffectLayer } from '../types';

export type Opts = Record<string, number | string>;
export interface Control {
  key: string;
  label: string;
  kind: 'range' | 'color';
  def: number | string;
  /** Shader uniform u_p1..u_p4 that receives this value. */
  u?: 1 | 2 | 3 | 4;
}
const R = (key: string, label: string, def = 0.5, u?: 1 | 2 | 3 | 4): Control => ({ key, label, kind: 'range', def, u });
const C = (key: string, label: string, def: string): Control => ({ key, label, kind: 'color', def });
const PART = (c1: string, c2: string) => [C('c1', 'Colour 1', c1), C('c2', 'Colour 2', c2), R('size', 'Size'), R('speed', 'Speed'), R('direction', 'Direction'), R('wind', 'Wind')];

export const EFFECT_CONTROLS: Partial<Record<EffectKind, Control[]>> = {
  vignette: [C('color', 'Colour', '#000000'), R('size', 'Size', 0.35)],
  vhs: [R('shift', 'Colour shift'), R('lines', 'Scanlines')],
  crt: [R('lines', 'Scanlines')],
  glitch: [R('rate', 'How often')],
  lightLeak: [C('c1', 'Colour 1', '#ff7828'), C('c2', 'Colour 2', '#ff3c78'), R('speed', 'Speed')],
  snow: [C('color', 'Colour', '#ffffff'), R('size', 'Size'), R('speed', 'Speed'), R('wind', 'Wind')],
  rain: [C('color', 'Colour', '#c8dcff'), R('angle', 'Angle'), R('speed', 'Speed'), R('darken', 'Darken', 0.3)],
  embers: [C('c1', 'Colour 1', '#ffb43c'), C('c2', 'Colour 2', '#ff3c00'), R('size', 'Size'), R('speed', 'Speed')],
  bokeh: [C('color', 'Colour', '#ffcf73'), R('size', 'Size'), R('speed', 'Speed')],
  cinematic: [C('tint', 'Tint', '#005a6e'), R('bars', 'Black bars', 1)],
  fire: [C('c1', 'Flame', '#ff8c14'), C('c2', 'Base', '#e61e00'), R('height', 'Height', 0.5, 1)],
  fog: [C('color', 'Colour', '#d1dbe6'), R('speed', 'Speed', 0.3, 1), R('height', 'Height', 0.5, 2)],
  godRays: [C('color', 'Colour', '#ffeec7'), R('angle', 'Light position', 0.75, 1)],
  filmBurn: [C('color', 'Colour', '#ff590d'), R('speed', 'Speed', 0.5, 1)],
  glowPulse: [R('speed', 'Pulse speed', 0.5, 1), C('color', 'Glow colour', '#ffffff')],
  sparks: PART('#fff4c2', '#ff6a1a'), smoke: PART('#c8c8cd', '#96969f'), confetti: PART('#ff4d6d', '#4d96ff'),
  hearts: PART('#ff4d8d', '#ffb3c8'), stars: PART('#fff6b0', '#ffd23f'), petals: PART('#ffc2d6', '#ff8fb3'),
  leaves: PART('#e0a030', '#b5541b'), bubbles: PART('#cfefff', '#ffffff'), fireflies: PART('#fff59a', '#c6ff6b'), lightDust: PART('#fff3d6', '#ffffff'),
  lightning: [C('color', 'Colour', '#c8d7ff'), R('rate', 'How often')],
  tealOrange: [R('warmth', 'Warmth', 0.5, 1)],
  bwFilm: [R('contrast', 'Contrast', 0.6, 1), R('grain', 'Grain', 0.4, 2)],
  sepia: [C('color', 'Tone', '#704214')],
  bleach: [R('contrast', 'Contrast', 0.6, 1)],
  duotone: [C('c1', 'Shadows', '#1b1464'), C('c2', 'Highlights', '#ffcc33')],
  colorPop: [C('c1', 'Colour to keep', '#e63232'), R('range', 'Colour range', 0.3, 1)],
  chromatic: [R('amount', 'Amount', 0.5, 1)],
  rgbSplit: [R('amount', 'Amount', 0.5, 1), R('angle', 'Angle', 0, 2)],
  zoomBlur: [R('x', 'Centre X', 0.5, 1), R('y', 'Centre Y', 0.5, 2)],
  heatHaze: [R('speed', 'Speed', 0.5, 1), R('height', 'Height', 0.5, 2)],
  lensFlare: [C('color', 'Colour', '#ffd9a0'), R('x', 'Light X', 0.78), R('y', 'Light Y', 0.18)],
  lensDirt: [C('c1', 'Colour', '#fff1d6')],
  halftone: [R('size', 'Dot size', 0.4, 1), C('c1', 'Ink', '#111111'), C('c2', 'Paper', '#f4efe3')],
  comic: [R('levels', 'Colour levels', 0.4, 1), R('edges', 'Ink edges', 0.6, 2)],
  pixelate: [R('size', 'Pixel size', 0.3, 1)],
  oldFilm: [C('c1', 'Tone', '#c8a46e'), R('weave', 'Gate weave', 0.5, 1), R('scratches', 'Scratches', 0.5, 2)],
  paper: [C('c1', 'Paper', '#efe6d2'), R('texture', 'Texture', 0.5, 1)],
  rainGlass: [R('drops', 'Drops', 0.5, 1), R('blur', 'Blur behind', 0.5, 2)],
  neonEdges: [C('c1', 'Colour 1', '#22e3ff'), C('c2', 'Colour 2', '#ff3cac'), R('darken', 'Darken picture', 0.6, 1)],
  strobe: [C('color', 'Colour', '#ffffff'), R('speed', 'Speed')],
  shake: [R('size', 'Strength'), R('speed', 'Speed')],
  beatGlitch: [R('size', 'Strength')],
};

/** Effects that only add light / particles on top: drawn on a transparent layer, so any blend mode works. */
export const OVERLAY_EFFECTS = new Set<EffectKind>(['snow', 'rain', 'embers', 'bokeh', 'lightLeak', 'sparks', 'smoke', 'confetti', 'hearts', 'stars', 'petals', 'leaves', 'bubbles', 'fireflies', 'lightDust', 'lightning', 'lensFlare', 'strobe']);

export const EFFECT_GROUPS: [string, EffectKind[]][] = [
  ['Looks', ['cinematic', 'tealOrange', 'bwFilm', 'sepia', 'bleach', 'duotone', 'colorPop', 'vignette', 'glowPulse']],
  ['Lens & light', ['lightLeak', 'lensFlare', 'godRays', 'bokeh', 'chromatic', 'rgbSplit', 'zoomBlur', 'heatHaze', 'lensDirt']],
  ['Retro', ['grain', 'vhs', 'crt', 'oldFilm', 'filmBurn', 'dust', 'halftone', 'comic', 'pixelate', 'paper']],
  ['Weather', ['snow', 'rain', 'rainGlass', 'fog', 'lightning', 'smoke', 'fire']],
  ['Particles', ['sparks', 'embers', 'petals', 'leaves', 'bubbles', 'fireflies', 'lightDust', 'confetti', 'hearts', 'stars']],
  ['Energy', ['glitch', 'beatGlitch', 'neonEdges', 'strobe', 'shake']],
];

export const BLENDS: [string, string][] = [['normal', 'Normal'], ['screen', 'Screen'], ['lighter', 'Add'], ['overlay', 'Overlay'], ['multiply', 'Multiply'], ['soft-light', 'Soft light']];
export const AREAS: [string, string][] = [['all', 'Whole frame'], ['top', 'Top'], ['bottom', 'Bottom'], ['behind', 'Behind subject'], ['front', 'On subject']];

/** All values of a layer: defaults, then legacy `params` (shader slots), then saved opts. */
export function effectOpts(e: Pick<EffectLayer, 'kind' | 'opts' | 'params'>): Opts {
  const o: Opts = {};
  for (const c of EFFECT_CONTROLS[e.kind] ?? []) o[c.key] = c.u && e.params?.[c.u - 1] !== undefined ? e.params[c.u - 1] : c.def;
  return { ...o, ...e.opts };
}
export const num = (o: Opts | undefined, k: string, d = 0.5) => (typeof o?.[k] === 'number' ? (o[k] as number) : d);
export const str = (o: Opts | undefined, k: string, d: string) => (typeof o?.[k] === 'string' ? (o[k] as string) : d);

/** Shader inputs from opts: u_p1..u_p4 and the first two colour controls. */
export function shaderInputs(kind: EffectKind, o: Opts): { params: number[]; colors: string[] } {
  const ctl = EFFECT_CONTROLS[kind] ?? [];
  const params = [0.5, 0.5, 0.5, 0.5];
  for (const c of ctl) if (c.u) params[c.u - 1] = num(o, c.key, c.def as number);
  return { params, colors: ctl.filter((c) => c.kind === 'color').map((c) => str(o, c.key, c.def as string)) };
}

export const hexRgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
export const rgba = (h: string, a: number) => `rgba(${hexRgb(h).join(',')},${a})`;

/** My effects: a configured layer saved by the user (kind + opts + name). */
export interface MyEffect { id: string; name: string; kind: EffectKind; opts: Opts }
export const loadMyEffects = (): MyEffect[] => {
  try {
    return JSON.parse(localStorage.getItem('myEffects') || '[]');
  } catch {
    return [];
  }
};
export const saveMyEffects = (l: MyEffect[]) => localStorage.setItem('myEffects', JSON.stringify(l));
