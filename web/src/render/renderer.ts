import type { Asset, CaptionLine, Clip, EffectLayer, Overlay, Project, Transition } from '../types';
import { clipEnd, projectLength } from '../store';
import { clamp, easeInOut, hash } from '../lib/util';
import { clipMotionXform, isDepthMotion, parallaxCamera, resolveMotion, resolveTransition } from './motion';
import { drawTypography } from './typography';
import { animateRegions } from './regions';
import { renderParallax } from './parallax';
import { drawCaptions, roundRect } from './captions';
import { drawEffect } from './effects';

export type Drawable = ImageBitmap | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;

/** Supplies pixels for the renderer. Preview uses live media elements, export uses decoded frames. */
export interface FrameSource {
  clip(clip: Clip, asset: Asset, sourceTime: number): Drawable | undefined;
  image(assetId: string): Drawable | undefined;
}

export interface RenderModel {
  project: Project;
  lines: CaptionLine[];
  length: number;
  assets: Map<string, Asset>;
  /** Onset times detected in the audio, used by region effects set to trigger "on the beat". */
  beats: number[];
}

export const makeModel = (project: Project, lines: CaptionLine[], beats: number[] = []): RenderModel => ({
  project, lines, length: projectLength(project), assets: new Map(project.assets.map((a) => [a.id, a])), beats,
});

/** Image asset ids the renderer will look up at time t (so export can await them). */
export function imagesNeededAt(m: RenderModel, t: number): string[] {
  const ids: string[] = [];
  for (const i of activeClipIndices(m, t)) {
    const c = m.project.clips[i];
    if (m.assets.get(c.assetId)?.kind === 'image') ids.push(c.assetId);
    if (c.depthId) ids.push(c.depthId);
    c.regions?.forEach((r) => ids.push(r.maskId));
  }
  for (const o of m.project.overlays) if (o.assetId && t >= o.start && t <= o.start + o.duration) ids.push(o.assetId);
  return ids;
}

export const outputSize = (p: Project, preview?: number) => {
  const [aw, ah] = p.export.aspect.split(':').map(Number);
  const long = preview ?? (p.export.resolution === 'full' ? 1920 : p.export.resolution === '720' ? 1280 : 854);
  const even = (n: number) => Math.round(n / 2) * 2;
  return aw >= ah ? { W: even(long), H: even((long * ah) / aw) } : { W: even((long * aw) / ah), H: even(long) };
};

const size = (d: Drawable) => d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight } : { w: d.width, h: d.height };

const layers: HTMLCanvasElement[] = [];
function layer(i: number, W: number, H: number) {
  const c = (layers[i] ??= document.createElement('canvas'));
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  return { c, g };
}

/** Where a video clip's source should be at `local` seconds into the clip, honouring trim in/out and looping. */
export function clipSourceTime(clip: Clip, asset: Asset, local: number) {
  const end = Math.min(clip.trimOut ?? Infinity, asset.duration ?? Infinity) - 0.04;
  const span = Math.max(0.05, end - clip.trimIn);
  const l = Math.max(0, local);
  return clip.trimIn + (clip.loop ? l % span : Math.min(l, span));
}

/** Timeline start of clip i (the first clip always starts at 0). */
export const clipStart = (clips: Clip[], i: number) => (i === 0 ? 0 : clips[i].start);

/** Index of the clip covering time t (last clip whose start ≤ t). */
export function clipIndexAt(clips: Clip[], t: number) {
  let lo = 0, hi = clips.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (clips[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function drawClip(g: CanvasRenderingContext2D, m: RenderModel, i: number, t: number, src: FrameSource, W: number, H: number) {
  const p = m.project;
  const clip = p.clips[i];
  if (clip.fill) {
    g.fillStyle = clip.fill;
    g.fillRect(0, 0, W, H);
    return;
  }
  const asset = m.assets.get(clip.assetId);
  if (!asset) return;
  const start = i === 0 ? 0 : clip.start;
  const span = Math.max(0.05, clipEnd(p, i) - start);
  const local = t - start;
  const raw = src.clip(clip, asset, asset.kind === 'video' ? clipSourceTime(clip, asset, local) : 0);
  if (!raw) return;
  const { w, h } = size(raw);
  if (!w || !h) return;
  let d: Drawable = raw;
  if (clip.regions?.length) d = animateRegions(d, clip, t, m, src, i);
  let motion = resolveMotion(clip.motion, i);
  if (isDepthMotion(motion)) {
    const depth = clip.depthId ? src.image(clip.depthId) : undefined;
    const pd = depth && renderParallax(d, depth, parallaxCamera(motion, local / span, local, p.motionDepth, i));
    if (pd) d = pd;
    else motion = 'zoomIn';
  }
  const x = clipMotionXform(clip, motion, local / span, local, p.motionDepth, i);
  const c = clip.color ?? { brightness: 1, contrast: 1, saturation: 1 };
  const color = `brightness(${p.color.brightness * c.brightness}) contrast(${p.color.contrast * c.contrast}) saturate(${p.color.saturation * c.saturation})`;
  const cover = Math.max(W / w, H / h), contain = Math.min(W / w, H / h);
  g.save();
  if (clip.fit === 'contain' && p.export.background === 'blur') {
    g.filter = `blur(${Math.round(W / 40)}px) ${color} brightness(0.6)`;
    g.drawImage(d, (W - w * cover * 1.1) / 2, (H - h * cover * 1.1) / 2, w * cover * 1.1, h * cover * 1.1);
  }
  const s = clip.fit === 'contain' ? contain : cover;
  g.filter = color;
  g.translate(W / 2 + x.dx * W, H / 2 + x.dy * H);
  g.scale(x.scale, x.scale);
  g.drawImage(d, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  g.restore();
}

function composite(ctx: CanvasRenderingContext2D, kind: Transition, a: HTMLCanvasElement, b: HTMLCanvasElement, pr: number, W: number, H: number, seed: number) {
  const e = easeInOut(pr);
  ctx.save();
  switch (kind) {
    case 'fadeBlack':
    case 'fadeWhite':
      ctx.fillStyle = kind === 'fadeBlack' ? '#000' : '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = pr < 0.5 ? 1 - pr * 2 : pr * 2 - 1;
      ctx.drawImage(pr < 0.5 ? a : b, 0, 0);
      break;
    case 'flash':
      ctx.drawImage(pr < 0.5 ? a : b, 0, 0);
      ctx.globalAlpha = 1 - Math.abs(pr * 2 - 1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'slideLeft': ctx.drawImage(a, -e * W, 0); ctx.drawImage(b, W - e * W, 0); break;
    case 'slideRight': ctx.drawImage(a, e * W, 0); ctx.drawImage(b, -W + e * W, 0); break;
    case 'slideUp': ctx.drawImage(a, 0, -e * H); ctx.drawImage(b, 0, H - e * H); break;
    case 'slideDown': ctx.drawImage(a, 0, e * H); ctx.drawImage(b, 0, -H + e * H); break;
    case 'zoomPunch': {
      const s1 = 1 + e * 0.6, s2 = 1.4 - e * 0.4;
      ctx.globalAlpha = 1 - e;
      ctx.drawImage(a, (W - W * s1) / 2, (H - H * s1) / 2, W * s1, H * s1);
      ctx.globalAlpha = e;
      ctx.drawImage(b, (W - W * s2) / 2, (H - H * s2) / 2, W * s2, H * s2);
      break;
    }
    case 'wipe':
      ctx.drawImage(a, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, e * W, H);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      break;
    case 'circle':
      ctx.drawImage(a, 0, 0);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, e * Math.hypot(W, H) / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      break;
    case 'blur': {
      const bl = Math.round((1 - Math.abs(pr * 2 - 1)) * W / 60);
      ctx.filter = `blur(${bl}px)`;
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(b, 0, 0);
      break;
    }
    case 'glitch': {
      ctx.drawImage(pr < 0.5 ? a : b, 0, 0);
      const f = Math.floor(pr * 20) + seed * 100;
      for (let i = 0; i < 12; i++) {
        const y = hash(f + i * 3) * H, h = (0.02 + hash(f + i) * 0.08) * H, off = (hash(f * 2 + i) - 0.5) * W * 0.15;
        ctx.drawImage(hash(f + i * 5) > 0.5 ? a : b, 0, y, W, h, off, y, W, h);
      }
      break;
    }
    default:
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(b, 0, 0);
  }
  ctx.restore();
}

function drawVisuals(ctx: CanvasRenderingContext2D, m: RenderModel, t: number, src: FrameSource, W: number, H: number) {
  const clips = m.project.clips;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!clips.length) return;
  const i = clipIndexAt(clips, t);
  const D = m.project.transitionDuration;
  const pair = (a: number) => {
    const b = a + 1;
    const kind = resolveTransition(clips[b].transition, b);
    if (kind === 'none' || D <= 0) return null;
    const c = clips[b].start;
    const half = Math.min(D / 2, (c - (a === 0 ? 0 : clips[a].start)) / 2, (clipEnd(m.project, b) - c) / 2);
    return t >= c - half && t < c + half ? { a, b, kind, pr: (t - (c - half)) / (2 * half) } : null;
  };
  const tr = (i + 1 < clips.length ? pair(i) : null) ?? (i > 0 ? pair(i - 1) : null);
  if (!tr) return drawClip(ctx, m, i, t, src, W, H);
  const A = layer(0, W, H), B = layer(1, W, H);
  drawClip(A.g, m, tr.a, t, src, W, H);
  drawClip(B.g, m, tr.b, t, src, W, H);
  composite(ctx, tr.kind, A.c, B.c, clamp(tr.pr, 0, 1), W, H, tr.b);
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, t: number, src: FrameSource, W: number, H: number) {
  const local = t - o.start;
  if (local < 0 || local > o.duration) return;
  const fade = Math.min(o.fadeIn > 0 ? local / o.fadeIn : 1, o.fadeOut > 0 ? (o.duration - local) / o.fadeOut : 1, 1);
  ctx.save();
  ctx.globalAlpha = clamp(fade, 0, 1) * o.opacity;
  ctx.translate(o.x * W, o.y * H);
  ctx.rotate((o.rotate * Math.PI) / 180);
  if (o.blur > 0) ctx.filter = `blur(${o.blur * (W / 1920)}px)`;
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = H * 0.012;
    ctx.shadowOffsetY = H * 0.004;
  }
  if (o.assetId) {
    const d = src.image(o.assetId);
    if (d) {
      const { w, h } = size(d);
      const dw = o.size * W, dh = (dw * h) / w;
      ctx.drawImage(d, -dw / 2, -dh / 2, dw, dh);
    }
  } else {
    const fs = Math.round(o.size * H * 0.06);
    ctx.font = `${o.weight} ${fs}px "${o.font}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rows = o.text.split('\n');
    const lh = fs * 1.2;
    if (o.background && o.background !== 'transparent') {
      const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + fs * 0.8;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = o.background;
      roundRect(ctx, -bw / 2, (-rows.length * lh) / 2 - fs * 0.2, bw, rows.length * lh + fs * 0.4, fs * 0.25);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = o.color;
    rows.forEach((r, k) => ctx.fillText(r, 0, (k - (rows.length - 1) / 2) * lh));
  }
  ctx.restore();
}

export function renderFrame(ctx: CanvasRenderingContext2D, m: RenderModel, t: number, src: FrameSource, W: number, H: number) {
  const p = m.project;
  ctx.save();
  drawVisuals(ctx, m, t, src, W, H);
  for (const fx of p.effects) {
    if (fx.kind === 'none') continue;
    const k = effectAmount(fx, t, p.clips, m.length);
    if (k > 0) drawEffect(ctx, fx.kind, fx.intensity * k, t, W, H);
  }
  for (const o of p.overlays) drawOverlay(ctx, o, t, src, W, H);
  if (p.captions.mode !== 'keywords') drawCaptions(ctx, m.lines, t, p.captions, W, H);
  if (p.captions.mode !== 'full') drawTypography(ctx, p.typo, t, W, H);
  const { fadeIn, fadeOut } = p.sceneFades;
  const black = Math.max(fadeIn > 0 ? 1 - t / fadeIn : 0, fadeOut > 0 ? 1 - (m.length - t) / fadeOut : 0);
  if (black > 0) {
    ctx.globalAlpha = clamp(black, 0, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** 0..1 strength of an effect layer at time t, from its scope (whole video / time range / chosen clips) and fades. */
export function effectAmount(fx: EffectLayer, t: number, clips: Clip[], length: number): number {
  const sc = fx.scope ?? { kind: 'all' as const };
  let a = 0, b = length;
  if (sc.kind === 'range') [a, b] = [sc.start, sc.end];
  else if (sc.kind === 'clips') {
    const i = clips.length ? clipIndexAt(clips, t) : -1;
    if (i < 0 || !sc.ids.includes(clips[i].id)) return 0;
    a = i === 0 ? 0 : clips[i].start;
    b = i + 1 < clips.length ? clips[i + 1].start : length;
  }
  if (t < a || t > b) return 0;
  const fi = fx.fadeIn ?? 0, fo = fx.fadeOut ?? 0;
  return Math.max(0, Math.min(1, fi > 0 ? (t - a) / fi : 1, fo > 0 ? (b - t) / fo : 1));
}

/** Clips that need pixels at time t (the active one plus a transition partner). */
export function activeClipIndices(m: RenderModel, t: number) {
  const clips = m.project.clips;
  if (!clips.length) return [];
  const i = clipIndexAt(clips, t);
  const D = m.project.transitionDuration / 2;
  const out = [i];
  if (i + 1 < clips.length && clips[i + 1].start - t < D) out.push(i + 1);
  if (i > 0 && t - clips[i].start < D) out.push(i - 1);
  return out;
}
