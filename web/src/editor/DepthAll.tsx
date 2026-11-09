import { useRef, useState } from 'react';
import { useEditor, findAsset } from '../store';
import { useProject } from './hooks';
import { Icon } from '../components/icons';
import { Progress, Seg } from '../components/ui';
import { toast } from '../components/Toast';
import { makeDepthAsset } from '../ai/jobs';
import { confirmHeavyAi } from '../lib/perf';
import { isDepthMotion } from '../render/motion';
import { DEPTH_MOTIONS, type Motion } from '../types';

const VARY: Motion[] = ['parallaxZoom', 'parallaxPanRight', 'parallaxOrbit', 'parallaxPanLeft', 'parallaxCrane', 'parallaxFloat', 'parallaxTiltUp', 'parallaxSwing'];

/** Apply 3D to every image (depth maps made in bulk, cancellable) or remove it from all. */
export function DepthAll() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const [mode, setMode] = useState<'vary' | 'same'>('vary');
  const [prog, setProg] = useState<[number, number] | null>(null);
  const stop = useRef(false);
  const images = p.clips.filter((c) => !c.fill && p.assets.find((a) => a.id === c.assetId)?.kind === 'image');
  const with3d = p.clips.filter((c) => isDepthMotion(c.motion)).length;
  const applyAll = async () => {
    const missing = images.filter((c) => !c.depthId);
    if (missing.length && !confirmHeavyAi()) return;
    stop.current = false;
    setProg([0, missing.length]);
    try {
      for (const [i, c] of missing.entries()) {
        if (stop.current) break;
        const a = findAsset(useEditor.getState().project!, c.assetId);
        const d = a && (await makeDepthAsset(c, a));
        if (d) update((pr) => void (pr.assets.push(d), (pr.clips.find((x) => x.id === c.id)!.depthId = d.id)));
        setProg([i + 1, missing.length]);
      }
      const same = useEditor.getState().project!.clips.find((c) => isDepthMotion(c.motion))?.motion ?? 'parallaxZoom';
      update((pr) => pr.clips.forEach((c, i) => void (c.depthId && (c.motion = mode === 'vary' ? VARY[i % VARY.length] : same))));
      toast(stop.current ? 'Stopped — clips that got a depth map now move in 3D' : '3D applied to every image', 'ok');
    } catch (e) {
      toast(`Depth failed: ${(e as Error).message}`, 'error');
    } finally {
      setProg(null);
    }
  };
  const removeAll = (dropMaps: boolean) => update((pr) => pr.clips.forEach((c) => {
    if (isDepthMotion(c.motion)) c.motion = 'zoomIn';
    if (dropMaps) c.depthId = undefined;
  }));
  return (
    <div className="card">
      <b>All clips</b>
      <p className="hint">{images.filter((c) => c.depthId).length} of {images.length} images have a depth map · {with3d} clip{with3d === 1 ? '' : 's'} use a 3D move</p>
      <Seg options={[['vary', 'Vary moves per scene'], ['same', 'Same move for all']] as const} value={mode} onChange={setMode} />
      {prog ? (
        <div className="row">
          <Progress value={prog[0] / Math.max(1, prog[1])} label={`Depth ${prog[0]} / ${prog[1]}`} />
          <button className="btn sm ghost" onClick={() => (stop.current = true)}>Stop</button>
        </div>
      ) : (
        <div className="row wrap">
          <button className="btn sm primary" disabled={!images.length} onClick={applyAll}><Icon name="depth" /> Apply 3D to all images</button>
          <button className="btn sm ghost" disabled={!with3d} onClick={() => removeAll(false)}>Remove 3D from all</button>
          <button className="btn sm ghost danger" disabled={!p.clips.some((c) => c.depthId)} onClick={() => confirm('Remove 3D and delete every depth map?') && removeAll(true)}>…and delete depth maps</button>
        </div>
      )}
      <p className="hint">{DEPTH_MOTIONS.length} 3D moves available.</p>
    </div>
  );
}
