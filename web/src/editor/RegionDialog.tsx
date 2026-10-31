import { useEffect, useRef, useState } from 'react';
import { useEditor, findAsset } from '../store';
import { Icon } from '../components/icons';
import { Progress, Select, Slider, useObjectUrl } from '../components/ui';
import { toast } from '../components/Toast';
import { clipStill } from '../ai/jobs';
import { prepareSegment, segmentAt, useVision } from '../ai/vision';
import { probe } from '../lib/project';
import { uid } from '../lib/util';
import { REGION_EFFECTS, type Region, type RegionEffect } from '../types';

const EFFECT_HINT: Record<RegionEffect, string> = {
  sway: 'Gentle wind (trees, hair, grass, flags)', ripple: 'Water / heat ripple', glow: 'Pulsing glow (lamps, eyes, screens)',
  flicker: 'Fire or neon flicker', shimmer: 'Light sweep across (metal, glass)', hue: 'Colour cycling', blink: 'Darken / blink',
  sparkle: 'Twinkling sparkles inside', pop: 'Subject pops forward',
};

/** Click on the still to select an object (SlimSAM, in-browser), then choose how it animates. */
export function RegionDialog({ clipId, onClose }: { clipId: string; onClose: () => void }) {
  const p = useEditor((s) => s.project!);
  const update = useEditor((s) => s.update);
  const vision = useVision();
  const clip = p.clips.find((c) => c.id === clipId)!;
  const asset = findAsset(p, clip.assetId)!;
  const [still, setStill] = useState<Blob>();
  const [ready, setReady] = useState(false);
  const [points, setPoints] = useState<{ x: number; y: number; label: number }[]>([]);
  const [mask, setMask] = useState<Blob>();
  const [busy, setBusy] = useState(false);
  const [effect, setEffect] = useState<RegionEffect>('glow');
  const [name, setName] = useState('Detail');
  const [trigger, setTrigger] = useState<Region['trigger']>('loop');
  const [intensity, setIntensity] = useState(0.8);
  const stillUrl = useObjectUrl(still);
  const maskUrl = useObjectUrl(mask);
  const key = `${clip.id}:${asset.id}:${clip.trimIn}`;
  const imgRef = useRef<HTMLImageElement>(null);
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setErr('');
    (async () => {
      const s = await clipStill(clip, asset);
      if (!s || !live) return;
      setStill(s);
      try {
        await prepareSegment(key, s);
        live && setReady(true);
      } catch (e) {
        live && setErr((e as Error).message);
      }
    })();
    return () => void (live = false);
  }, [key, attempt]);

  const click = async (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    if (!ready || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, label: e.button === 2 || e.altKey ? 0 : 1 };
    const next = [...points, pt];
    setPoints(next);
    setBusy(true);
    try {
      const res = await segmentAt(key, next.map((q) => [q.x, q.y]), next.map((q) => q.label));
      setMask(res.blob);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!mask) return;
    const a = await probe(mask, `__mask_${name}`, 'image');
    const region: Region = { id: uid(), name, maskId: a.id, effect, intensity, speed: 1, trigger, color: '#ffffff' };
    update((d) => {
      d.assets.push(a);
      const c = d.clips.find((x) => x.id === clipId)!;
      c.regions = [...(c.regions ?? []), region];
    });
    toast(`Animated “${name}”`, 'ok');
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Animate a detail</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Click on what should move (water, fire, a lamp, hair, the subject…). <b>Right-click</b> or Alt-click to exclude areas. Runs on your device.</p>
        <div className="region-stage">
          {stillUrl ? (
            <div className="region-img">
              <img ref={imgRef} src={stillUrl} onClick={click} onContextMenu={click} alt="" draggable={false} />
              {maskUrl && <img className="mask" src={maskUrl} alt="" />}
              {points.map((q, i) => <span key={i} className={`pt ${q.label ? 'in' : 'out'}`} style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }} />)}
            </div>
          ) : <p className="hint">Loading image…</p>}
          {err ? (
            <div className="warn row between">
              <span>Object selector failed: {err.slice(0, 160)}</span>
              <button className="btn sm" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
            </div>
          ) : !ready && <Progress value={vision.value} label={vision.label ? `${vision.label}… ${Math.round(vision.value * 100)}%` : 'Preparing object selector (first time downloads ~40 MB)…'} />}
          {busy && <p className="hint">Selecting…</p>}
        </div>
        <div className="row">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <Select label="Effect" value={effect} options={REGION_EFFECTS.map((x) => [x, `${x} — ${EFFECT_HINT[x]}`] as [RegionEffect, string])} onChange={setEffect} />
          <Select label="When" value={trigger} options={[['loop', 'Always'], ['beats', 'On music beats'], ['keywords', 'On keywords']]} onChange={setTrigger} />
        </div>
        <Slider label="Intensity" value={intensity} min={0.1} max={1.5} onChange={setIntensity} />
        <div className="row end">
          <button className="btn ghost" onClick={() => (setPoints([]), setMask(undefined))}>Reset selection</button>
          <button className="btn primary" disabled={!mask} onClick={save}>Add animation</button>
        </div>
      </div>
    </div>
  );
}
