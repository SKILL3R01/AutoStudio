import { useEffect, useRef, useState } from 'react';
import { media } from '../render/media';
import { clipMotionXform, isDepthMotion, parallaxCamera } from '../render/motion';
import type { Clip, Motion } from '../types';

export const MOTION_HELP: Partial<Record<Motion, string>> = {
  none: 'Still image, no movement',
  zoomIn: 'Slowly moves closer — focus, tension',
  zoomOut: 'Pulls back to reveal the scene',
  panLeft: 'Slides across to the left',
  panRight: 'Slides across to the right',
  tiltUp: 'Moves upward — hope, reveal',
  tiltDown: 'Moves downward — calm, landing',
  diagonal: 'Zoom while drifting diagonally',
  drift: 'Gentle floating movement',
  breathe: 'Subtle in-and-out pulse',
  alternate: 'Alternates zoom in / zoom out per clip',
  random: 'A different move for each clip',
  custom: 'Your own start and end framing (Properties)',
};

/** Tile that plays the motion on the given image while hovered (static frame otherwise). */
export function MotionTile({ motion, label, assetId, clip, depth, on, onClick }: { motion: Motion; label: string; assetId?: string; clip?: Clip; depth: number; on: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const fake = { ...(clip ?? { id: 'x', assetId: assetId ?? '', start: 0, motion }), motion } as Clip;
    const draw = () => {
      const img = assetId ? media.image(assetId) : undefined;
      const prog = hover ? ((performance.now() - t0) / 3000) % 1 : 0.5;
      g.fillStyle = '#1b1f28';
      g.fillRect(0, 0, c.width, c.height);
      if (img) {
        // Depth moves: approximate the 3D camera path on the flat image (offset + push-in).
        const cam = isDepthMotion(motion) ? parallaxCamera(motion, prog, prog * 3, depth || 0.12, 1) : null;
        const x = cam ? { scale: 1.06 + cam.push * 1.5, dx: cam.ox * 1.5, dy: cam.oy * 1.5 } : clipMotionXform(fake, motion, prog, prog * 3, depth || 0.12, 1);
        const s = Math.max(c.width / img.width, c.height / img.height);
        g.save();
        g.translate(c.width / 2 + x.dx * c.width, c.height / 2 + x.dy * c.height);
        g.scale(x.scale, x.scale);
        g.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
        g.restore();
      }
      if (hover || !img) raf = requestAnimationFrame(draw);
    };
    if (assetId) void media.ensureImage(assetId).then(draw);
    else draw();
    return () => cancelAnimationFrame(raf);
  }, [hover, assetId, motion, depth]);
  return (
    <button className={`motion-card ${on ? 'on' : ''}`} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={MOTION_HELP[motion] ?? label}>
      <canvas ref={ref} width={160} height={90} />
      <b>{label}</b>
      <span className="hint">{MOTION_HELP[motion] ?? ''}</span>
    </button>
  );
}
