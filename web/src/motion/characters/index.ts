/** Character widgets: the stick figure and the cartoon look share one skeleton (`look` picks the drawing). */
import type { MotionItem } from '../types';
import type { WidgetApi } from '../widgets';
import { STICK_WIDGETS } from './stick';
import { drawCartoon } from './cartoon';

type W = (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void;
export const CHARACTER_WIDGETS: Record<string, W> = {
  ...STICK_WIDGETS,
  character: (ctx, it, t, a) => (it.look === 'cartoon' ? drawCartoon(ctx, it, t, a) : STICK_WIDGETS.character(ctx, it, t, a)),
};
