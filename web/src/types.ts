import type { ParticleSpec } from './render/particles';
import type { VoiceFx } from './audio/enhance';
import type { PenFont } from './render/strokefont';
import type { Credit } from './lib/freemedia';
export type AssetKind = 'image' | 'video' | 'audio';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  duration?: number;
  width?: number;
  height?: number;
  /** 720p working copy used by the preview only (export always uses the original). */
  proxyId?: string;
}

export type MotionEasing = 'easeInOut' | 'linear' | 'easeIn' | 'easeOut';
export interface Framing {
  scale: number;
  x: number;
  y: number;
}

export const MOTIONS = [
  'none', 'zoomIn', 'zoomOut', 'panLeft', 'panRight', 'tiltUp', 'tiltDown',
  'diagonal', 'drift', 'breathe', 'alternate', 'random', 'custom', 'parallaxZoom', 'parallaxOrbit', 'dollyZoom',
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
  'fire', 'fog', 'godRays', 'filmBurn', 'glowPulse', 'sparks', 'smoke', 'confetti', 'hearts', 'stars', 'lightning', 'custom',
] as const;
export type EffectKind = (typeof EFFECTS)[number];

export type EffectScope = { kind: 'all' } | { kind: 'range'; start: number; end: number } | { kind: 'clips'; ids: string[] };

export interface EffectLayer {
  kind: EffectKind;
  intensity: number;
  /** Where the effect applies (missing = whole video). */
  scope?: EffectScope;
  /** Seconds the effect fades in / out at the edges of its range. */
  fadeIn?: number;
  fadeOut?: number;
  /** kind 'custom': which entry of `project.customEffects`. */
  customId?: string;
  /** Up to four effect parameters (0..1), passed to shaders as u_p1..u_p4. */
  params?: number[];
}

/** A user / AI-made effect: a GLSL shader body, or a particle system. */
export interface CustomEffect {
  id: string;
  name: string;
  kind: 'shader' | 'particles';
  code?: string;
  particles?: ParticleSpec;
  /** Names for the u_p1..u_p4 sliders (shader effects). */
  paramNames?: string[];
}

export interface ColorAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Exposure in stops (−2..2). */
  exposure?: number;
  /** Warm (+) / cool (−), −1..1. */
  temperature?: number;
  /** Magenta (+) / green (−), −1..1. */
  tint?: number;
  /** Recover (−) or boost (+) the bright / dark tones, −1..1. */
  highlights?: number;
  shadows?: number;
  /** Boosts muted colours more than saturated ones, −1..1. */
  vibrance?: number;
  /** Lifted blacks (faded film), 0..1. */
  fade?: number;
  /** Split toning: teal shadows + orange highlights (+) or the reverse (−), −1..1. */
  split?: number;
  /** Darken the edges of the frame, 0..1. */
  vignette?: number;
  /** A `.cube` LUT from `project.luts`, mixed in by `lutAmount` (0..1). */
  lut?: string;
  lutAmount?: number;
}

/** A 3D colour lookup table imported from a `.cube` file (RGB, 8-bit, base64). */
export interface Lut {
  id: string;
  name: string;
  size: number;
  data: string;
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
  /** For video assets: playback speed (0.25–4, default 1). Sound follows the speed (pitch changes). */
  speed?: number;
  /** Seconds the clip's own sound fades in / out. */
  fadeIn?: number;
  fadeOut?: number;
  fit: 'cover' | 'contain';
  color?: ColorAdjust;
  /** Per-clip motion strength (overrides the project's motion depth). */
  motionDepth?: number;
  /** Play the preset backwards (pan right ↔ left, zoom in ↔ out). */
  motionReverse?: boolean;
  motionEasing?: MotionEasing;
  /** For the `custom` motion: framing at the start and end of the clip (scale ≥ 1, x/y offsets as fractions). */
  motionCustom?: { from: Framing; to: Framing };
  /** Blank section: when set the clip has no media and is filled with this colour. */
  fill?: string;
  /** Asset id of a grayscale depth map (white = near). */
  depthId?: string;
  regions?: Region[];
  /** The user chose to ignore the too-short / too-long warning for this clip. */
  ignoreDuration?: boolean;
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

export const TYPO_ENTERS = ['auto', 'pop', 'slam', 'slide', 'drop', 'zoom', 'fade', 'draw', 'typewriter', 'outline', 'pen'] as const;
export type TypoEnter = (typeof TYPO_ENTERS)[number];
export const TYPO_EXITS = ['auto', 'fade', 'zoomOut', 'slideOut', 'none'] as const;
export type TypoExit = (typeof TYPO_EXITS)[number];

export interface TypoWord {
  text: string;
  /** When the word is spoken (it pops in then). */
  start: number;
  end: number;
  role: TypoRole;
  font?: string;
  color?: string;
  /** Per-word entrance animation (overrides the block's). */
  anim?: TypoEnter;
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
  /** Word entrance animation (`auto` = by role, the template default). */
  enter?: TypoEnter;
  exit?: TypoExit;
  /** Animation speed multiplier (default 1). */
  speed?: number;
  /** Seconds between word reveals; 0 / missing = each word appears when it is spoken. */
  stagger?: number;
  /** Single-line font for the `pen` entrance (default: script for script/accent words, handwriting otherwise). */
  penFont?: PenFont;
  /** Design overrides on top of the palette / font pair (Typography studio). */
  style?: TypoStyle;
  /** When words appear: as spoken (default), slightly before (lead-in), or snapped to the music beat. */
  timing?: 'word' | 'lead' | 'beat';
}

export interface TypoStyle {
  colors?: Partial<{ text: string; minor: string; accent: string; card: string; frame: string; outline: string }>;
  fonts?: Partial<Record<'main' | 'minor' | 'script' | 'side', { family: string; weight: number }>>;
  /** auto = caps for main words, lowercase script; upper = all caps; none = as typed. */
  caps?: 'auto' | 'upper' | 'none';
  /** Neon glow 0..1. */
  glow?: number;
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
  /** Legacy (≤ v1.9): which layers showed. Now `enabled` = subtitles and `typography` = typography, independently. */
  mode: 'full' | 'keywords' | 'both';
  /** Show the kinetic typography layer (independent of the subtitles). */
  typography?: boolean;
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
  /** Hand-drawn entrance: the outline draws itself then fills, or real pen writing (single-line font). */
  write?: 'none' | 'outline' | 'pen';
  penFont?: PenFont;
  /** Seconds to finish writing (default: natural pen speed for the text). */
  writeTime?: number;
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
  /** Playback rate (detached audio of a sped-up clip keeps its speed). Default 1. */
  rate?: number;
  duck: boolean;
  /** Music level while the voice speaks, as a fraction of its volume (default 0.35). */
  duckDepth?: number;
  /** Seconds to dip before speech starts (default 0.25). */
  duckAttack?: number;
  /** Seconds to come back up after speech ends (default 0.4). */
  duckRelease?: number;
  /** Volume curve over the timeline: points (seconds, 0..2 multiplier). */
  curve?: { t: number; v: number }[];
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
  /** `splits` = cut points (seconds into the voice file) that divide the narration into selectable segments. */
  voiceover?: { assetId: string; volume: number; splits?: number[]; fx?: VoiceFx };
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
  /** Custom effects made in the Effects lab. */
  customEffects?: CustomEffect[];
  color: ColorAdjust;
  /** LUTs used by the project's or clips' colour grades. */
  luts: Lut[];
  /** Template applied by the guided wizard (Templates). */
  templateId?: string;
  /** Guided first-video wizard: current step (undefined = closed). */
  wizardStep?: number;
  /** Voice Studio script (paragraphs separated by blank lines). */
  voiceScript?: string;
  /** Media-search vectors (CLIP, base64 Float32) per asset id. */
  embeddings?: Record<string, string>;
  /** Where free media came from (licence + credit line). */
  credits?: Credit[];
  export: ExportSettings;
}
