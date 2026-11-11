/** Motion Studio (v4): editable motion-graphics layers designed by an AI as a JSON recipe. */

export type MotionPlacement = 'full' | 'overlay' | 'band';

export interface MotionKey {
  t: number;
  x?: number;
  y?: number;
  scale?: number;
  sx?: number;
  sy?: number;
  rotation?: number;
  opacity?: number;
  blur?: number;
  progress?: number;
  zoom?: number;
  tiltX?: number;
  tiltY?: number;
  ease?: string;
}

export interface MotionHighlight {
  word: string;
  style?: 'marker' | 'underline' | 'circle' | 'box' | 'strike' | 'color';
  bg?: string;
  color?: string;
  gradient?: string[];
  at?: number;
}

/** One layer. Times are seconds from the group start; x / y are pixels from the frame centre (recipe frame size). */
export interface MotionItem {
  id: string;
  type: 'background' | 'text' | 'shape' | 'svg' | 'icon' | 'widget' | 'camera' | 'light' | 'placeholder' | 'asset' | 'scene' | 'vector' | '3d' | 'graphic' | 'marker';
  start: number;
  dur: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  in?: string;
  out?: string;
  loop?: string;
  keys?: MotionKey[];
  reveal?: string;
  revealAt?: number;
  revealDur?: number;
  tilt?: [number, number];
  /** Everything else the type uses (text, size, font, colours, widget fields…). */
  [k: string]: unknown;
}

export interface MotionPalette {
  bg: string;
  card: string;
  text: string;
  muted: string;
  accents: string[];
  font?: string;
}

/** One imported recipe = one block on the Motion row. */
export interface MotionGroup {
  id: string;
  name: string;
  start: number;
  dur: number;
  placement: MotionPlacement;
  band?: { side: 'top' | 'bottom'; h: number };
  /** The recipe's frame size (coordinates are relative to its centre). */
  frame: { w: number; h: number };
  palette: MotionPalette;
  items: MotionItem[];
  /** Original prompt / description, for "regenerate". */
  idea?: string;
  hidden?: boolean;
}
