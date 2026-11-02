export type AssetKind = 'image' | 'video' | 'audio';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  duration?: number;
  width?: number;
  height?: number;
}

export const MOTIONS = [
  'none', 'zoomIn', 'zoomOut', 'panLeft', 'panRight', 'tiltUp', 'tiltDown',
  'diagonal', 'drift', 'breathe', 'alternate', 'random', 'parallaxZoom', 'parallaxOrbit', 'dollyZoom',
] as const;
/** Motions that need a depth map (generated in-browser). */
export const DEPTH_MOTIONS = ['parallaxZoom', 'parallaxOrbit', 'dollyZoom'] as const;
export type Motion = (typeof MOTIONS)[number];

export const TRANSITIONS = [
  'none', 'crossfade', 'fadeBlack', 'fadeWhite', 'flash', 'slideLeft', 'slideRight', 'slideUp',
  'slideDown', 'zoomPunch', 'wipe', 'blur', 'glitch', 'circle', 'random',
] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const EFFECTS = [
  'none', 'grain', 'vhs', 'crt', 'glitch', 'lightLeak', 'vignette', 'snow', 'dust', 'rain',
  'embers', 'bokeh', 'cinematic',
] as const;
export type EffectKind = (typeof EFFECTS)[number];

export interface EffectLayer {
  kind: EffectKind;
  intensity: number;
}

export interface ColorAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface Clip {
  id: string;
  assetId: string;
  /** Timeline start in seconds. Clips are contiguous: a clip ends where the next starts. */
  start: number;
  /** For video assets: offset into the source. */
  trimIn: number;
  /** For video assets: where the source stops (defaults to its end). */
  trimOut?: number;
  /** For video assets: loop the trimmed range instead of freezing on the last frame. */
  loop?: boolean;
  motion: Motion;
  transition: Transition;
  volume: number;
  fit: 'cover' | 'contain';
  color?: ColorAdjust;
  /** Blank section: when set the clip has no media and is filled with this colour. */
  fill?: string;
  /** Asset id of a grayscale depth map (white = near). */
  depthId?: string;
  regions?: Region[];
}

export const REGION_EFFECTS = ['sway', 'ripple', 'glow', 'flicker', 'shimmer', 'hue', 'blink', 'sparkle', 'pop'] as const;
export type RegionEffect = (typeof REGION_EFFECTS)[number];

/** An animated detail inside a clip, selected with a click (SAM mask). */
export interface Region {
  id: string;
  name: string;
  /** Asset id of the mask PNG (white = selected). */
  maskId: string;
  effect: RegionEffect;
  intensity: number;
  speed: number;
  trigger: 'loop' | 'beats' | 'keywords';
  color: string;
}

export const KEYWORD_ANIMS = ['pop', 'slam', 'typewriter', 'slide', 'rotate', 'glow', 'draw', 'split', 'marker'] as const;
export type KeywordAnim = (typeof KEYWORD_ANIMS)[number];

export interface KeywordItem {
  id: string;
  text: string;
  start: number;
  end: number;
  /** Centre position as a fraction of the frame. */
  x: number;
  y: number;
  font: string;
  color: string;
  /** Height relative to the frame (1 = default). */
  size: number;
  rotate: number;
  anim: KeywordAnim;
  locked: boolean;
}

export interface KeywordSettings {
  /** Keywords per 10 seconds. */
  density: number;
  combo: string;
  palette: string;
  placement: 'random' | 'grid' | 'safe';
  seed: number;
  anims: KeywordAnim[];
  /** Minimum seconds each keyword stays visible. */
  hold: number;
  stroke: boolean;
  shadow: boolean;
  uppercase: boolean;
}

export const TYPO_TEMPLATES = ['stack', 'stackSide', 'mixed', 'scriptCaps', 'punch', 'random'] as const;
export type TypoTemplate = (typeof TYPO_TEMPLATES)[number];
export type TypoRole = 'main' | 'minor' | 'accent' | 'script' | 'side';
export type TypoBg = 'none' | 'shadow' | 'card' | 'frame';

export interface TypoWord {
  text: string;
  /** When the word is spoken (it pops in then). */
  start: number;
  end: number;
  role: TypoRole;
  font?: string;
  color?: string;
}

/** A kinetic-typography composition: a short phrase laid out artistically, revealed word by word with the voice. */
export interface TypoBlock {
  id: string;
  start: number;
  end: number;
  template: Exclude<TypoTemplate, 'random'>;
  /** Centre of the block as a fraction of the frame. */
  x: number;
  y: number;
  scale: number;
  rotate: number;
  palette: string;
  fontPair: string;
  bg: TypoBg;
  words: TypoWord[];
  locked: boolean;
}

export interface TypoSettings {
  /** Blocks per 10 seconds. */
  density: number;
  template: TypoTemplate;
  palette: string;
  fontPair: string;
  bg: TypoBg;
  /** Extra seconds a block stays after its last word. */
  hold: number;
  maxWords: number;
  seed: number;
}

export interface FlowScene {
  seq: number;
  start: number;
  text: string;
  prompt: string;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface CaptionLine {
  start: number;
  end: number;
  words: Word[];
}

export interface CaptionSettings {
  enabled: boolean;
  /** Full subtitles, artistic keywords only, or both. */
  mode: 'full' | 'keywords' | 'both';
  style: string;
  font: string;
  size: number;
  position: number;
  maxWords: number;
  uppercase: boolean;
  wordLevel: boolean;
}

export interface Overlay {
  id: string;
  text: string;
  /** When set, the overlay draws this image instead of text (`size` is then its width as a fraction of the frame). */
  assetId?: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  size: number;
  color: string;
  font: string;
  weight: number;
  rotate: number;
  blur: number;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  background: string;
  shadow: boolean;
}

export interface MusicItem {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  trimIn: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  duck: boolean;
}

export interface SfxItem {
  id: string;
  /** Built-in synth name or `asset:<id>` for an uploaded sound. */
  sound: string;
  start: number;
  volume: number;
}

export type Aspect = '16:9' | '9:16' | '1:1' | '4:5';

export interface ExportSettings {
  aspect: Aspect;
  fps: number;
  resolution: 'full' | '720' | '480';
  quality: 'low' | 'medium' | 'high';
  background: 'blur' | 'black';
  format: 'mp4' | 'webm';
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  assets: Asset[];
  voiceover?: { assetId: string; volume: number };
  /** Explicit length when there is no voiceover. */
  length: number;
  /** Seconds of visuals before the narration starts (intro). */
  voiceStart: number;
  /** Seconds after the narration ends (outro). */
  tail: number;
  /** Master audio fade in/out in seconds. */
  audioFade: { in: number; out: number };
  clips: Clip[];
  motionDepth: number;
  transitionDuration: number;
  sceneFades: { fadeIn: number; fadeOut: number };
  words: Word[];
  /** Line-level captions (used when only coarse timings are available). */
  lines: CaptionLine[];
  captions: CaptionSettings;
  /** Legacy single-word keywords (migrated into `typo` on load). */
  keywords: KeywordItem[];
  keywordSettings: KeywordSettings;
  typo: TypoBlock[];
  typoSettings: TypoSettings;
  /** Scene list sent to the Google Flow extension (prompt order → timestamp). */
  flowScenes: FlowScene[];
  overlays: Overlay[];
  music: MusicItem[];
  sfx: SfxItem[];
  effects: EffectLayer[];
  color: ColorAdjust;
  export: ExportSettings;
}
