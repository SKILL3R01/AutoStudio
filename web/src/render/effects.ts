import type { EffectKind, EffectLayer } from '../types';
import { OVERLAY_EFFECTS, effectOpts, hexRgb, num, rgba, shaderInputs, str, type Opts } from './effectcontrols';
import { hash } from '../lib/util';
import { BUILTIN_SHADERS, applyShader } from './shaderfx';
import { PARTICLE_PRESETS, drawLightning, drawParticles, tuneSpec } from './particles';

export const EFFECT_LABELS: Record<EffectKind, string> = {
  none: 'None', grain: 'Film grain', vhs: 'VHS', crt: 'CRT', glitch: 'Glitch', lightLeak: 'Light leak',
  vignette: 'Vignette', snow: 'Snow', dust: 'Dust', rain: 'Rain', embers: 'Embers', bokeh: 'Bokeh', cinematic: 'Cinematic',
  fire: 'Fire', fog: 'Fog', godRays: 'God rays', filmBurn: 'Film burn', glowPulse: 'Glow pulse', sparks: 'Sparks', smoke: 'Smoke',
  confetti: 'Confetti', hearts: 'Hearts', stars: 'Star burst', lightning: 'Lightning', custom: 'Custom',
  tealOrange: 'Teal & orange', bwFilm: 'B&W film', sepia: 'Sepia', bleach: 'Bleach bypass', duotone: 'Duotone', colorPop: 'Colour pop',
  chromatic: 'Chromatic', rgbSplit: 'RGB split', zoomBlur: 'Zoom blur', heatHaze: 'Heat haze', lensFlare: 'Lens flare', lensDirt: 'Lens dirt',
  halftone: 'Halftone', comic: 'Comic', pixelate: 'Pixelate', oldFilm: 'Old film', paper: 'Paper', petals: 'Petals', leaves: 'Leaves',
  bubbles: 'Bubbles', fireflies: 'Fireflies', lightDust: 'Light dust', rainGlass: 'Rain on glass', neonEdges: 'Neon edges', strobe: 'Strobe',
  shake: 'Shake', beatGlitch: 'Beat glitch',
};

/** How heavy each effect is to render (shown in the panel; heavy ones are thinned in fast preview). */
export const EFFECT_COST: Record<EffectKind, 'light' | 'medium' | 'heavy'> = {
  none: 'light', grain: 'light', vhs: 'medium', crt: 'medium', glitch: 'medium', lightLeak: 'light', vignette: 'light', snow: 'medium',
  dust: 'light', rain: 'medium', embers: 'medium', bokeh: 'medium', cinematic: 'light', fire: 'medium', fog: 'medium', godRays: 'heavy',
  filmBurn: 'medium', glowPulse: 'heavy', sparks: 'medium', smoke: 'medium', confetti: 'medium', hearts: 'light', stars: 'medium',
  lightning: 'light', custom: 'medium',
  tealOrange: 'light', bwFilm: 'light', sepia: 'light', bleach: 'light', duotone: 'light', colorPop: 'light', chromatic: 'light', rgbSplit: 'light',
  zoomBlur: 'medium', heatHaze: 'light', lensFlare: 'light', lensDirt: 'heavy', halftone: 'light', comic: 'medium', pixelate: 'light', oldFilm: 'light',
  paper: 'light', petals: 'medium', leaves: 'medium', bubbles: 'medium', fireflies: 'medium', lightDust: 'medium', rainGlass: 'heavy', neonEdges: 'medium',
  strobe: 'light', shake: 'light', beatGlitch: 'medium',
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

function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, color = '#000000', size = 0.35) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.6 - 0.5 * size), W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, 0.3 + 0.6 * k));
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

/**
 * Draw one built-in effect. `o` = its controls (effectcontrols.ts; defaults when missing), `beats` = narration / music
 * onsets (for the beat glitch).
 */
export function drawEffect(ctx: CanvasRenderingContext2D, kind: EffectKind, k: number, t: number, W: number, H: number, params?: number[], o: Opts = effectOpts({ kind, params }), beats: number[] = []) {
  if (kind in BUILTIN_SHADERS) {
    const si = shaderInputs(kind, o);
    return void applyShader(ctx, BUILTIN_SHADERS[kind], k, t, si.params, si.colors);
  }
  if (kind in PARTICLE_PRESETS) return drawParticles(ctx, tuneSpec(PARTICLE_PRESETS[kind].spec, o), k, t, W, H, quality, kind.length);
  if (kind === 'lightning') return drawLightning(ctx, k * (0.5 + num(o, 'rate')), t, W, H, str(o, 'color', '#c8d7ff'));
  const u = Math.min(W, H) / 1080;
  switch (kind) {
    case 'grain': return grain(ctx, t, W, H, k);
    case 'vignette': return vignette(ctx, W, H, k, str(o, 'color', '#000000'), num(o, 'size', 0.35));
    case 'lensFlare': {
      const lx = num(o, 'x', 0.78) * W, ly = num(o, 'y', 0.18) * H, col = str(o, 'color', '#ffd9a0');
      const flick = 0.85 + 0.15 * Math.sin(t * 2.3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const core = ctx.createRadialGradient(lx, ly, 0, lx, ly, H * 0.35);
      core.addColorStop(0, rgba(col, 0.9 * k * flick));
      core.addColorStop(0.15, rgba(col, 0.35 * k));
      core.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, W, H);
      for (const [f, r, a] of [[0.35, 0.05, 0.25], [0.6, 0.09, 0.15], [0.85, 0.03, 0.3], [1.3, 0.14, 0.1]]) {
        const gx = lx + (W / 2 - lx) * 2 * f, gy = ly + (H / 2 - ly) * 2 * f;
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, H * r);
        gg.addColorStop(0, rgba(col, a * k));
        gg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(gx, gy, H * r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    case 'strobe': {
      const hz = 1 + 7 * num(o, 'speed');
      if ((t * hz) % 1 < 0.18) (ctx.fillStyle = rgba(str(o, 'color', '#ffffff'), 0.5 * k)), ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'shake': {
      const sp = 6 + 20 * num(o, 'speed'), amp = (4 + 26 * num(o, 'size')) * u * k;
      const dx = (hash(Math.floor(t * sp)) - 0.5) * 2 * amp, dy = (hash(Math.floor(t * sp) + 7) - 0.5) * 2 * amp;
      const src = copyFrame(ctx, W, H);
      ctx.save();
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.scale(1 + (amp * 2.5) / W, 1 + (amp * 2.5) / H);
      ctx.drawImage(src, -W / 2, -H / 2);
      ctx.restore();
      return;
    }
    case 'beatGlitch': {
      const hit = beats.some((b) => t >= b && t - b < 0.12) || (!beats.length && (t * 2) % 1 < 0.06);
      if (hit) drawEffect(ctx, 'glitch', Math.min(1, 0.6 + num(o, 'size')), Math.floor(t * 12) / 12 + 0.01, W, H, undefined, { rate: 1 });
      return;
    }
    case 'vhs': {
      chroma(ctx, W, H, (3 + 6 * k * u) * (0.4 + 1.2 * num(o, 'shift')), 0.35);
      scanlines(ctx, W, H, (0.12 + 0.2 * k) * (0.4 + 1.2 * num(o, 'lines')), Math.max(3, Math.round(4 * u)));

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
      scanlines(ctx, W, H, (0.25 + 0.25 * k) * (0.4 + 1.2 * num(o, 'lines')), Math.max(3, Math.round(3 * u)));
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
      if (hash(f) > 0.85 - k * 0.35 - (num(o, 'rate') - 0.5) * 0.6) {
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
      const c1 = hexRgb(str(o, 'c1', '#ff7828')), c2 = hexRgb(str(o, 'c2', '#ff3c78'));
      const mid = c1.map((v, j) => Math.min(255, Math.round((v + c2[j]) / 2 + 30)));
      const blobs = [[c1.join(','), 0], [c2.join(','), 2.1], [mid.join(','), 4.2]] as const;
      const ts = t * (0.4 + 1.2 * num(o, 'speed'));
      blobs.forEach(([c, ph], i) => {
        const x = W * (0.5 + 0.6 * Math.sin(ts * 0.25 + ph)), y = H * (0.5 + 0.5 * Math.cos(ts * 0.2 + ph * 1.3));
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
      ctx.fillStyle = str(o, 'color', '#ffffff');
      const sz = 0.4 + 1.2 * num(o, 'size'), spf = 0.4 + 1.2 * num(o, 'speed'), wind = (num(o, 'wind') - 0.5) * 0.6;
      particles(Math.round(60 + 240 * k), (i) => {
        const sp = (0.05 + hash(i + 2) * 0.12) * spf, r = (1 + hash(i + 3) * 3.5) * u * sz;
        const y = ((hash(i + 1) + t * sp) % 1) * (H + 20) - 10;
        const x = ((((hash(i) + wind * (y / H)) % 1) + 1) % 1) * W + Math.sin(t * (0.5 + hash(i + 4)) + i) * 25 * u;
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
      ctx.strokeStyle = rgba(str(o, 'color', '#c8dcff'), 0.45);
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      const slope = (num(o, 'angle') - 0.5) * 1.6 + 0.15, spf = 0.5 + num(o, 'speed');
      particles(Math.round(80 + 320 * k), (i) => {
        const sp = (1.2 + hash(i + 1) * 0.8) * spf, len = (20 + hash(i + 2) * 30) * u;
        const y = ((hash(i + 3) + t * sp) % 1) * (H + len) - len;
        const x = hash(i) * (W + 400 * u) - 200 * u + y * slope;
        ctx.moveTo(x, y);
        ctx.lineTo(x + len * slope, y + len);
      });
      ctx.stroke();
      ctx.fillStyle = `rgba(20,30,50,${0.5 * num(o, 'darken', 0.3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case 'embers': {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const e1 = str(o, 'c1', '#ffb43c'), e2 = str(o, 'c2', '#ff3c00'), esz = 0.4 + 1.2 * num(o, 'size'), esp = 0.4 + 1.2 * num(o, 'speed');
      particles(Math.round(25 + 90 * k), (i) => {
        const sp = (0.04 + hash(i + 1) * 0.08) * esp;
        const y = H - ((hash(i + 2) + t * sp) % 1) * (H + 40);
        const x = hash(i) * W + Math.sin(t * 1.3 + i) * 30 * u;
        const r = (1.5 + hash(i + 3) * 3) * u * esz, fl = 0.5 + 0.5 * Math.sin(t * 8 + i * 3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, rgba(e1, 0.9 * fl));
        g.addColorStop(1, rgba(e2, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      });
      ctx.restore();
      return;
    }
    case 'bokeh': {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const bc = hexRgb(str(o, 'color', '#ffcf73')), bsz = 0.4 + 1.2 * num(o, 'size'), bsp = 0.4 + 2 * num(o, 'speed');
      particles(Math.round(8 + 22 * k), (i) => {
        const x = (((hash(i) * W + t * 12 * u * bsp * (hash(i + 1) - 0.5)) % W) + W) % W, y = hash(i + 2) * H + Math.sin(t * 0.3 * bsp + i) * 20 * u;
        const r = (30 + hash(i + 3) * 70) * u * bsz;
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
        const v = 0.8 + 0.4 * hash(i + 4), c = bc.map((x) => Math.min(255, Math.round(x * v))).join(',');
        g.addColorStop(0, `rgba(${c},0.18)`);
        g.addColorStop(1, `rgba(${c},0)`);
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
      ctx.fillStyle = rgba(str(o, 'tint', '#005a6e'), 0.25 * k + 0.1);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      vignette(ctx, W, H, k * 0.6);
      const bar = Math.max(0, (H - W / 2.39) / 2) * num(o, 'bars', 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      return;
    }
  }
}

let layerCv: HTMLCanvasElement | undefined;
let maskCv: HTMLCanvasElement | undefined;
const sized = (c: HTMLCanvasElement | undefined, W: number, H: number) => {
  c ??= document.createElement('canvas');
  if (c.width !== W || c.height !== H) (c.width = W), (c.height = H);
  return c;
};

/**
 * Draw an effect layer with its blend mode and area. Overlay effects (particles, light) are drawn on a transparent
 * layer and blended; picture effects (looks, lens, retro) work on a copy of the frame and are masked back in.
 * `depth` = the current clip's depth map (white = near) for "behind / on subject".
 */
export function drawEffectLayer(ctx: CanvasRenderingContext2D, e: EffectLayer, k: number, t: number, W: number, H: number, depth?: CanvasImageSource, beats: number[] = []) {
  const o = effectOpts(e);
  const area = str(o, 'area', 'all'), blend = str(o, 'blend', 'normal');
  const overlay = OVERLAY_EFFECTS.has(e.kind);
  const masked = area === 'top' || area === 'bottom' || ((area === 'behind' || area === 'front') && !!depth);
  if (!masked && (blend === 'normal' || !overlay)) return drawEffect(ctx, e.kind, k, t, W, H, e.params, o, beats);
  layerCv = sized(layerCv, W, H);
  const lg = layerCv.getContext('2d', { willReadFrequently: false })!;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'source-over';
  lg.globalAlpha = 1;
  lg.clearRect(0, 0, W, H);
  if (!overlay) lg.drawImage(ctx.canvas, 0, 0, W, H);
  drawEffect(lg, e.kind, k, t, W, H, e.params, o, beats);
  if (masked) {
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(effectMask(area, W, H, depth), 0, 0);
    lg.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = overlay ? (blend as GlobalCompositeOperation) : 'source-over';
  ctx.drawImage(layerCv, 0, 0);
  ctx.restore();
}

let maskKey = '';
/** Alpha mask for an area: top / bottom gradients, or the depth map (near = subject) with a soft threshold. */
function effectMask(area: string, W: number, H: number, depth?: CanvasImageSource) {
  const key = `${area}:${W}x${H}:${depth && (depth as HTMLImageElement).src}`;
  maskCv = sized(maskCv, W, H);
  if (key === maskKey && depth === lastDepth) return maskCv;
  maskKey = key;
  lastDepth = depth;
  const mg = maskCv.getContext('2d', { willReadFrequently: true })!;
  mg.globalCompositeOperation = 'source-over';
  mg.clearRect(0, 0, W, H);
  if (area === 'top' || area === 'bottom') {
    const gr = mg.createLinearGradient(0, area === 'top' ? 0 : H, 0, area === 'top' ? H * 0.6 : H * 0.4);
    gr.addColorStop(0, '#000');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = gr;
    mg.fillRect(0, 0, W, H);
    return maskCv;
  }
  const d0 = depth as HTMLImageElement;
  const dw = d0.naturalWidth || d0.width || W, dh = d0.naturalHeight || d0.height || H, sc = Math.max(W / dw, H / dh);
  mg.filter = `blur(${Math.max(1, Math.round(H / 200))}px)`;
  mg.drawImage(depth!, (W - dw * sc) / 2, (H - dh * sc) / 2, dw * sc, dh * sc);
  mg.filter = 'none';
  const id = mg.getImageData(0, 0, W, H), d = id.data;
  // Near ≥ ~0.55 depth = subject; smooth 0.45..0.65 ramp. "behind" keeps the rest.
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.min(1, Math.max(0, (d[i] / 255 - 0.45) / 0.2));
    d[i + 3] = Math.round(255 * (area === 'front' ? a : 1 - a));
    d[i] = d[i + 1] = d[i + 2] = 0;
  }
  mg.putImageData(id, 0, 0);
  return maskCv;
}
let lastDepth: CanvasImageSource | undefined;
