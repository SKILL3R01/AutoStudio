import { useEffect, useState } from 'react';
import { useEditor, findAsset } from '../store';
import { isRefined, refineDepthAsset } from '../ai/jobs';
import { makeLayers } from '../ai/layers3d';
import { depthModel } from '../ai/vision';
import { depthView } from '../render/depthsafety';
import { Seg, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';
import type { Asset, Clip } from '../types';

/** Per-clip 3D quality: strength, Safe / Strong / Layers, Fix edges, show the depth map, hold for before / after. */
export function DepthQuality({ clip, asset, set }: { clip: Clip; asset?: Asset; set: (fn: (c: Clip) => void, k?: string) => void }) {
  const p = useEditor((s) => s.project)!;
  const update = useEditor((s) => s.update);
  const [busy, setBusy] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [model, setModel] = useState(depthModel);
  const depthAsset = findAsset(p, clip.depthId ?? '');
  const quality = clip.depth?.quality ?? 'safe';
  const repaint = () => useEditor.getState().seek(useEditor.getState().time);
  useEffect(() => () => void Object.assign(depthView, { clipId: null, mode: null }), []);
  const view = (mode: 'map' | 'flat' | null) => (Object.assign(depthView, { clipId: mode ? clip.id : null, mode }), repaint());
  const fix = async () => {
    if (!asset || !depthAsset) return;
    setBusy('fix');
    try {
      const d = await refineDepthAsset(clip, asset, depthAsset);
      if (d) update((pr) => (pr.assets.push(d), void (pr.clips.find((x) => x.id === clip.id)!.depthId = d.id)));
      toast('Depth edges fixed: the outline now follows the picture', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const layers = async () => {
    if (!asset || !clip.depthId) return;
    setBusy('layers');
    try {
      const r = await makeLayers(clip, asset, clip.depthId, (m) => setBusy(m));
      update((pr) => {
        pr.assets.push(r.bg, r.fg);
        const c = pr.clips.find((x) => x.id === clip.id)!;
        c.depth = { ...c.depth, quality: 'layers', bgId: r.bg.id, fgId: r.fg.id };
      });
      toast(r.filled ? 'Layers ready: the subject moves over a filled-in background' : 'Layers ready (background filled from the edges — the fill-in model was not available)', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="depth-quality">
      <div className="row between"><b>Quality <HelpButton topic="depth3d" small /></b>
        {depthAsset && !isRefined(depthAsset) && <button className="btn sm" disabled={!!busy} onClick={fix}><Icon name="wand" /> {busy === 'fix' ? 'Fixing…' : 'Fix edges'}</button>}
      </div>
      <Seg options={[['safe', 'Safe'], ['strong', 'Strong'], ['layers', 'Layers']] as const} value={quality} onChange={(v) => v === 'layers' && !clip.depth?.fgId ? void layers() : set((c) => void (c.depth = { ...c.depth, quality: v }))} />
      <p className="hint">{quality === 'safe' ? 'Safe: the move is limited automatically so nothing stretches or smears.' : quality === 'strong' ? 'Strong: a bigger move; edges may stretch a little.' : 'Layers: the subject is cut out and moves over a filled-in background — no stretching.'}</p>
      {busy && busy !== 'fix' && <p className="hint">{busy === 'layers' ? 'Making layers…' : busy}</p>}
      <Slider label="Strength for this clip" value={clip.depth?.strength ?? 1} min={0} max={2} onChange={(v) => set((c) => void (c.depth = { ...c.depth, strength: v }), 'depthStrength')} fmt={(v) => `${Math.round(v * 100)}%`} />
      <div className="row wrap">
        <button className={`btn sm ${showMap ? 'on' : 'ghost'}`} onClick={() => (setShowMap(!showMap), view(showMap ? null : 'map'))}><Icon name="depth" /> {showMap ? 'Hide depth map' : 'Show depth map'}</button>
        <button className="btn sm ghost" onPointerDown={() => view('flat')} onPointerUp={() => view(showMap ? 'map' : null)} onPointerLeave={() => depthView.mode === 'flat' && view(showMap ? 'map' : null)} title="Hold to see the picture without the 3D move">Hold: before</button>
      </div>
      <Seg options={[['small', 'Fast depth'], ['base', 'Detailed depth (~100 MB once)']] as const} value={model} onChange={(v) => (localStorage.setItem('depthModel', v), setModel(v), toast(v === 'base' ? 'New and redone depth maps use the detailed model (hair, branches). Press “Redo depth map”.' : 'New depth maps use the fast model', 'info'))} />
      {asset?.kind === 'video' && <p className="hint">Video: the depth of one frame is used for the whole clip, so keep the strength low.</p>}
    </div>
  );
}
