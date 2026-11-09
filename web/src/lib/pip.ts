/** v3.1 video overlay tracks: picture-in-picture and B-roll above the main video. */
import type { Clip, PipClip, PipShape, Project } from '../types';
import { uid } from './util';

export const PIP_PRESETS: Record<string, { label: string; hint: string; v: Partial<PipClip> }> = {
  broll: { label: 'Full-screen B-roll', hint: 'Covers the main video', v: { shape: 'full', x: 0.5, y: 0.5, scale: 1, radius: 0, border: 0, shadow: false } },
  corner: { label: 'PiP corner', hint: 'Small window top-right', v: { shape: 'rect', x: 0.8, y: 0.22, scale: 0.32, radius: 0.06, border: 4, shadow: true } },
  facecam: { label: 'Face-cam circle', hint: 'Round bottom-right', v: { shape: 'circle', x: 0.86, y: 0.76, scale: 0.26, radius: 0.5, border: 5, shadow: true } },
  side: { label: 'Side by side', hint: 'Right half of the frame', v: { shape: 'half', x: 0.75, y: 0.5, scale: 0.5, radius: 0, border: 0, shadow: false } },
};

export function newPip(trackId: string, assetId: string, start: number, duration: number, preset = 'corner'): PipClip {
  return {
    id: uid(), trackId, assetId, start, duration, trimIn: 0, x: 0.8, y: 0.22, scale: 0.32, rotate: 0, opacity: 1, radius: 0.06,
    border: 4, borderColor: '#ffffff', shadow: true, fadeIn: 0.3, fadeOut: 0.3, zoom: 0, volume: 0, shape: 'rect' as PipShape,
    ...PIP_PRESETS[preset].v,
  };
}

/** Make sure a video overlay track exists (returns its id). */
export function ensureVideoTrack(p: Project): string {
  if (!p.videoTracks.length) p.videoTracks.push({ id: 'vtr_' + uid(), name: 'V2' });
  return p.videoTracks[p.videoTracks.length - 1].id;
}

/** New overlay track; with `after`, it goes right above that track (next to the original, not at the end). */
export function addVideoTrack(p: Project, after?: string): string {
  const id = 'vtr_' + uid();
  const i = after ? p.videoTracks.findIndex((t) => t.id === after) : -1;
  p.videoTracks.splice(i >= 0 ? i + 1 : p.videoTracks.length, 0, { id, name: `V${p.videoTracks.length + 2}` });
  return id;
}

/** Add `assetId` as an overlay at `start`; uses a free overlay track (or a new one). */
export function placePip(p: Project, assetId: string, start: number, duration: number, preset = 'corner'): PipClip {
  const free = (tid: string) => !p.pips.some((o) => o.trackId === tid && o.start < start + duration - 0.01 && o.start + o.duration > start + 0.01);
  const tid = p.videoTracks.map((t) => t.id).find(free) ?? (p.videoTracks.length ? addVideoTrack(p) : ensureVideoTrack(p));
  const c = newPip(tid, assetId, start, duration, preset);
  p.pips.push(c);
  return c;
}

export function splitPip(p: Project, id: string, t: number): boolean {
  const c = p.pips.find((x) => x.id === id);
  if (!c || t - c.start < 0.1 || c.start + c.duration - t < 0.1) return false;
  const left = t - c.start;
  p.pips.push({ ...structuredClone(c), id: uid(), start: t, duration: c.duration - left, trimIn: c.trimIn + left, fadeIn: 0 });
  c.duration = left;
  c.fadeOut = 0;
  return true;
}

/** Stand-in main-track clip so preview / export frame sources can serve overlay videos. */
export const pipAsClip = (c: PipClip): Clip => ({ id: c.id, assetId: c.assetId, start: c.start, trimIn: c.trimIn, motion: 'none', transition: 'none', volume: c.volume, fit: 'cover' });

/** Overlay clips visible at t, bottom track first (V2 under V3…); muted tracks are skipped. */
export function activePips(p: Project, t: number): PipClip[] {
  const order = new Map(p.videoTracks.map((tr, i) => [tr.id, i]));
  return p.pips
    .filter((c) => t >= c.start && t < c.start + c.duration && !p.videoTracks.find((tr) => tr.id === c.trackId)?.muted)
    .sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
}

/** Box (centre x / y, width / height in px) of an overlay on a W×H frame for a source of aspect `ar` (w / h). */
export function pipBox(c: PipClip, W: number, H: number, ar: number) {
  if (c.shape === 'full') return { cx: W / 2, cy: H / 2, w: W, h: H };
  if (c.shape === 'half') return { cx: c.x < 0.5 ? W / 4 : (3 * W) / 4, cy: H / 2, w: W / 2, h: H };
  if (c.shape === 'circle') {
    const d = c.scale * Math.min(W, H) * 1.6;
    return { cx: c.x * W, cy: c.y * H, w: d, h: d };
  }
  const w = c.scale * W;
  return { cx: c.x * W, cy: c.y * H, w, h: w / (ar || 16 / 9) };
}

type Src = CanvasImageSource & ({ width: number; height: number } | { videoWidth: number; videoHeight: number });
const dims = (d: Src) => ('videoWidth' in d ? { w: d.videoWidth, h: d.videoHeight } : { w: d.width as number, h: d.height as number });

/** Draw one overlay clip (fades, rounded / round mask, border, shadow, slow zoom). */
export function drawPip(g: CanvasRenderingContext2D, c: PipClip, t: number, d: Src | undefined, W: number, H: number) {
  if (!d) return;
  const { w: sw, h: sh } = dims(d);
  if (!sw || !sh) return;
  const local = t - c.start;
  const a = c.opacity * Math.max(0, Math.min(1, c.fadeIn > 0 ? local / c.fadeIn : 1, c.fadeOut > 0 ? (c.duration - local) / c.fadeOut : 1));
  if (a <= 0) return;
  const b = pipBox(c, W, H, sw / sh);
  const r = c.shape === 'circle' ? Math.min(b.w, b.h) / 2 : c.radius * Math.min(b.w, b.h);
  const path = () => {
    g.beginPath();
    if (c.shape === 'circle') g.arc(0, 0, r, 0, Math.PI * 2);
    else g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, r);
  };
  g.save();
  g.globalAlpha = a;
  g.translate(b.cx, b.cy);
  g.rotate((c.rotate * Math.PI) / 180);
  if (c.shadow) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = Math.min(W, H) * 0.03;
    g.shadowOffsetY = Math.min(W, H) * 0.008;
    path();
    g.fillStyle = '#000';
    g.fill();
    g.restore();
  }
  g.save();
  path();
  g.clip();
  // Cover the box; optional slow zoom (Ken Burns) over the clip.
  const z = 1 + (c.zoom ?? 0) * Math.max(0, Math.min(1, local / Math.max(0.1, c.duration)));
  const k = Math.max(b.w / sw, b.h / sh) * z;
  g.drawImage(d, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
  g.restore();
  if (c.border > 0) {
    path();
    g.lineWidth = c.border * (Math.min(W, H) / 1080);
    g.strokeStyle = c.borderColor;
    g.stroke();
  }
  g.restore();
}
