/**
 * Hand-drawn text:
 *  - "outline": the letters' outlines are drawn on (any font, any script — Arabic too), then the fill fades in.
 *  - "pen": real handwriting with single-line fonts, stroke by stroke (Latin letters, digits, punctuation).
 * Both expect `ctx.textAlign = 'center'` and `textBaseline = 'middle'` around the origin.
 */
import { drawPen, layoutPen, type PenFont, type PenLayout } from './strokefont';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Outline draw-on, then fill. `progress` 0..1. */
export function drawOutlineWrite(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, progress: number, color: string, size: number) {
  const pa = clamp01(progress / 0.72), pf = clamp01((progress - 0.55) / 0.45);
  const w = ctx.measureText(text).width;
  const rtl = /[\u0590-\u08ff]/.test(text);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Each glyph contour is dashed from its start, so every letter traces itself…
  const dash = size * 5;
  ctx.setLineDash([dash, dash * 4]);
  ctx.lineDashOffset = dash * (1 - pa);
  // …while a moving edge reveals the word in reading order.
  const reveal = (w + size * 0.6) * Math.min(1, pa * 1.35);
  ctx.beginPath();
  if (rtl) ctx.rect(x + w / 2 + size * 0.3 - reveal, y - size * 1.2, reveal, size * 2.4);
  else ctx.rect(x - w / 2 - size * 0.3, y - size * 1.2, reveal, size * 2.4);
  ctx.clip();
  ctx.strokeText(text, x, y);
  ctx.restore();
  if (pf > 0) {
    ctx.save();
    ctx.globalAlpha *= pf;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

const layouts = new Map<string, PenLayout>();
const layoutCached = (text: string, font: PenFont, size: number) => {
  const k = `${font}|${Math.round(size)}|${text}`;
  let L = layouts.get(k);
  if (!L) {
    if (layouts.size > 300) layouts.clear();
    layouts.set(k, (L = layoutPen(text, font, size)));
  }
  return L;
};

/** Pen writing centred on (x, y). `maxWidth` squeezes long lines horizontally. Returns the pen-tip position. */
export function drawPenWrite(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, progress: number, color: string, size: number, font: PenFont, maxWidth?: number) {
  const L = layoutCached(text, font, size * 1.25);
  if (!L.length) return null;
  const sx = maxWidth && L.width > maxWidth ? maxWidth / L.width : 1;
  ctx.save();
  ctx.translate(x - (L.width * sx) / 2, y + size * 0.28);
  ctx.scale(sx, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * (font === 'allure' ? 0.055 : 0.075)) / Math.sqrt(sx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const tip = drawPen(ctx, L, progress);
  if (tip && progress > 0 && progress < 1) {
    // A small glowing nib at the end of the line while writing.
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], ctx.lineWidth * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return tip;
}

/** Seconds a pen needs to write `text` at a natural pace (used when no duration is set). */
export const penDuration = (text: string) => 0.35 + text.replace(/\s/g, '').length * 0.09;
