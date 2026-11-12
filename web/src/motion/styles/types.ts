/** v5 style kits: a complete look (palette variants, fonts, backgrounds, transitions, designed scene templates, prompt direction). */
import type { MotionItem, MotionPalette } from '../types';

/** Content a template is filled with (by the app from the scene text, or by the AI). */
export interface Slots {
  title?: string;
  key?: string;
  value?: string;
  label?: string;
  sub?: string;
  items?: string[];
  left?: string[];
  right?: string[];
  image?: string;
  image2?: string;
  icon?: string;
  date?: string;
}

export interface SceneCtx {
  dur: number;
  frame: { w: number; h: number };
  pal: MotionPalette;
  font: string;
  /** Scene index in the video (varies backgrounds / transitions / tilts). */
  k: number;
  /** Seconds from the scene start when the key word is spoken. */
  keyAt: number;
  last: boolean;
  /** Pictures from the project to use when a slot has none (asset ids). */
  images: string[];
}

export type Fit = 'intro' | 'plain' | 'number' | 'percent' | 'money' | 'compare' | 'list' | 'question' | 'quote' | 'date' | 'trend' | 'outro' | 'picture' | 'chapter';

export interface SceneTemplate {
  id: string;
  name: string;
  fits: Fit[];
  /** Slots the template uses (the AI fills these). */
  slots: (keyof Slots)[];
  /** One line for the AI catalogue. */
  describe: string;
  build: (s: Slots, c: SceneCtx) => MotionItem[];
}

export interface StyleVariant { id: string; name: string; palette: MotionPalette }

export interface StyleKit {
  id: string;
  name: string;
  genre: 'story' | 'documentary' | 'explainer' | 'cartoon' | 'custom';
  status: 'ready' | 'soon';
  description: string;
  includes: string[];
  variants: StyleVariant[];
  font: string;
  templates: SceneTemplate[];
  /** Background, camera, transition and lights around a scene's own layers. */
  frameScene: (items: MotionItem[], c: SceneCtx) => MotionItem[];
  /** Art direction for the AI. */
  direction: string;
  /** Story shape when the AI writes the script. */
  storyShape: string;
  /** Animated gallery card: three templates with sample content. */
  preview: { template: string; slots: Slots }[];
  /** Custom styles: built on another kit's templates. */
  base?: string;
}
