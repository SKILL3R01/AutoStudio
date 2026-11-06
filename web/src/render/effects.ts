import type { EffectKind } from '../types';
import { hash } from '../lib/util';
import { BUILTIN_SHADERS, applyShader } from './shaderfx';
import { PARTICLE_PRESETS, drawLightning, drawParticles } from './particles';

export const EFFECT_LABELS: Record<EffectKind, string> = {
  none: 'None', grain: 'Film grain', vhs: 'VHS', crt: 'CRT', glitch: 'Glitch', lightLeak: 'Light leak',
  vignette: 'Vignette', snow: 'Snow', dust: 'Dust', rain: 'Rain', embers: 'Embers', bokeh: 'Bokeh', cinematic: 'Cinematic',
  fire: 'Fire', fog: 'Fog', godRays: 'God rays', filmBurn: 'Film burn', glowPulse: 'Glow pulse', sparks: 'Sparks', smoke: 'Smoke',
  confetti: 'Confetti', hearts: 'Hearts', stars: 'Star burst', lightning: 'Lightning', custom: 'Custom',
};

/** How heavy each effect is to render (shown in the panel; heavy ones are thinned in fast preview). */
export const EFFECT_COST: Record<EffectKind, 'light' | 'medium' | 'heavy'> = {
  none: 'light', grain: 'light', vhs: 'medium', crt: 'medium', glitch: 'medium', lightLeak: 'light', vignette: 'light', snow: 'medium',
  dust: 'light', rain: 'medium', embers: 'medium', bokeh: 'medium', cinematic: 'light', fire: 'medium', fog: 'medium', godRays: 'heavy',
  filmBurn: 'medium', glowPulse: 'heavy', sparks: 'medium', smoke: 'medium', confetti: 'medium', hearts: 'light', stars: 'medium',
  lightning: 'light', custom: 'medium',
};

let noiseTiles: HTMLCanvasElement[] | undefined;
let scratch: HTMLCanvasElement | undefined;

function noise() {
  if (noiseTiles) return noiseTiles;
  noiseTiles = Array.from({ length: 4 }, (_, k) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = hash(i * 0.37 + k * 1013.1) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  });
  return noiseTiles;
}

function copyFrame(ctx: CanvasRenderingContext2D, W: number, H: number) {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== W || scratch.height !== H) {
    scratch.width = W;
    scratch.height = H;
  }
  const g = scratch.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  g.drawImage(ctx.canvas, 0, 0);
  return scratch;
}

function grain(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, k: number) {
  const tile = noise()[Math.floor(t * 24) % 4];
  ctx.save();
  ctx.globalAlpha = 0.08 + 0.3 * k;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.translate(-hash(Math.floor(t * 24)) * 256, -hash(Math.floor(t * 24) + 1) * 256);
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

function scanlines(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number, gap: number) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < H; y += gap) ctx.fillRect(0, y, W, Math.max(1, gap / 3));
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.3 + 0.6 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function chroma(ctx: CanvasRenderingContext2D, W: number, H: number, px: number, alpha: number) {
  const src = copyFrame(ctx, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.filter = 'sepia(1) hue-rotate(-50deg) saturate(6)';
  ctx.drawImage(src, -px, 0);
  ctx.filter = 'sepia(1) hue-rotate(150deg) saturate(6)';
  ctx.drawImage(src, px, 0);
  ctx.restore();
}

type Particle = (i: number) => void;
let quality = 1;
/** 1 = full (paused / export), 0.5 = fast preview while playing. */
export const setEffectQuality = (q: number) => void (quality = q);
export const effectQuality = () => quality;

function particles(n: number, draw: Particle) {
  const count = Math.max(1, Math.ceil(n * quality));
  for (let i = 0; i < count; i++) draw(i);
}

export function drawEffect(ctx: CanvasRenderingContext2D, kind: EffectKind, k: number, t: number, W: number, H: number, params?: number[]) {
  if (kind in BUILTIN_SHADERS) return void applyShader(ctx, BUILTIN_SHADERS[kind], k, t, params);
  if (kind in PARTICLE_PRESETS) return drawParticles(ctx, PARTICLE_PRESETS[kind].spec, k, t, W, H, quality, kind.length);
  if (kind === 'lightning') return drawLightning(ctx, k, t, W, H);
  const u = Math.min(W, H) / 1080;
  switch (kind) {
    case 'grain': return grain(ctx, t, W, H, k);
    case 'vignette': return vignette(ctx, W, H, k);
    case 'vhs': {
      chroma(ctx, W, H, 3 + 6 * k * u, 0.35);
      scanlines(ctx, W, H, 0.12 + 0.2 * k, Math.max(3, Math.round(4 * u)));
      const bandY = ((t * 0.15) % 1) * H * 1.2 - H * 0.1;
      ctx.save();
      ctx.globalAlpha = 0.15 * k + 0.05;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, bandY, W, H * 0.04);
      ctx.restore();
      grain(ctx, t, W, H, k * 0.6);
      ctx.save();
      ctx.font = `700 ${Math.round(42 * u)}px "Inter", monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText('PLAY ▶', 48 * u, 70 * u);
      const s = Math.floor(t);
      ctx.fillText(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 48 * u, H - 50 * u);
      ctx.restore();
      return;
    }
    case 'crt': {
      scanlines(ctx, W, H, 0.25 + 0.25 * k, Math.max(3, Math.round(3 * u)));
      ctx.save();
      ctx.globalAlpha = 0.04 + 0.05 * hash(Math.floor(t * 30));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      chroma(ctx, W, H, 2 * u, 0.2);
      return vignette(ctx, W, H, 0.4 + k * 0.6);
    }
    case 'glitch': {
      const f = Math.floor(t * 12);
      if (hash(f) > 0.85 - k * 0.35) {
        const src = copyFrame(ctx, W, H);
        const slices = 6 + Math.floor(hash(f + 1) * 10);
        for (let i = 0; i < slices; i++) {
          const y = hash(f * 13 + i) * H, h = (0.01 + hash(f * 7 + i) * 0.06) * H;
          const off = (hash(f * 3 + i) - 0.5) * W * 0.08 * (0.5 + k);
          ctx.drawImage(src, 0, y, W, h, off, y, W, h);
        }
        chroma(ctx, W, H, 8 * u * (0.5 + k), 0.4);
      }
      return;
    }
    case 'lightLeak': {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const blobs = [['255,120,40', 0], ['255,60,120', 2.1], ['255,200,80', 4.2]] as const;
      blobs.forEach(([c, ph], i) => {
        const x = W * (0.5 + 0.6 * Math.sin(t * 0.25 + ph)), y = H * (0.5 + 0.5 * Math.cos(t * 0.2 + ph * 1.3));
        const r = Math.max(W, H) * (0.45 + 0.1 * Math.sin(t * 0.3 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${c},${0.25 + 0.4 * k})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
      ctx.restore();
      return;
    }
    case 'snow': {
      ctx.save();
      ctx.fillStyle = '#fff';
      particles(Math.round(60 + 240 * k), (i) => {
        const sp = 0.05 + hash(i + 2) * 0.12, r = (1 + hash(i + 3) * 3.5) * u;
        const y = ((hash(i + 1) + t * sp) % 1) * (H + 20) - 10;
        const x = hash(i) * W + Math.sin(t * (0.5 + hash(i + 4)) + i) * 25 * u;
        ctx.globalAlpha = 0.5 + 0.5 * hash(i + 5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      return;
    }
    case 'dust': {
      const f = Math.floor(t * 24);
      ctx.save();
      particles(Math.round(10 + 50 * k), (i) => {
        const x = hash(f * 31 + i) * W, y = hash(f * 17 + i) * H, r = (0.6 + hash(f + i * 3) * 2.2) * u;
        ctx.fillStyle = hash(f + i) > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      if (hash(f * 5) > 0.8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = u;
        const x = hash(f * 9) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (hash(f) - 0.5) * 20 * u, H);
        ctx.stroke();
      }
      ctx.restore();
      grain(ctx, t, W, H, k * 0.4);
      return;
    }
    case 'rain': {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,220,255,0.45)';
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      particles(Math.round(80 + 320 * k), (i) => {
        const sp = 1.2 + hash(i + 1) * 0.8, len = (20 + hash(i + 2) * 30) * u;
        const y = ((hash(i + 3) + t * sp) % 1) * (H + len) - len;
        const x = hash(i) * (W + 200 * u) - 100 * u + y * 0.15;
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * 0.15, y + len);
      });
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,50,0.15)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case 'embers': {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      particles(Math.round(25 + 90 * k), (i) => {
        const sp = 0.04 + hash(i + 1) * 0.08;
        const y = H - ((hash(i + 2) + t * sp) % 1) * (H + 40);
        const x = hash(i) * W + Math.sin(t * 1.3 + i) * 30 * u;
        const r = (1.5 + hash(i + 3) * 3) * u, fl = 0.5 + 0.5 * Math.sin(t * 8 + i * 3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(255,180,60,${0.9 * fl})`);
        g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      });
      ctx.restore();
      return;
    }
    case 'bokeh': {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      particles(Math.round(8 + 22 * k), (i) => {
        const x = (hash(i) * W + t * 12 * u * (hash(i + 1) - 0.5)) % W, y = hash(i + 2) * H + Math.sin(t * 0.3 + i) * 20 * u;
        const r = (30 + hash(i + 3) * 70) * u;
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
        const hue = 30 + hash(i + 4) * 40;
        g.addColorStop(0, `hsla(${hue},90%,70%,0.18)`);
        g.addColorStop(1, `hsla(${hue},90%,70%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      return;
    }
    case 'cinematic': {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(0,90,110,${0.25 * k + 0.1})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      vignette(ctx, W, H, k * 0.6);
      const bar = Math.max(0, (H - W / 2.39) / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      return;
    }
  }
}
