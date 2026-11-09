import { activePips } from '../lib/pip';
import { syncProxies } from '../lib/proxy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useModel } from './hooks';
import { media } from '../render/media';
import { activeClipIndices, clipIndexAt, clipSourceTime, clipStart, imagesNeededAt, outputSize, renderFrame, type FrameSource, type RenderModel } from '../render/renderer';
import { buildMix, loadBuffers } from '../audio/mix';
import { fmtTime } from '../lib/util';
import { Icon } from '../components/icons';
import { blockBox } from '../render/typography';
import { PROFILE_SETTINGS, usePerf } from '../lib/perf';
import type { Project } from '../types';


/** Seek/play preview <video> elements so they show the right frame at timeline time t. */
function syncVideos(m: RenderModel, t: number, playing: boolean) {
  const active = new Set<string>();
  for (const i of activeClipIndices(m, t)) {
    const clip = m.project.clips[i];
    const asset = m.assets.get(clip.assetId);
    if (asset?.kind !== 'video') continue;
    active.add(asset.id);
    const v = media.video(asset.id);
    const want = clipSourceTime(clip, asset, t - clipStart(m.project.clips, i));
    const rate = clip.speed ?? 1;
    if (v.playbackRate !== rate) v.playbackRate = rate;
    if (playing) {
      if (v.paused) {
        v.currentTime = want;
        void v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.03) v.currentTime = want;
    }
  }
  for (const c of activePips(m.project, t)) {
    if (m.assets.get(c.assetId)?.kind !== 'video' || active.has(c.assetId)) continue;
    active.add(c.assetId);
    const v = media.video(c.assetId);
    const want = c.trimIn + (t - c.start);
    if (playing) {
      if (v.paused) (v.currentTime = want), void v.play().catch(() => {});
      else if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.03) v.currentTime = want;
    }
  }
  for (const [id, v] of media.allVideos()) if (!active.has(id) && !v.paused) v.pause();
}

const source: FrameSource = {
  clip: (_c, asset) => (asset.kind === 'video' ? media.video(asset.id) : media.image(asset.id)),
  image: (id) => media.image(id),
};

/** Only the fields that affect sound — playback restarts when these change, not on every visual tweak. */
const audioKey = (p: Project) => JSON.stringify([
  p.audio, p.audioTracks, p.narrationTrackId, p.pips.map((c) => [c.assetId, c.start, c.trimIn, c.duration, c.volume]), p.clips.map((c) => [c.assetId, c.start, c.trimIn, c.trimOut, c.loop, c.volume]), p.words.length, p.lines.length,
]);

type Draggable = { kind: 'overlay' | 'keyword'; id: string; x: number; y: number; w: number; h: number };

/** Approximate on-screen boxes of overlays and keywords visible at time t, for click/drag hit-testing. */
function hitBoxes(p: Project, t: number, W: number, H: number): Draggable[] {
  const g = document.createElement('canvas').getContext('2d')!;
  const out: Draggable[] = [];
  for (const o of p.overlays) {
    if (t < o.start || t > o.start + o.duration) continue;
    if (o.assetId) out.push({ kind: 'overlay', id: o.id, x: o.x, y: o.y, w: o.size, h: o.size * 0.6 * (W / H) });
    else {
      const fs = o.size * H * 0.06;
      g.font = `${o.weight} ${fs}px "${o.font}"`;
      const rows = o.text.split('\n');
      out.push({ kind: 'overlay', id: o.id, x: o.x, y: o.y, w: Math.max(...rows.map((r) => g.measureText(r).width)) / W + 0.02, h: (rows.length * fs * 1.2) / H });
    }
  }
  if (p.captions.typography !== false) {
    for (const b of p.typo) {
      if (t < b.start || t > b.end + 0.2) continue;
      out.push({ kind: 'keyword', id: b.id, ...blockBox(b, W, H) });
    }
  }
  return out;
}

export function Preview() {
  const m = useModel();
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const seekId = useEditor((s) => s.seekId);
  const selection = useEditor((s) => s.selection);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState('');
  const [full, setFull] = useState(false);
  const [guides, setGuides] = useState(false);
  const modelRef = useRef(m);
  modelRef.current = m;
  const baseLong = PROFILE_SETTINGS[usePerf((s) => s.profile)].preview;
  const fast = usePerf((s) => s.fastPreview) && playing;
  const previewLong = fast ? Math.round(baseLong * 0.6) : baseLong;
  const { W, H } = outputSize(m.project, previewLong);
  const frames = useRef<number[]>([]);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!playing) return setFps(0);
    const id = setInterval(() => {
      const now = performance.now();
      frames.current = frames.current.filter((x) => now - x < 1000);
      setFps(frames.current.length);
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);
  const aKey = useMemo(() => audioKey(m.project), [m.project]);
  useEffect(() => syncProxies(m.project), [m.project.assets]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitScale = box.w && box.h ? Math.min(box.w / W, box.h / H) : 0;

  useEffect(() => media.onLoad(() => setTick((x) => x + 1)), []);

  // Preload the media around the playhead (clip pixels, depth maps, masks, overlay images).
  useEffect(() => {
    const clips = m.project.clips;
    const i = clipIndexAt(clips, time);
    for (let k = Math.max(0, i - 1); k < Math.min(clips.length, i + 4); k++) {
      const c = clips[k];
      const a = m.assets.get(c.assetId);
      if (a?.kind === 'image') void media.ensureImage(a.id);
      if (a?.kind === 'video') media.video(a.id);
      if (c.depthId) void media.ensureImage(c.depthId);
      c.regions?.forEach((r) => void media.ensureImage(r.maskId));
    }
    imagesNeededAt(m, time).forEach((id) => void media.ensureImage(id));
  }, [m, Math.floor(time)]);

  // Paint the current frame (regions and depth animate continuously, so repaint while playing via `time`).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    syncVideos(m, time, playing);
    renderFrame(c.getContext('2d')!, fast ? { ...m, draft: true } : m, time, source, W, H);
    if (playing) frames.current.push(performance.now());
  }, [m, time, tick, W, H, playing, fast]);

  // Playback clock driven by the Web Audio mix.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, stopped = false;
    let actx: AudioContext | undefined;
    let nodes: AudioScheduledSourceNode[] = [];
    (async () => {
      const p = modelRef.current.project;
      setStatus('Loading audio…');
      const bufs = await loadBuffers(p);
      setStatus('');
      if (stopped) return;
      actx = new AudioContext();
      const from = useEditor.getState().time >= modelRef.current.length - 0.05 ? 0 : useEditor.getState().time;
      const at = actx.currentTime + 0.08;
      nodes = buildMix(actx, p, bufs, from, at).nodes;
      const loop = () => {
        if (stopped || !actx) return;
        const t = from + Math.max(0, actx.currentTime - at);
        if (t >= modelRef.current.length) {
          useEditor.getState().setTime(modelRef.current.length);
          useEditor.getState().setPlaying(false);
          return;
        }
        useEditor.getState().setTime(t);
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      nodes.forEach((n) => {
        try {
          n.stop();
        } catch {}
      });
      void actx?.close();
    };
  }, [playing, aKey, seekId]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const hit = hitBoxes(m.project, time, W, H).reverse().find((b) => Math.abs(px - b.x) <= b.w / 2 && Math.abs(py - b.y) <= b.h / 2);
    const st = useEditor.getState();
    if (!hit) return st.select(null);
    st.select({ kind: hit.kind, id: hit.id });
    const x0 = hit.x, y0 = hit.y;
    const move = (ev: PointerEvent) => {
      const nx = Math.min(1, Math.max(0, x0 + (ev.clientX - e.clientX) / r.width));
      const ny = Math.min(1, Math.max(0, y0 + (ev.clientY - e.clientY) / r.height));
      // Snap to centre lines.
      const sx = Math.abs(nx - 0.5) < 0.015 ? 0.5 : nx, sy = Math.abs(ny - 0.5) < 0.015 ? 0.5 : ny;
      st.update((d) => {
        const it = hit.kind === 'overlay' ? d.overlays.find((o) => o.id === hit.id) : d.typo.find((k) => k.id === hit.id);
        if (it) {
          it.x = sx;
          it.y = sy;
          if ('locked' in it) it.locked = true;
        }
      }, `drag-${hit.id}`);
    };
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const clips = m.project.clips;
  const ci = clipIndexAt(clips, time);
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    useEditor.getState().seek(((e.clientX - r.left) / r.width) * m.length);
  };
  const sel = selection && (selection.kind === 'overlay' || selection.kind === 'keyword') ? hitBoxes(m.project, time, W, H).find((b) => b.id === selection.id) : undefined;
  const selItem = selection?.kind === 'overlay' ? m.project.overlays.find((o) => o.id === selection.id) : selection?.kind === 'keyword' ? m.project.typo.find((b) => b.id === selection.id) : undefined;
  const selRotation = selItem?.rotate ?? 0;
  /** Corner handles scale (overlay.size / typography.scale); the top knob rotates, snapping near 0/±15/±45/±90°. */
  const handleDrag = (e: React.PointerEvent, mode: 'scale' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    if (!sel || !selection || !canvas.current) return;
    const r = canvas.current.getBoundingClientRect();
    const cx = r.left + sel.x * r.width, cy = r.top + sel.y * r.height;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    const item0 = selection.kind === 'overlay' ? m.project.overlays.find((o) => o.id === selection.id) : m.project.typo.find((b) => b.id === selection.id);
    if (!item0) return;
    const size0 = 'size' in item0 ? item0.size : item0.scale;
    const st = useEditor.getState();
    const move = (ev: PointerEvent) => {
      st.update((d) => {
        const it = selection.kind === 'overlay' ? d.overlays.find((o) => o.id === selection.id) : d.typo.find((b) => b.id === selection.id);
        if (!it) return;
        if (mode === 'scale') {
          const k = Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0;
          const v = Math.max(0.05, Math.min(5, size0 * k));
          if ('size' in it) it.size = v;
          else it.scale = v;
        } else {
          let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
          if (deg > 180) deg -= 360;
          const snap = [0, 15, -15, 45, -45, 90, -90].find((a) => Math.abs(deg - a) < 4);
          it.rotate = Math.round(snap ?? deg);
        }
        if ('locked' in it) it.locked = true;
      }, `${mode}-${selection.id}`);
    };
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={`preview ${full ? 'full' : ''}`}>
      <div className="stage" ref={stageRef}>
        <div className="frame" style={{ width: W * fitScale, height: H * fitScale }}>
          <canvas ref={canvas} width={W} height={H} onPointerDown={onPointerDown} onDoubleClick={() => useEditor.getState().setPlaying(!playing)} />
          {guides && <div className={`guides ${m.project.export.aspect === '9:16' ? 'tall' : ''}`} />}
          {sel && (
            <div className="sel-box" style={{ left: `${(sel.x - sel.w / 2) * 100}%`, top: `${(sel.y - sel.h / 2) * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%`, transform: `rotate(${selRotation}deg)` }}>
              {(['nw', 'ne', 'sw', 'se'] as const).map((c) => <span key={c} className={`h-scale ${c}`} onPointerDown={(e) => handleDrag(e, 'scale')} title="Drag to resize" />)}
              <span className="h-rot" onPointerDown={(e) => handleDrag(e, 'rotate')} title="Drag to rotate (snaps to 0/15/45/90°)" />
            </div>
          )}
        </div>
        {status && <span className="stage-status">{status}</span>}
      </div>
      <div className="scrub" onMouseDown={seek} onMouseMove={(e) => e.buttons === 1 && seek(e)}>
        <div style={{ width: `${(time / m.length) * 100}%` }} />
      </div>
      <div className="transport">
        <button className="icon-btn" onClick={() => useEditor.getState().seek(0)} title="Back to start"><Icon name="skipBack" /></button>
        <button className="play" onClick={() => useEditor.getState().setPlaying(!playing)} title="Play / pause (Space)"><Icon name={playing ? 'pause' : 'play'} size={18} /></button>
        <span className="tc">{fmtTime(time)} <i>/ {fmtTime(m.length)}</i></span>
        <div className="grow" />
        {playing && fps > 0 && <span className={`chip ${fps < 20 ? 'warn' : ''}`} title={fast ? 'Fast preview on (lighter while playing; export is full quality)' : 'Full-quality preview'}>{fps} fps{fast ? ' · fast' : ''}</span>}
        <span className="chip">Clip {clips.length ? ci + 1 : 0} / {clips.length}</span>
        <button className={`icon-btn ${guides ? 'on' : ''}`} onClick={() => setGuides(!guides)} title="Safe-area guides"><Icon name="fit" /></button>
        <button className="icon-btn" onClick={() => setFull(!full)} title="Theatre mode"><Icon name={full ? 'x' : 'full'} /></button>
      </div>
    </div>
  );
}
