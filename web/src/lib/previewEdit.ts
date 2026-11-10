/** v3.6 direct manipulation on the preview: picture-in-picture boxes and main-clip framing drags. */
import type { Asset, Clip, PipClip, Project } from '../types';
import { activePips, pipBox } from './pip';
import { focusOf, type Focus } from './framing';

/** Normalised (0..1) box of an overlay clip on a W×H frame. */
export function pipHitBox(c: PipClip, a: Asset | undefined, W: number, H: number) {
  const ar = a?.width && a?.height ? a.width / a.height : 16 / 9;
  const b = pipBox(c, W, H, ar);
  return { x: b.cx / W, y: b.cy / H, w: b.w / W, h: b.h / H };
}

/** Overlay clips visible at t with their boxes, bottom track first (so the last one is on top). */
export function pipHits(p: Project, t: number, W: number, H: number) {
  return activePips(p, t).map((c) => ({ id: c.id, ...pipHitBox(c, p.assets.find((x) => x.id === c.assetId), W, H) }));
}

/**
 * New framing after dragging the main clip by (dx, dy) — fractions of the frame. Moving the picture right shows more
 * of its left side, so the focus point moves left by the drag scaled to the displayed image size.
 */
export function dragFocus(f0: Focus, dx: number, dy: number, a: { width: number; height: number }, W: number, H: number): Focus {
  const s = Math.max(W / a.width, H / a.height) * Math.max(1, f0.zoom ?? 1);
  const iw = a.width * s, ih = a.height * s;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { ...f0, x: clamp(f0.x - (dx * W) / iw), y: clamp(f0.y - (dy * H) / ih) };
}

/** Focus for a clip in the current format (defaults to centre). */
export const clipFocus = (c: Clip, p: Project) => focusOf(c, p.export.aspect);
