import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { drawEffect, EFFECT_COST, EFFECT_LABELS } from '../render/effects';
import { AREAS, BLENDS, EFFECT_CONTROLS, EFFECT_GROUPS, OVERLAY_EFFECTS, effectOpts, loadMyEffects, saveMyEffects, type MyEffect } from '../render/effectcontrols';
import { media } from '../render/media';
import { clipIndexAt } from '../render/renderer';
import { paletteFromPixels } from '../motion/styles';
import { Seg, Select, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { uid } from '../lib/util';
import type { EffectKind, EffectLayer } from '../types';

/** Sample picture for thumbnails: sky, sun, hills and a figure, so looks, lens and particles all have something to show. */
function sample(g: CanvasRenderingContext2D, W: number, H: number) {
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b4c7e');
  sky.addColorStop(0.6, '#e9a46a');
  sky.addColorStop(1, '#3b2a3f');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffd98a';
  g.beginPath();
  g.arc(W * 0.72, H * 0.42, H * 0.14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2f3b2c';
  g.beginPath();
  g.moveTo(0, H * 0.75);
  g.quadraticCurveTo(W * 0.3, H * 0.55, W * 0.6, H * 0.72);
  g.quadraticCurveTo(W * 0.85, H * 0.82, W, H * 0.7);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.fill();
  g.fillStyle = '#c0392b';
  g.fillRect(W * 0.28, H * 0.5, W * 0.05, H * 0.22);
  g.beginPath();
  g.arc(W * 0.305, H * 0.46, H * 0.05, 0, Math.PI * 2);
  g.fill();
}

/** Animated effect thumbnail (plays while hovered / focused; one still frame otherwise). */
export function EffectThumb({ kind, opts, animate }: { kind: EffectKind; opts?: Record<string, number | string>; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const t = animate ? 1 + (performance.now() - t0) / 1000 : 1.3;
      sample(g, c.width, c.height);
      drawEffect(g, kind, 0.8, t, c.width, c.height, undefined, effectOpts({ kind, opts }), [0.5, 1, 1.5, 2, 2.5, 3]);
      if (animate) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [kind, opts, animate]);
  return <canvas ref={ref} width={160} height={90} />;
}

/** Grouped gallery of animated tiles; click adds / removes the effect. Includes the user's saved effects. */
export function EffectGallery({ active, onToggle, onAddMine }: { active: Set<EffectKind>; onToggle: (k: EffectKind) => void; onAddMine: (m: MyEffect) => void }) {
  const [group, setGroup] = useState(EFFECT_GROUPS[0][0]);
  const [hover, setHover] = useState('');
  const [mine, setMine] = useState(loadMyEffects);
  useEffect(() => {
    const h = () => setMine(loadMyEffects());
    window.addEventListener('autostudio:my-effects', h);
    return () => window.removeEventListener('autostudio:my-effects', h);
  }, []);
  const groups = [...EFFECT_GROUPS.map(([g]) => g), ...(mine.length ? ['My effects'] : [])];
  const kinds = EFFECT_GROUPS.find(([g]) => g === group)?.[1] ?? [];
  const tile = (key: string, label: string, kind: EffectKind, on: boolean, click: () => void, opts?: Record<string, number | string>, extra?: React.ReactNode) => (
    <button key={key} className={`tile fx-tile ${on ? 'on' : ''}`} onClick={click} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover('')} onFocus={() => setHover(key)} onBlur={() => setHover('')} title={`${EFFECT_COST[kind]} to render`}>
      <EffectThumb kind={kind} opts={opts} animate={hover === key} />
      <span>{label}{EFFECT_COST[kind] === 'heavy' && <em className="cost">heavy</em>}</span>{extra}
    </button>
  );
  return (
    <>
      <div className="row wrap fx-groups">{groups.map((g) => <button key={g} className={`chip ${g === group ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
      <div className="grid3 fx-gallery">
        {group === 'My effects'
          ? mine.map((m) => tile(m.id, m.name, m.kind, false, () => onAddMine(m), m.opts, (
            <i className="fx-del" title="Delete" onClick={(e) => (e.stopPropagation(), saveMyEffects(mine.filter((x) => x.id !== m.id)), setMine(loadMyEffects()))}><Icon name="x" size={11} /></i>
          )))
          : kinds.map((k) => tile(k, EFFECT_LABELS[k], k, active.has(k), () => onToggle(k)))}
      </div>
    </>
  );
}

/** The current clip's picture colours (darkest → lightest). */
function pictureColors(): string[] | null {
  const { project: p, time } = useEditor.getState();
  const clip = p?.clips[clipIndexAt(p.clips, time)];
  const bmp = clip && media.image(clip.assetId);
  if (!bmp) return null;
  const c = new OffscreenCanvas(64, 36);
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0, 64, 36);
  return paletteFromPixels(g.getImageData(0, 0, 64, 36).data, 5);
}

/** Named controls for one effect layer: colours, ranges, blend mode, area; picture colours, reset, save as My effect. */
export function EffectOptions({ e, set }: { e: EffectLayer; set: (fn: (x: EffectLayer) => void, key?: string) => void }) {
  const ctl = EFFECT_CONTROLS[e.kind] ?? [];
  const o = effectOpts(e);
  const put = (k: string, v: number | string, key?: string) => set((x) => void (x.opts = { ...x.opts, [k]: v }), key);
  const colors = ctl.filter((c) => c.kind === 'color');
  return (
    <div className="fx-options">
      {ctl.map((c) => c.kind === 'color' ? (
        <label key={c.key} className="field row"><span>{c.label}</span><input type="color" value={String(o[c.key])} onChange={(ev) => put(c.key, ev.target.value, `fxc${e.kind}${c.key}`)} /></label>
      ) : (
        <Slider key={c.key} label={c.label} value={Number(o[c.key])} min={0} max={1} onChange={(v) => put(c.key, v, `fxo${e.kind}${c.key}`)} fmt={(v) => `${Math.round(v * 100)}%`} />
      ))}
      <Select label="Where" value={String(o.area ?? 'all')} onChange={(v) => put('area', v)} options={AREAS} />
      {(o.area === 'behind' || o.area === 'front') && <p className="hint">Uses the clip's depth map (3D depth → make depth map). Without one, the effect covers the whole frame.</p>}
      {OVERLAY_EFFECTS.has(e.kind) && <Seg options={BLENDS} value={String(o.blend ?? 'normal')} onChange={(v) => put('blend', v)} />}
      <div className="row wrap">
        {colors.length > 0 && <button className="btn sm ghost" onClick={() => {
          const pal = pictureColors();
          if (!pal) return toast('No picture at the playhead to take colours from', 'info');
          const picks = [pal[pal.length - 2] ?? pal[0], pal[2] ?? pal[0]];
          set((x) => void (x.opts = { ...x.opts, ...Object.fromEntries(colors.map((c, i) => [c.key, picks[i % picks.length]])) }));
        }}><Icon name="wand" /> Use picture colours</button>}
        {ctl.length > 0 && <button className="btn sm ghost" onClick={() => set((x) => void (x.opts = { area: x.opts?.area ?? 'all', blend: x.opts?.blend ?? 'normal' }))}>Reset</button>}
        <button className="btn sm ghost" onClick={() => {
          const name = prompt('Name for this effect', `${EFFECT_LABELS[e.kind]} (mine)`);
          if (!name) return;
          saveMyEffects([{ id: uid(), name, kind: e.kind, opts: { ...o } }, ...loadMyEffects()]);
          window.dispatchEvent(new Event('autostudio:my-effects'));
          toast(`Saved “${name}” in My effects`, 'ok');
        }}><Icon name="plus" /> Save as My effect</button>
      </div>
    </div>
  );
}
