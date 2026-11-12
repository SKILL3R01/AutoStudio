/**
 * Live thumbnail of motion layers, drawn by our own engine (no stored videos). Animates while hovered / focused
 * (or `autoplay`), shows a still otherwise, and only draws when it is on screen.
 */
import { useEffect, useRef, useState } from 'react';
import { drawGroup, onMotionAsset } from '../../motion/render';
import { media } from '../../render/media';
import type { MotionGroup, MotionItem, MotionPalette } from '../../motion/types';

export function makeGroup(items: MotionItem[], frame: { w: number; h: number }, palette: MotionPalette, dur: number): MotionGroup {
  return { id: 'thumb', name: '', start: 0, dur, placement: 'full', frame, palette, items };
}

let repaint = 0;
const listeners = new Set<() => void>();
onMotionAsset(() => {
  repaint++;
  listeners.forEach((f) => f());
});
media.onLoad(() => listeners.forEach((f) => f()));

export function LiveThumb({ group, width, height, autoplay = false, still = 0.65, className, title, onClick, children }: {
  group: MotionGroup | (() => MotionGroup);
  width: number;
  height: number;
  autoplay?: boolean;
  /** Where the still frame sits (0–1 of the duration). */
  still?: number;
  className?: string;
  title?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const [, bump] = useState(0);
  const gRef = useRef<MotionGroup | null>(null);
  const resolved = typeof group === 'function' ? null : group;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return void setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const c = ref.current!;
    const g = (gRef.current = resolved ?? (typeof group === 'function' ? group() : group));
    // Pictures used by the layers (cut-outs, assets): load them, the thumbnail repaints when they arrive.
    for (const it of g.items) if (typeof it.asset === 'string') void media.ensureImage(it.asset);
    const ctx = c.getContext('2d')!;
    const image = (ref2: string) => media.image(ref2) as CanvasImageSource | undefined;
    const draw = (t: number) => {
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, c.width, c.height);
      drawGroup(ctx, g, Math.max(0, Math.min(g.dur - 0.01, t)), c.width, c.height, { image });
    };
    const play = autoplay || hover;
    if (!play) return void draw(g.dur * still);
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      draw(((performance.now() - t0) / 1000) % g.dur);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hover, autoplay, resolved, repaint, width, height]);

  return (
    <div className={`live-thumb ${className ?? ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} onClick={onClick} title={title} tabIndex={onClick ? 0 : undefined} role={onClick ? 'button' : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}>
      <canvas ref={ref} width={width} height={height} />
      {children}
    </div>
  );
}
