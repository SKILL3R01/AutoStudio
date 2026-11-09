import { useMenu } from './ContextMenu';
import { addTrack, bindWords, captionDrift, moveAudioClip, newAudioClip, resolveOverlap, resyncCaptions, unbindWords } from '../lib/audiotracks';
import { insertAssetAt } from './MediaPanel';
import { toast } from '../components/Toast';
import type { AudioTrack } from '../types';
import { durationFlags, moveClip } from '../lib/timeline';
import { useUi, type TlSize } from '../lib/uimode';
import type { Selection } from '../store';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, clipEnd, projectLength } from '../store';
import { useLines, useProject, useThumb } from './hooks';
import { media, peaks } from '../render/media';
import { fmtTime } from '../lib/util';
import { TRANSITIONS, type Clip, type Transition } from '../types';
import { deleteAction } from './shortcuts';
import { copySelection, detachSelectedAudio, duplicate, hasClipboard, paste, splitAllAtPlayhead, splitAtPlayhead } from './actions';
import { snapPoints, snapTime } from './edit';
import { Icon } from '../components/icons';
import { Slider } from '../components/ui';
import { TRANSITION_LABELS } from './Panels';
import { stampFor } from '../lib/timecode';
import { blankClip } from '../lib/project';

/** Pointer-drag helper reporting the horizontal delta in seconds. */
function startDrag(e: React.PointerEvent, zoom: number, onMove: (dt: number, ev: PointerEvent) => void, onClick?: () => void, onDrop?: (dt: number, ev: PointerEvent) => void) {
  if (e.button === 2) return; // right-click opens the quick menu
  e.stopPropagation();
  const x0 = e.clientX;
  let moved = false;
  const move = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - x0) > 4) moved = true;
    if (moved) onMove((ev.clientX - x0) / zoom, ev);
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!moved) onClick?.();
    else onDrop?.((ev.clientX - x0) / zoom, ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const stamp = stampFor;
const openMenu = (e: React.MouseEvent, target: NonNullable<Selection>, time: number) => useMenu.getState().open(e, target, time);

const ClipBlock = memo(function ClipBlock({ clip, i, end, zoom, selected, kind, name, flag }: { clip: Clip; i: number; end: number; zoom: number; selected: boolean; kind?: 'image' | 'video' | 'audio'; name?: string; flag?: 'short' | 'long' }) {
  const [drag, setDrag] = useState(0);
  const thumb = useThumb(clip.assetId, kind);
  const start = i === 0 ? 0 : clip.start;
  const w = Math.max(2, (end - start) * zoom);
  const update = useEditor((s) => s.update);
  const onEdge = (e: React.PointerEvent) => {
    const p0 = useEditor.getState().project!;
    const t0 = p0.clips[i].start;
    const lo = i > 0 ? (i === 1 ? 0 : p0.clips[i - 1].start) + 0.1 : 0;
    const hi = (i + 1 < p0.clips.length ? p0.clips[i + 1].start : projectLength(p0)) - 0.1;
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints(p0, st.time, clip.id) : [];
    // Hold Shift to drag without snapping.
    startDrag(e, zoom, (dt, ev) => update((p) => void (p.clips[i].start = Math.min(hi, Math.max(lo, pts.length && !ev.shiftKey ? snapTime(t0 + dt, pts, zoom) : t0 + dt))), `edge-${clip.id}`));
  };
  return (
    <div
      className={`clip ${selected ? 'sel' : ''} ${kind === 'video' ? 'video' : ''} ${clip.fill ? 'blank' : ''} ${flag ? `flag-${flag}` : ''} ${drag ? 'dragging' : ''}`}
      style={{ left: start * zoom + drag, width: w, backgroundImage: thumb && w > 18 ? `url(${thumb})` : undefined, backgroundColor: clip.fill }}
      title={`${clip.fill ? 'Blank section' : name} · ${fmtTime(start)} → ${fmtTime(end)} · ${(end - start).toFixed(2)} s${flag === 'short' ? ' · shorter than 1 s' : flag === 'long' ? ' · longer than 20 s' : ''} — drag to move, right-click for options`}
      onContextMenu={(e) => openMenu(e, { kind: 'clip', id: clip.id }, start + (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom)}
      onPointerDown={(e) => {
        const shift = e.shiftKey || e.ctrlKey || e.metaKey;
        const clickT = start + (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom;
        startDrag(e, zoom, (dt) => setDrag(dt * zoom), () => {
          const st = useEditor.getState();
          if (shift && st.selection?.kind === 'clip' && st.selection.id !== clip.id) return st.toggleMulti(clip.id);
          st.select({ kind: 'clip', id: clip.id });
          st.seek(clickT);
        }, (dt) => {
          // Drop: move the clip to where it was dropped (durations kept, no gaps or overlaps).
          setDrag(0);
          const st = useEditor.getState();
          const p0 = st.project!;
          const len = projectLength(p0);
          const target = Math.max(0, Math.min(len - 0.01, clickT + dt));
          const to = Math.max(0, p0.clips.findIndex((_c, k) => target < (k + 1 < p0.clips.length ? p0.clips[k + 1].start : len)));
          if (to !== i) st.update((d) => void (d.clips = moveClip(d.clips, i, to, len)));
        });
      }}
    >
      {w > 34 && <span className="dur">{(end - start).toFixed(1)}s</span>}
      {clip.fill && w > 50 && <span className="blank-label">Blank</span>}
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

const SHORT: Partial<Record<Transition, string>> = {
  none: 'Cut', crossfade: 'Fade', fadeBlack: 'Black', fadeWhite: 'White', slideLeft: 'Slide ←', slideRight: 'Slide →', slideUp: 'Slide ↑',
  slideDown: 'Slide ↓', zoomPunch: 'Punch', random: '✦',
};

/** The transition into clip i, drawn on the cut: a shaded zone of its duration plus a clickable chip. */
function TransitionMarker({ clip, i, zoom, duration, open, onOpen }: { clip: Clip; i: number; zoom: number; duration: number; open: boolean; onOpen: (i: number | null) => void }) {
  const update = useEditor((s) => s.update);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const kind = clip.transition;
  const w = kind === 'none' ? 0 : duration * zoom;
  return (
    <>
      {w > 2 && <div className="tr-zone" style={{ left: clip.start * zoom - w / 2, width: w }} />}
      <button
        className={`tr-chip ${kind === 'none' ? 'cut' : ''} ${open ? 'on' : ''}`}
        style={{ left: clip.start * zoom }}
        title={`Transition into clip ${i + 1}: ${TRANSITION_LABELS[kind]}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => (setAnchor(e.currentTarget.getBoundingClientRect()), onOpen(open ? null : i))}
      >
        {zoom * 3 > 40 ? SHORT[kind] ?? TRANSITION_LABELS[kind] : kind === 'none' ? '|' : '◆'}
      </button>
      {open && anchor && createPortal(
        <div className="tr-pop" style={{ left: Math.min(window.innerWidth - 340, Math.max(8, anchor.left - 160)), bottom: window.innerHeight - anchor.top + 8 }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="row between"><b>Transition into clip {i + 1}</b><button className="icon-btn" onClick={() => onOpen(null)}><Icon name="x" /></button></div>
          <div className="grid3">
            {TRANSITIONS.map((t) => (
              <button key={t} className={`tile ${kind === t ? 'on' : ''}`} onClick={() => update((d) => void (d.clips.find((c) => c.id === clip.id)!.transition = t))}>{TRANSITION_LABELS[t]}</button>
            ))}
          </div>
          <Slider label="Duration (all)" value={duration} min={0.1} max={2} onChange={(v) => update((d) => void (d.transitionDuration = v), 'td')} suffix="s" />
        </div>,
        document.body,
      )}
    </>
  );
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
  const [height, setHeight] = useState(() => Math.max(160, +(localStorage.getItem('tlHeight') ?? 300)));
  const [winH, setWinH] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => setWinH(window.innerHeight);
    const onReset = () => setHeight(300);
    window.addEventListener('resize', onResize);
    window.addEventListener('layout-reset', onReset);
    return () => (window.removeEventListener('resize', onResize), window.removeEventListener('layout-reset', onReset));
  }, []);
  // Never let the timeline push the preview off-screen on short windows.
  const shownHeight = Math.max(160, Math.min(height, winH - 280));
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

  const [trOpen, setTrOpen] = useState<number | null>(null);
  const snapOn = useEditor((s) => s.snap);
  const setSnap = useEditor((s) => s.setSnap);
  const uiMode = useUi((u) => u.mode);
  /** Move an item, drag its right edge (`resize`) or its left edge (`trimStart`). Edges snap (Shift = no snap). */
  const moveItem = (key: 'audio' | 'overlays' | 'typo', id: string, e: React.PointerEvent, mode: 'move' | 'resize' | 'trimStart' = 'move') => {
    const item = (p[key] as { id: string; start: number; duration?: number; end?: number; trimIn?: number; rate?: number }[]).find((x) => x.id === id)!;
    const s0 = item.start, d0 = item.duration ?? 0, e0 = item.end ?? 0, tin0 = item.trimIn ?? 0, rate = item.rate ?? 1;
    const len0 = item.end !== undefined ? e0 - s0 : d0;
    const words0 = key === 'typo' ? p.typo.find((b) => b.id === id)!.words.map((w) => [w.start, w.end]) : [];
    const kind = key === 'overlays' ? 'overlay' : key === 'typo' ? 'keyword' : 'audio';
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints(p, st.time, id) : [];
    const srcLen = key === 'audio' ? (assets.get(p.audio.find((c) => c.id === id)!.assetId)?.duration ?? Infinity) : Infinity;
    const clickT = s0 + (e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / zoom;
    startDrag(e, zoom, (dt, ev) => update((d) => {
      const snap = (t: number) => (pts.length && !ev.shiftKey ? snapTime(t, pts, zoom) : t);
      if (key === 'audio') bindWords(d);
      const it = (d[key] as { id: string; start: number; duration?: number; end?: number; trimIn?: number; trackId?: string; words?: { start: number; end: number }[] }[]).find((x) => x.id === id)!;
      if (mode === 'move') {
        const raw = s0 + dt;
        const a = snap(raw), b = snap(raw + len0) - len0;
        const want = a !== raw && (b === raw || Math.abs(a - raw) <= Math.abs(b - raw)) ? a : b;
        const shift = Math.max(-s0, want - s0);
        if (key === 'audio') {
          // Drag up / down onto another audio track.
          const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-track]') as HTMLElement | null;
          moveAudioClip(d, id, s0 + shift, row?.dataset.track);
          return;
        }
        it.start = s0 + shift;
        if (it.end !== undefined) it.end = e0 + shift;
        it.words?.forEach((w, k) => ((w.start = words0[k][0] + shift), (w.end = words0[k][1] + shift)));
      } else if (mode === 'trimStart') {
        const lo = key === 'audio' ? s0 - tin0 / rate : 0;
        const ns = Math.min(s0 + d0 - 0.2, Math.max(lo, snap(s0 + dt)));
        it.start = ns;
        it.duration = d0 - (ns - s0);
        if (key === 'audio') it.trimIn = Math.max(0, tin0 + (ns - s0) * rate);
      } else if (it.end !== undefined) it.end = Math.max(it.start + 0.2, snap(e0 + dt));
      else it.duration = Math.min(key === 'audio' ? (srcLen - tin0) / rate : Infinity, Math.max(0.2, snap(s0 + d0 + dt) - s0));
    }, `${mode}-${id}`), () => {
      const st2 = useEditor.getState();
      if (e.shiftKey || e.ctrlKey || e.metaKey) return st2.toggleMulti(id);
      st2.select({ kind, id });
      st2.seek(clickT);
    }, () => {
      if (key !== 'audio' || mode !== 'move') return;
      let moved = '';
      update((d) => void (moved = resolveOverlap(d, id)), `${mode}-${id}`);
      if (moved) toast(`It overlapped another clip — moved to “${moved}”`, 'info');
    });
  };
  /** Drag the volume line of an audio clip up / down (0–200 %). */
  const dragVolume = (id: string, e: React.PointerEvent, h: number) => {
    e.stopPropagation();
    const v0 = p.audio.find((c) => c.id === id)!.volume;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => update((d) => void (d.audio.find((c) => c.id === id)!.volume = Math.round(Math.min(2, Math.max(0, v0 - ((ev.clientY - y0) / h) * 2)) * 100) / 100), `vol-${id}`);
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** Drag a fade handle (top corners). */
  const dragFade = (id: string, which: 'fadeIn' | 'fadeOut', e: React.PointerEvent) => {
    const c = p.audio.find((x) => x.id === id)!;
    const f0 = c[which];
    startDrag(e, zoom, (dt) => update((d) => void (d.audio.find((x) => x.id === id)![which] = Math.round(Math.min(c.duration / 2, Math.max(0, f0 + (which === 'fadeIn' ? dt : -dt))) * 10) / 10), `fade-${id}`));
  };
  /** Empty the timeline (visuals, text, typography, audio clips). Media and captions stay; Undo restores. */
  const clearTimeline = () => {
    if (!confirm('Clear the timeline? Clips, text, typography and every audio clip are removed. Your media and captions stay. (Undo brings everything back)')) return;
    update((d) => void ((d.clips = []), (d.overlays = []), (d.typo = []), (d.audio = []), (d.length = 0), (d.effects = d.effects.filter((e) => !e.scope || e.scope.kind === 'all'))));
  };
  const insertBlank = () => update((d) => {
    const t = useEditor.getState().time;
    d.clips.push(blankClip(d.clips.length ? t : 0));
    d.clips.sort((a, b) => a.start - b.start);
    if (d.clips.length === 1) d.length = Math.max(d.length, 3);
  });
  const flags = new Map(durationFlags(p, length).map((f) => [f.id, f.kind]));
  const tlSize = useUi((u) => u.tlSize);
  const setTlSize = useUi((u) => u.setTlSize);
  const resize = (e: React.PointerEvent) => {
    const y0 = e.clientY, h0 = shownHeight;
    const move = (ev: PointerEvent) => {
      const h = Math.min(Math.max(200, window.innerHeight - 280), Math.max(160, h0 - (ev.clientY - y0)));
      setHeight(h);
      localStorage.setItem('tlHeight', String(h));
    };
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** Drag the bottom edge of an audio track header to change its height. */
  const resizeTrack = (id: string, e: React.PointerEvent, h0: number) => {
    e.stopPropagation();
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => update((d) => void (d.audioTracks.find((t) => t.id === id)!.height = Math.round(Math.min(160, Math.max(28, h0 + ev.clientY - y0)))), `trh-${id}`);
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const selCount = (sel ? 1 : 0) + multi.filter((m) => m !== sel?.id).length;
  const drift = captionDrift(p);
  const allowDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-asset')) return;
    e.preventDefault();
    e.currentTarget.classList.add('drop-on');
  };
  const dropLeave = (e: React.DragEvent) => e.currentTarget.classList.remove('drop-on');
  /** Media dragged from the Media panel: visuals go on the main track, audio on the track it was dropped on. */
  const dropAsset = (e: React.DragEvent, target: string) => {
    e.currentTarget.classList.remove('drop-on');
    const id = e.dataTransfer.getData('application/x-asset');
    const a = id && assets.get(id);
    if (!a) return;
    e.preventDefault();
    const t = Math.max(0, (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom);
    if (target === 'video') {
      if (a.kind === 'audio') return toast('Drop audio on an audio track', 'info');
      return update((d) => insertAssetAt(d, a.id, t));
    }
    if (a.kind === 'image') return toast('Drop images on the Video track', 'info');
    let moved = '';
    update((d) => {
      const tr = d.audioTracks.find((x) => x.id === target)!;
      const c = newAudioClip(target, a.id, t, a.duration ?? 5, tr.kind);
      d.audio.push(c);
      moved = resolveOverlap(d, c.id);
    });
    if (moved) toast(`That spot was taken — added on “${moved}”`, 'info');
  };
  const base = ROWS[tlSize];
  const trackH = (t: AudioTrack) => t.height ?? base.audio;
  const rows = `${base.ruler}px ${base.text}px ${base.typo}px ${base.video}px ${base.caps}px ${p.audioTracks.map((t) => `${trackH(t)}px`).join(' ')} ${base.fx}px`;
  const setTrack = (id: string, fn: (t: AudioTrack) => void) => update((d) => fn(d.audioTracks.find((t) => t.id === id)!));

  return (
    <div className={`timeline size-${tlSize}`} style={{ height: shownHeight }}>
      <div className="tl-resize" onPointerDown={resize} title="Drag to resize" />
      <div className="tl-tools">
        <button className="icon-btn" onClick={splitAllAtPlayhead} title="Split everything under the playhead (all tracks)"><Icon name="scissors" /></button>
        <button className="icon-btn" disabled={!sel || sel.kind === 'keyword'} onClick={() => splitAtPlayhead()} title="Split the selected item at the playhead (S) — or right-click → Split here"><Icon name="split" /></button>
        <button className="icon-btn" disabled={!selCount} onClick={deleteAction} title="Delete (Del) · Shift+Del = ripple delete"><Icon name="trash" /></button>
        <span className="tl-sep" />
        <button className="icon-btn" disabled={!selCount} onClick={() => void copySelection()} title="Copy (Ctrl+C)"><Icon name="copy" /></button>
        <button className="icon-btn" disabled={!hasClipboard()} onClick={() => paste()} title="Paste at playhead (Ctrl+V)"><Icon name="paste" /></button>
        <button className="icon-btn" disabled={!selCount} onClick={duplicate} title="Duplicate (Ctrl+D)"><Icon name="layers" /></button>
        <button className="icon-btn" disabled={sel?.kind !== 'clip' || assets.get(p.clips.find((c) => c.id === sel.id)?.assetId ?? '')?.kind !== 'video'} onClick={detachSelectedAudio} title="Detach audio: move a video clip's sound to an audio track"><Icon name="unlink" /></button>
        <span className="tl-sep" />
        <button className={`icon-btn ${snapOn ? 'on' : ''}`} onClick={() => setSnap(!snapOn)} title={`Snapping ${snapOn ? 'on' : 'off'} (N) — hold Shift while dragging to ignore`}><Icon name="magnet" /></button>
        <button className="btn ghost sm" onClick={insertBlank} title="Insert a blank (black) section at the playhead"><Icon name="plus" /> Blank</button>
        {uiMode === 'pro' && <button className="btn ghost sm" onClick={() => update((d) => void addTrack(d, 'other'))} title="Add an audio track"><Icon name="plus" /> Track</button>}
        <button className="btn ghost sm" onClick={clearTimeline} title="Empty the timeline (keeps media and captions)"><Icon name="trash" /> Clear</button>
        <select className="tl-size" value={tlSize} onChange={(e) => setTlSize(e.target.value as TlSize)} title="Timeline size">
          <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="large">Large</option>
        </select>
        {flags.size > 0 && <span className="chip warn" title="Clips shorter than 1 s or longer than 20 s — right-click a clip to ignore">⚠ {flags.size}</span>}
        {selCount > 1 && <span className="chip">{selCount} selected</span>}
        {drift > 0 && (
          <span className="chip warn sync-chip" title="The voice was moved or cut — captions and typography no longer line up with it">
            ⚠ Captions out of sync ({drift})
            <button className="link" onClick={() => update((d) => resyncCaptions(d))}>Fix</button>
            <button className="link" onClick={() => update((d) => (unbindWords(d), bindWords(d)))}>Keep</button>
          </span>
        )}
        <div className="grow" />
        <span className="hint tl-len">{fmtTime(length)}</span>
        <button className="icon-btn" onClick={() => setZoom(Math.max(1, zoom / 1.5))} title="Zoom out">−</button>
        <input type="range" min={1} max={300} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
        <button className="icon-btn" onClick={() => setZoom(Math.min(300, zoom * 1.5))} title="Zoom in">+</button>
        <button className="btn ghost sm" onClick={fit}>Fit</button>
      </div>
      <div className="tl-body">
        <div className="tl-labels" style={{ gridTemplateRows: rows }}>
          <span />
          <span title="Text overlays"><Icon name="text" size={13} /> Text</span>
          <span title="Typography"><Icon name="keywords" size={13} /> Typo</span>
          <span title="Video / images"><Icon name="film" size={13} /> Video</span>
          <span title="Captions"><Icon name="captions" size={13} /> Caps</span>
          {p.audioTracks.map((t) => (
            <span key={t.id} className={`trk-head ${t.muted ? 'muted' : ''}`}>
              <b title={t.name}>{t.id === p.narrationTrackId ? '★ ' : ''}{t.name}</b>
              <span className="trk-btns">
                <button className={t.muted ? 'on' : ''} onClick={() => setTrack(t.id, (x) => void (x.muted = !x.muted))} title="Mute">M</button>
                <button className={t.solo ? 'on' : ''} onClick={() => setTrack(t.id, (x) => void (x.solo = !x.solo))} title="Solo">S</button>
                {t.kind === 'voice' && t.id !== p.narrationTrackId && <button onClick={() => update((d) => void ((d.narrationTrackId = t.id), (d.audioTracks.find((x) => x.id === t.id)!.muted = false)))} title="Make this the narration track (captions + ducking)">★</button>}
                {uiMode === 'pro' && !p.audio.some((c) => c.trackId === t.id) && p.audioTracks.length > 1 && t.id !== p.narrationTrackId && <button onClick={() => update((d) => void (d.audioTracks = d.audioTracks.filter((x) => x.id !== t.id)))} title="Remove empty track">×</button>}
              </span>
              <i className="trk-resize" onPointerDown={(e) => resizeTrack(t.id, e, trackH(t))} title="Drag to resize this track" />
            </span>
          ))}
          <span title="Effects"><Icon name="sfx" size={13} /> FX</span>
        </div>
        <div className="tl-scroll" ref={scroller} onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom(Math.min(300, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
          }
        }}>
          <div className="tl-inner" style={{ width, gridTemplateRows: rows }}>
            <Ruler length={length} zoom={zoom} />
            <div className="track t-text">
              {p.overlays.filter((o) => inView(o.start, o.start + o.duration)).map((o) => (
                <div key={o.id} className={`item overlay ${sel?.id === o.id || multi.includes(o.id) ? 'sel' : ''}`} style={{ left: o.start * zoom, width: Math.max(8, o.duration * zoom) }} onPointerDown={(e) => moveItem('overlays', o.id, e)} onContextMenu={(e) => openMenu(e, { kind: 'overlay', id: o.id }, o.start + (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom)}>
                  <div className="resize left" onPointerDown={(e) => moveItem('overlays', o.id, e, 'trimStart')} />
                  {o.assetId ? '🖼' : 'T'} {o.text}
                  <div className="resize" onPointerDown={(e) => moveItem('overlays', o.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-kw">
              {p.captions.typography !== false && p.typo.filter((k) => inView(k.start, k.end)).map((k) => (
                <div key={k.id} className={`item kw ${sel?.id === k.id || multi.includes(k.id) ? 'sel' : ''}`} style={{ left: k.start * zoom, width: Math.max(10, (k.end - k.start) * zoom) }} onPointerDown={(e) => moveItem('typo', k.id, e)} onContextMenu={(e) => openMenu(e, { kind: 'keyword', id: k.id }, k.start)}>
                  {k.words.map((w) => w.text).join(' ')}
                  <div className="resize" onPointerDown={(e) => moveItem('typo', k.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-video" onDragOver={allowDrop} onDragLeave={dropLeave} onDrop={(e) => dropAsset(e, 'video')}>
              {p.clips.map((c, i) => {
                const end = clipEnd(p, i);
                return inView(i === 0 ? 0 : c.start, end) ? (
                  <ClipBlock key={c.id} clip={c} i={i} end={end} zoom={zoom} selected={sel?.id === c.id || multi.includes(c.id)} kind={assets.get(c.assetId)?.kind} name={assets.get(c.assetId)?.name} flag={flags.get(c.id)} />
                ) : null;
              })}
              {p.clips.map((c, i) => (i > 0 && inView(c.start - 1, c.start + 1) ? (
                <TransitionMarker key={`tr-${c.id}`} clip={c} i={i} zoom={zoom} duration={p.transitionDuration} open={trOpen === i} onOpen={setTrOpen} />
              ) : null))}
              {p.clips.length > 0 && <div className="main-end" style={{ left: clipEnd(p, p.clips.length - 1) * zoom }} onPointerDown={(e) => {
                const l0 = p.length;
                startDrag(e, zoom, (dt) => update((d) => void (d.length = Math.max(d.clips[d.clips.length - 1].start + 0.2, Math.round((l0 + dt) * 10) / 10)), 'mainEnd'));
              }} title="Drag to make the last clip longer / shorter" />}
            </div>
            <div className="track t-caps">
              {p.captions.enabled && lines.filter((l) => inView(l.start, l.end)).map((l, k) => (
                <div key={`${l.start}-${k}`} className="item cap" style={{ left: l.start * zoom, width: Math.max(2, (l.end - l.start) * zoom) }} onPointerDown={() => useEditor.getState().seek(l.start + 0.001)}>
                  {(l.end - l.start) * zoom > 30 && l.words.map((w) => w.text).join(' ')}
                </div>
              ))}
            </div>
            {p.audioTracks.map((t) => (
              <div key={t.id} className={`track t-aud k-${t.kind} ${t.muted ? 'muted' : ''}`} data-track={t.id} onDragOver={allowDrop} onDragLeave={dropLeave} onDrop={(e) => dropAsset(e, t.id)}>
                {p.audio.filter((c) => c.trackId === t.id && inView(c.start, c.start + c.duration)).map((c) => {
                  const w = Math.max(8, c.duration * zoom);
                  const h = trackH(t) - 6;
                  const a = assets.get(c.assetId);
                  return (
                    <div key={c.id} className={`item aclip k-${t.kind} ${sel?.id === c.id || multi.includes(c.id) ? 'sel' : ''}`} style={{ left: c.start * zoom, width: w }}
                      onPointerDown={(e) => moveItem('audio', c.id, e)}
                      onContextMenu={(e) => openMenu(e, { kind: 'audio', id: c.id }, c.start + (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom)}
                      title={`${a?.name ?? c.sound} · ${fmtTime(c.start)} → ${fmtTime(c.start + c.duration)} · ${Math.round(c.volume * 100)}% — drag to move (also to another track), drag the line for volume`}>
                      {a && <div className="aclip-wave" style={{ left: (-c.trimIn / (c.rate ?? 1)) * zoom }}><Waveform assetId={a.id} length={a.duration ?? c.duration} zoom={zoom / (c.rate ?? 1)} /></div>}
                      {c.fadeIn > 0 && <FadeRamp dir="in" w={Math.min(c.duration, c.fadeIn) * zoom} />}
                      {c.fadeOut > 0 && <FadeRamp dir="out" w={Math.min(c.duration, c.fadeOut) * zoom} />}
                      <span className="aclip-name">{t.kind === 'music' ? '♫ ' : ''}{a?.name ?? c.sound}{c.rate && c.rate !== 1 ? ` · ${c.rate}×` : ''}</span>
                      {w > 30 && <i className="vol-line" style={{ top: Math.max(2, Math.min(h - 2, (1 - c.volume / 2) * h)) }} onPointerDown={(e) => dragVolume(c.id, e, h)} />}
                      {w > 40 && <i className="fade-h in" style={{ left: Math.min(c.duration, c.fadeIn) * zoom }} onPointerDown={(e) => dragFade(c.id, 'fadeIn', e)} title="Drag: fade in" />}
                      {w > 40 && <i className="fade-h out" style={{ right: Math.min(c.duration, c.fadeOut) * zoom }} onPointerDown={(e) => dragFade(c.id, 'fadeOut', e)} title="Drag: fade out" />}
                      <div className="resize left" onPointerDown={(e) => moveItem('audio', c.id, e, 'trimStart')} />
                      <div className="resize" onPointerDown={(e) => moveItem('audio', c.id, e, 'resize')} />
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="track t-fx">
              {p.effects.map((fx, k) => fx.scope?.kind === 'range' ? (
                <div key={`fx-${fx.kind}`} className="item fxbar" style={{ left: fx.scope.start * zoom, width: Math.max(6, (fx.scope.end - fx.scope.start) * zoom) }} title={`${fx.kind} ${fx.scope.start.toFixed(1)}–${fx.scope.end.toFixed(1)} s`}
                  onPointerDown={(e) => {
                    const sc = fx.scope as { kind: 'range'; start: number; end: number };
                    const s0 = sc.start, e0 = sc.end;
                    startDrag(e, zoom, (dt) => update((d) => {
                      const sh = Math.max(-s0, dt);
                      d.effects[k].scope = { kind: 'range', start: s0 + sh, end: e0 + sh };
                    }, `fxbar${k}`));
                  }}>
                  ✨ {fx.kind}
                </div>
              ) : null)}
            </div>
            <Playhead zoom={zoom} scroller={scroller} />
          </div>
        </div>
      </div>
    </div>
  );
}

const ROWS = {
  compact: { ruler: 22, text: 24, typo: 26, video: 58, caps: 22, audio: 40, fx: 24 },
  comfortable: { ruler: 26, text: 30, typo: 32, video: 78, caps: 26, audio: 54, fx: 28 },
  large: { ruler: 30, text: 38, typo: 40, video: 104, caps: 32, audio: 72, fx: 34 },
};

/** Fade drawn as a ramp: the silent part is the triangle above a line rising (in) or falling (out) left to right. */
function FadeRamp({ dir, w }: { dir: 'in' | 'out'; w: number }) {
  return (
    <svg className={`fade-svg ${dir}`} style={{ width: w }} viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points={dir === 'in' ? '0,0 100,0 0,100' : '0,0 100,0 100,100'} />
      <line x1={0} y1={dir === 'in' ? 100 : 0} x2={100} y2={dir === 'in' ? 0 : 100} />
    </svg>
  );
}

