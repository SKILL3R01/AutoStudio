import { useRef } from 'react';
import { useEditor } from '../store';
import { useProject, useThumb } from './hooks';
import { Section, Seg, Slider } from '../components/ui';
import { ASPECTS, aspectRatio, cropRect, focusOf } from '../lib/framing';
import { outputSize } from '../render/renderer';
import type { Aspect } from '../types';

/** Format switch (16:9 / 9:16 / 1:1 / 4:5) — preview, framing and export follow immediately. */
export function FormatSwitch() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  return (
    <span className="format-switch" title="Video format — each clip remembers its framing per format">
      <Seg options={ASPECTS.map(([a]) => [a, a] as [Aspect, string])} value={p.export.aspect} onChange={(a) => update((d) => void (d.export.aspect = a))} />
    </span>
  );
}

/** Drag the crop box to choose what stays in frame for the current format (per clip, per format). */
export function FramingSection({ clipId }: { clipId: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const c = p.clips.find((x) => x.id === clipId);
  const a = c && p.assets.find((x) => x.id === c.assetId);
  const thumb = useThumb(a?.id, a?.kind === 'video' ? 'video' : 'image');
  const box = useRef<HTMLDivElement>(null);
  if (!c || !a || c.fill || c.fit === 'contain' || !a.width || !a.height) return null;
  const aspect = p.export.aspect;
  const f = focusOf(c, aspect);
  const { W, H } = outputSize(p);
  const r = cropRect(a.width / a.height, W / H, f);
  const set = (nf: { x?: number; y?: number; zoom?: number }) => update((d) => {
    const cl = d.clips.find((x) => x.id === clipId)!;
    cl.focus = { ...cl.focus, [aspect]: { ...focusOf(cl, aspect), ...nf } };
  }, `focus-${clipId}-${aspect}`);
  const drag = (e: React.PointerEvent) => {
    const el = box.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => set({ x: Math.max(0, Math.min(1, (ev.clientX - el.left) / el.width)), y: Math.max(0, Math.min(1, (ev.clientY - el.top) / el.height)) });
    move(e.nativeEvent);
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <Section title={`Framing · ${aspect}`} hint="Drag to choose what stays in frame. Each format (16:9, 9:16…) keeps its own framing.">
      <div className="framing-pad" ref={box} style={{ aspectRatio: `${a.width} / ${a.height}`, backgroundImage: thumb ? `url(${thumb})` : undefined }} onPointerDown={drag}>
        <div className="framing-box" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
      </div>
      <Slider label="Zoom in" value={f.zoom ?? 1} min={1} max={2.5} step={0.05} onChange={(v) => set({ zoom: v })} fmt={(v) => `${v.toFixed(2)}×`} />
      <div className="row wrap">
        <button className="btn sm ghost" onClick={() => set({ x: 0.5, y: 0.5, zoom: 1 })}>Centre</button>
        <button className="btn sm ghost" title="Use this framing (as a share of the image) for every clip in this format" onClick={() => update((d) => d.clips.forEach((cl) => !cl.fill && (cl.focus = { ...cl.focus, [aspect]: { ...f } })))}>Use for all clips</button>
      </div>
      <p className="hint">Ratio {aspectRatio(aspect).toFixed(2)} · output {W}×{H}</p>
    </Section>
  );
}
