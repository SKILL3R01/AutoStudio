import type { KeywordItem, KeywordSettings } from '../types';
import { clamp, easeInOut, easeOutBack, isRtl } from '../lib/util';

const OUT = 0.22;

function visible(k: KeywordItem, t: number) {
  return t >= k.start && t <= k.end + OUT;
}

export function drawKeywords(ctx: CanvasRenderingContext2D, items: KeywordItem[], t: number, s: KeywordSettings, W: number, H: number) {
  for (const k of items) if (visible(k, t)) drawKeyword(ctx, k, t, s, W, H);
}

/** Draw one artistic keyword with its entrance animation and a short exit. */
export function drawKeyword(ctx: CanvasRenderingContext2D, k: KeywordItem, t: number, s: Pick<KeywordSettings, 'stroke' | 'shadow'>, W: number, H: number) {
  const local = t - k.start;
  const exit = clamp((t - k.end) / OUT, 0, 1);
  const base = Math.min(W, H * 16 / 9);
  const fs = Math.round(base * 0.075 * k.size);
  const a = clamp(local / 0.28, 0, 1);
  let scale = 1, dx = 0, dy = 0, rot = k.rotate, alpha = 1, chars = k.text.length;
  switch (k.anim) {
    case 'pop': scale = easeOutBack(a); break;
    case 'slam': {
      scale = 1 + (1 - easeInOut(clamp(local / 0.16, 0, 1))) * 1.3;
      const shake = local > 0.16 ? Math.exp(-(local - 0.16) * 14) : 0;
      dx = Math.sin(local * 90) * fs * 0.06 * shake;
      dy = Math.cos(local * 70) * fs * 0.05 * shake;
      alpha = clamp(local / 0.08, 0, 1);
      break;
    }
    case 'typewriter': chars = Math.ceil(clamp(local / Math.max(0.2, k.text.length * 0.045), 0, 1) * k.text.length); break;
    case 'slide': dx = (1 - easeInOut(a)) * -W * 0.25; alpha = a; break;
    case 'rotate': rot = k.rotate - (1 - easeOutBack(a)) * 90; scale = 0.4 + 0.6 * easeOutBack(a); alpha = a; break;
    case 'glow': alpha = a; break;
    case 'split': break;
    case 'draw': break;
    case 'marker': break;
  }
  alpha *= 1 - exit;
  scale *= 1 - exit * 0.25;
  if (alpha <= 0 || scale <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${/Bebas|Anton|Bangers|Marker/.test(k.font) ? 400 : 900} ${fs}px "${k.font}", sans-serif`;
  const w = ctx.measureText(k.text).width;
  // Keep the whole word inside the frame (with a small margin).
  const half = Math.min(W * 0.48, w / 2 + fs * 0.15);
  const cx = clamp(k.x * W, half, W - half), cy = clamp(k.y * H, fs * 0.7, H - fs * 0.7);
  ctx.translate(cx + dx, cy + dy);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(scale * Math.min(1, (W * 0.96) / (w + fs * 0.3)), scale * Math.min(1, (W * 0.96) / (w + fs * 0.3)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.direction = isRtl(k.text) ? 'rtl' : 'ltr';
  const text = k.text.slice(0, chars);

  if (k.anim === 'marker') {
    const sweep = easeInOut(clamp(local / 0.35, 0, 1));
    ctx.fillStyle = k.color;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillRect(-w / 2 - fs * 0.18, -fs * 0.42, (w + fs * 0.36) * sweep, fs * 0.84);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#111';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return;
  }
  if (s.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = fs * 0.22;
    ctx.shadowOffsetY = fs * 0.06;
  }
  if (k.anim === 'glow') {
    ctx.shadowColor = k.color;
    ctx.shadowBlur = fs * (0.35 + 0.25 * Math.sin(local * 6));
    ctx.shadowOffsetY = 0;
  }
  if (k.anim === 'split') {
    // Letters drop in one after another.
    let x = -w / 2;
    for (const [i, ch] of [...k.text].entries()) {
      const cw = ctx.measureText(ch).width;
      const la = clamp((local - i * 0.04) / 0.22, 0, 1);
      if (la > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * la;
        ctx.translate(x + cw / 2, -(1 - easeOutBack(la)) * fs * 0.8);
        if (s.stroke) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = fs * 0.1;
          ctx.strokeText(ch, 0, 0);
        }
        ctx.fillStyle = k.color;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
      x += cw;
    }
    ctx.restore();
    return;
  }
  if (k.anim === 'draw') {
    const p = clamp(local / 0.6, 0, 1);
    ctx.strokeStyle = k.color;
    ctx.lineWidth = Math.max(2, fs * 0.04);
    ctx.setLineDash([w * 4 * p, w * 4]);
    ctx.strokeText(text, 0, 0);
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha * clamp((local - 0.45) / 0.3, 0, 1);
    ctx.fillStyle = k.color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return;
  }
  if (s.stroke) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = fs * 0.12;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = k.color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
