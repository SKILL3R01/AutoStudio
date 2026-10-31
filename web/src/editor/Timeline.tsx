import { memo, useEffect, useRef, useState } from 'react';
import { useEditor, clipEnd, projectLength } from '../store';
import { useLines, useProject, useThumb } from './hooks';
import { media, peaks } from '../render/media';
import { clipIndexAt } from '../render/renderer';
import { fmtTime, uid } from '../lib/util';
import type { Clip } from '../types';
import { deleteSelection } from './shortcuts';
import { Icon } from '../components/icons';

/** Pointer-drag helper reporting the horizontal delta in seconds. */
function startDrag(e: React.PointerEvent, zoom: number, onMove: (dt: number) => void, onClick?: () => void) {
  e.stopPropagation();
  const x0 = e.clientX;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - x0) > 3) moved = true;
    if (moved) onMove((ev.clientX - x0) / zoom);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!moved) onClick?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const stamp = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000);
  return `${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}-${String(ms).padStart(3, '0')}`;
};

const ClipBlock = memo(function ClipBlock({ clip, i, end, zoom, selected, kind, name }: { clip: Clip; i: number; end: number; zoom: number; selected: boolean; kind?: 'image' | 'video' | 'audio'; name?: string }) {
  const thumb = useThumb(clip.assetId, kind);
  const start = i === 0 ? 0 : clip.start;
  const w = Math.max(2, (end - start) * zoom);
  const update = useEditor((s) => s.update);
  const onEdge = (e: React.PointerEvent) => {
    const p0 = useEditor.getState().project!;
    const t0 = p0.clips[i].start;
    const lo = i > 0 ? (i === 1 ? 0 : p0.clips[i - 1].start) + 0.1 : 0;
    const hi = (i + 1 < p0.clips.length ? p0.clips[i + 1].start : projectLength(p0)) - 0.1;
    startDrag(e, zoom, (dt) => update((p) => void (p.clips[i].start = Math.min(hi, Math.max(lo, t0 + dt))), `edge-${clip.id}`));
  };
  return (
    <div
      className={`clip ${selected ? 'sel' : ''} ${kind === 'video' ? 'video' : ''}`}
      style={{ left: start * zoom, width: w, backgroundImage: thumb && w > 18 ? `url(${thumb})` : undefined }}
      title={`${name} · ${fmtTime(start)} → ${fmtTime(end)}`}
      onPointerDown={(e) => {
        const shift = e.shiftKey || e.ctrlKey || e.metaKey;
        startDrag(e, zoom, () => {}, () => {
          const st = useEditor.getState();
          if (shift && st.selection?.kind === 'clip' && st.selection.id !== clip.id) return st.toggleMulti(clip.id);
          st.select(selected ? null : { kind: 'clip', id: clip.id });
          st.seek(start + 0.001);
        });
      }}
    >
      {w > 34 && <span className="dur">{(end - start).toFixed(1)}s</span>}
      {w > 60 && <span className="ts">{stamp(start)}</span>}
      {w > 20 && (kind === 'video' || clip.depthId || clip.regions?.length) && (
        <span className="vid">{kind === 'video' ? '▶' : ''}{clip.depthId ? '◆' : ''}{clip.regions?.length ? '✦' : ''}</span>
      )}
      {i > 0 && <div className="edge" onPointerDown={onEdge} />}
    </div>
  );
});

function Waveform({ assetId, length, zoom }: { assetId: string; length: number; zoom: number }) {
  const [pk, setPk] = useState<Float32Array>();
  useEffect(() => {
    let live = true;
    media.audioBuffer(assetId).then((b) => live && b && setPk(peaks(b, Math.ceil(b.duration * 25))));
    return () => void (live = false);
  }, [assetId]);
  const TILE = 4000;
  const total = Math.ceil(length * zoom);
  const tiles = Math.ceil(total / TILE);
  return (
    <>
      {Array.from({ length: tiles }, (_, k) => (
        <WaveTile key={k} pk={pk} x0={k * TILE} w={Math.min(TILE, total - k * TILE)} zoom={zoom} />
      ))}
    </>
  );
}

function WaveTile({ pk, x0, w, zoom }: { pk?: Float32Array; x0: number; w: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !pk) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, 40);
    g.fillStyle = '#8b93a7';
    for (let x = 0; x < w; x += 3) {
      const i = Math.floor(((x0 + x) / zoom) * 25);
      const v = Math.min(1, (pk[i] ?? 0) * 1.4);
      const h = Math.max(1, v * 34);
      g.fillRect(x, 20 - h / 2, 2, h);
    }
  }, [pk, x0, w, zoom]);
  return <canvas ref={ref} width={w} height={40} style={{ position: 'absolute', left: x0, top: 2 }} />;
}

function Ruler({ length, zoom }: { length: number; zoom: number }) {
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * zoom >= 70) ?? 600;
  const marks = [];
  for (let t = 0; t <= length; t += step) marks.push(t);
  return (
    <div className="ruler" onPointerDown={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const seekAt = (x: number) => useEditor.getState().seek((x - r.left) / zoom);
      seekAt(e.clientX);
      const move = (ev: PointerEvent) => seekAt(ev.clientX);
      const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }}>
      {marks.map((t) => <span key={t} style={{ left: t * zoom }}>{fmtTime(t, false)}</span>)}
    </div>
  );
}

function Playhead({ zoom, scroller }: { zoom: number; scroller: React.RefObject<HTMLDivElement | null> }) {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const x = time * zoom;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft) el.scrollLeft = x - 80;
  }, [x, playing, scroller]);
  return <div className="playhead" style={{ left: x }} />;
}

export function splitAtPlayhead() {
  const { project: p, time, update } = useEditor.getState();
  if (!p?.clips.length) return;
  const i = clipIndexAt(p.clips, time);
  const c = p.clips[i];
  const start = i === 0 ? 0 : c.start;
  if (time - start < 0.2 || clipEnd(p, i) - time < 0.2) return;
  update((d) => {
    const asset = d.assets.find((a) => a.id === c.assetId);
    const copy = { ...structuredClone(c), id: uid(), start: time, trimIn: asset?.kind === 'video' ? c.trimIn + (time - start) : 0 };
    d.clips.splice(i + 1, 0, copy);
  });
}

export function Timeline() {
  const p = useProject();
  const lines = useLines();
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const sel = useEditor((s) => s.selection);
  const multi = useEditor((s) => s.multi);
  const update = useEditor((s) => s.update);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 2000 });
  const [height, setHeight] = useState(() => Math.max(300, +(localStorage.getItem('tlHeight') ?? 300)));
  const length = projectLength(p);
  const width = Math.max(length * zoom + 200, 600);
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const fit = () => scroller.current && setZoom(Math.max(1, (scroller.current.clientWidth - 40) / length));
  // Only render items near the visible window — long projects have hundreds of clips and caption lines.
  const v0 = (view.left - 400) / zoom, v1 = (view.left + view.width + 400) / zoom;
  const inView = (s: number, e: number) => e >= v0 && s <= v1;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    on();
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => (el.removeEventListener('scroll', on), window.removeEventListener('resize', on));
  }, []);

  const moveItem = (key: 'music' | 'sfx' | 'overlays' | 'keywords', id: string, e: React.PointerEvent, mode: 'move' | 'resize' = 'move') => {
    const item = (p[key] as { id: string; start: number; duration?: number; end?: number }[]).find((x) => x.id === id)!;
    const s0 = item.start, d0 = item.duration ?? 0, e0 = item.end ?? 0;
    const kind = key === 'overlays' ? 'overlay' : key === 'keywords' ? 'keyword' : key;
    startDrag(e, zoom, (dt) => update((d) => {
      const it = (d[key] as { id: string; start: number; duration?: number; end?: number }[]).find((x) => x.id === id)!;
      if (mode === 'move') {
        it.start = Math.max(0, s0 + dt);
        if (it.end !== undefined) it.end = Math.max(it.start + 0.2, e0 + dt);
      } else if (it.end !== undefined) it.end = Math.max(it.start + 0.2, e0 + dt);
      else it.duration = Math.max(0.2, d0 + dt);
    }, `${mode}-${id}`), () => (useEditor.getState().select({ kind, id }), useEditor.getState().seek(s0 + 0.05)));
  };
  const resize = (e: React.PointerEvent) => {
    const y0 = e.clientY, h0 = height;
    const move = (ev: PointerEvent) => {
      const h = Math.min(520, Math.max(300, h0 - (ev.clientY - y0)));
      setHeight(h);
      localStorage.setItem('tlHeight', String(h));
    };
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const selCount = (sel ? 1 : 0) + multi.length;

  return (
    <div className="timeline" style={{ height }}>
      <div className="tl-resize" onPointerDown={resize} title="Drag to resize" />
      <div className="tl-tools">
        <button className="icon-btn" onClick={splitAtPlayhead} title="Split at playhead (S)"><Icon name="scissors" /></button>
        <button className="icon-btn" disabled={!selCount} onClick={deleteSelection} title="Delete (Del)"><Icon name="trash" /></button>
        {selCount > 1 && <span className="chip">{selCount} clips selected</span>}
        <div className="grow" />
        <button className="icon-btn" onClick={() => setZoom(Math.max(1, zoom / 1.5))} title="Zoom out">−</button>
        <input type="range" min={1} max={300} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        <button className="icon-btn" onClick={() => setZoom(Math.min(300, zoom * 1.5))} title="Zoom in">+</button>
        <button className="btn ghost sm" onClick={fit}>Fit</button>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <span />
          <span title="Text overlays"><Icon name="text" size={13} /></span>
          <span title="Keywords"><Icon name="keywords" size={13} /></span>
          <span title="Video / images"><Icon name="film" size={13} /></span>
          <span title="Captions"><Icon name="captions" size={13} /></span>
          <span title="Voiceover"><Icon name="mic" size={13} /></span>
          <span title="Music"><Icon name="music" size={13} /></span>
          <span title="Sound effects"><Icon name="sfx" size={13} /></span>
        </div>
        <div className="tl-scroll" ref={scroller} onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom(Math.min(300, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
          }
        }}>
          <div className="tl-inner" style={{ width }}>
            <Ruler length={length} zoom={zoom} />
            <div className="track t-text">
              {p.overlays.filter((o) => inView(o.start, o.start + o.duration)).map((o) => (
                <div key={o.id} className={`item overlay ${sel?.id === o.id ? 'sel' : ''}`} style={{ left: o.start * zoom, width: Math.max(8, o.duration * zoom) }} onPointerDown={(e) => moveItem('overlays', o.id, e)}>
                  {o.assetId ? '🖼' : 'T'} {o.text}
                  <div className="resize" onPointerDown={(e) => moveItem('overlays', o.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-kw">
              {p.captions.mode !== 'full' && p.keywords.filter((k) => inView(k.start, k.end)).map((k) => (
                <div key={k.id} className={`item kw ${sel?.id === k.id ? 'sel' : ''}`} style={{ left: k.start * zoom, width: Math.max(10, (k.end - k.start) * zoom), borderColor: k.color }} onPointerDown={(e) => moveItem('keywords', k.id, e)}>
                  {k.text}
                  <div className="resize" onPointerDown={(e) => moveItem('keywords', k.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-video">
              {p.clips.map((c, i) => {
                const end = clipEnd(p, i);
                return inView(i === 0 ? 0 : c.start, end) ? (
                  <ClipBlock key={c.id} clip={c} i={i} end={end} zoom={zoom} selected={sel?.id === c.id || multi.includes(c.id)} kind={assets.get(c.assetId)?.kind} name={assets.get(c.assetId)?.name} />
                ) : null;
              })}
            </div>
            <div className="track t-caps">
              {p.captions.enabled && p.captions.mode !== 'keywords' && lines.filter((l) => inView(l.start, l.end)).map((l, k) => (
                <div key={`${l.start}-${k}`} className="item cap" style={{ left: l.start * zoom, width: Math.max(2, (l.end - l.start) * zoom) }} onPointerDown={() => useEditor.getState().seek(l.start + 0.001)}>
                  {(l.end - l.start) * zoom > 30 && l.words.map((w) => w.text).join(' ')}
                </div>
              ))}
            </div>
            <div className="track t-audio">
              {p.voiceover && <Waveform assetId={p.voiceover.assetId} length={assets.get(p.voiceover.assetId)?.duration ?? length} zoom={zoom} />}
            </div>
            <div className="track t-music">
              {p.music.map((m) => (
                <div key={m.id} className={`item music ${sel?.id === m.id ? 'sel' : ''}`} style={{ left: m.start * zoom, width: Math.max(8, m.duration * zoom) }} onPointerDown={(e) => moveItem('music', m.id, e)}>
                  ♫ {assets.get(m.assetId)?.name}
                  <div className="resize" onPointerDown={(e) => moveItem('music', m.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-fx">
              {p.sfx.map((s) => (
                <div key={s.id} className={`item sfx ${sel?.id === s.id ? 'sel' : ''}`} style={{ left: s.start * zoom }} onPointerDown={(e) => moveItem('sfx', s.id, e)} title={s.sound}>
                  {s.sound.startsWith('asset:') ? '♪' : s.sound}
                </div>
              ))}
            </div>
            <Playhead zoom={zoom} scroller={scroller} />
          </div>
        </div>
      </div>
    </div>
  );
}
