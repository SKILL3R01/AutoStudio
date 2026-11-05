import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, clipEnd, projectLength } from '../store';
import { useLines, useProject, useThumb } from './hooks';
import { media, peaks } from '../render/media';
import { fmtTime } from '../lib/util';
import { TRANSITIONS, type Clip, type Transition } from '../types';
import { deleteAction } from './shortcuts';
import { copySelection, detachSelectedAudio, duplicate, hasClipboard, paste, rippleDelete, splitAtPlayhead, splitVoiceAtPlayhead } from './actions';
import { snapPoints, snapTime, voiceSegments } from './edit';
import { Icon } from '../components/icons';
import { Slider } from '../components/ui';
import { TRANSITION_LABELS } from './Panels';
import { stampFor } from '../lib/timecode';
import { blankClip, setVoiceStart } from '../lib/project';
import { voiceEnd } from '../store';

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

const stamp = stampFor;

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
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints(p0, st.time, clip.id) : [];
    startDrag(e, zoom, (dt) => update((p) => void (p.clips[i].start = Math.min(hi, Math.max(lo, pts.length ? snapTime(t0 + dt, pts, zoom) : t0 + dt))), `edge-${clip.id}`));
  };
  return (
    <div
      className={`clip ${selected ? 'sel' : ''} ${kind === 'video' ? 'video' : ''} ${clip.fill ? 'blank' : ''}`}
      style={{ left: start * zoom, width: w, backgroundImage: thumb && w > 18 ? `url(${thumb})` : undefined, backgroundColor: clip.fill }}
      title={`${clip.fill ? 'Blank section' : name} · ${fmtTime(start)} → ${fmtTime(end)}`}
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
  const voiceDur = (p.voiceover && assets.get(p.voiceover.assetId)?.duration) || 0;
  const segs = p.voiceover ? voiceSegments(p, voiceDur) : [];
  const snapOn = useEditor((s) => s.snap);
  const setSnap = useEditor((s) => s.setSnap);
  /** Move an item, drag its right edge (`resize`) or its left edge (`trimStart`, music / text only). Edges snap. */
  const moveItem = (key: 'music' | 'sfx' | 'overlays' | 'typo', id: string, e: React.PointerEvent, mode: 'move' | 'resize' | 'trimStart' = 'move') => {
    const item = (p[key] as { id: string; start: number; duration?: number; end?: number; trimIn?: number; rate?: number }[]).find((x) => x.id === id)!;
    const s0 = item.start, d0 = item.duration ?? 0, e0 = item.end ?? 0, tin0 = item.trimIn ?? 0, rate = item.rate ?? 1;
    const len0 = item.end !== undefined ? e0 - s0 : d0;
    const words0 = key === 'typo' ? p.typo.find((b) => b.id === id)!.words.map((w) => [w.start, w.end]) : [];
    const kind = key === 'overlays' ? 'overlay' : key === 'typo' ? 'keyword' : key;
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints(p, st.time, id) : [];
    const snap = (t: number) => (pts.length ? snapTime(t, pts, zoom) : t);
    startDrag(e, zoom, (dt) => update((d) => {
      const it = (d[key] as { id: string; start: number; duration?: number; end?: number; trimIn?: number; words?: { start: number; end: number }[] }[]).find((x) => x.id === id)!;
      if (mode === 'move') {
        // Snap whichever edge lands nearer a snap point.
        const raw = s0 + dt;
        const a = snap(raw), b = snap(raw + len0) - len0;
        const want = a !== raw && (b === raw || Math.abs(a - raw) <= Math.abs(b - raw)) ? a : b;
        const shift = Math.max(-s0, want - s0);
        it.start = s0 + shift;
        if (it.end !== undefined) it.end = e0 + shift;
        it.words?.forEach((w, k) => ((w.start = words0[k][0] + shift), (w.end = words0[k][1] + shift)));
      } else if (mode === 'trimStart') {
        const lo = key === 'music' ? s0 - tin0 / rate : 0;
        const ns = Math.min(s0 + d0 - 0.2, Math.max(lo, snap(s0 + dt)));
        it.start = ns;
        it.duration = d0 - (ns - s0);
        if (key === 'music') it.trimIn = Math.max(0, tin0 + (ns - s0) * rate);
      } else if (it.end !== undefined) it.end = Math.max(it.start + 0.2, snap(e0 + dt));
      else it.duration = Math.max(0.2, snap(s0 + d0 + dt) - s0);
    }, `${mode}-${id}`), () => (useEditor.getState().select({ kind, id }), useEditor.getState().seek(s0 + 0.05)));
  };
  // Drag the narration later/earlier (intro before the voice); captions and SFX move with it.
  const dragVoice = (e: React.PointerEvent) => {
    const v0 = p.voiceStart;
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints({ ...p, voiceover: undefined }, st.time) : [];
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    startDrag(e, zoom, (dt) => update((d) => setVoiceStart(d, pts.length ? Math.max(0, snapTime(v0 + dt, pts, zoom)) : Math.round((v0 + dt) * 20) / 20), 'voiceStart'), () => {
      // Click = select the narration segment under the pointer.
      const local = x / zoom;
      const k = voiceSegments(p, voiceDur).findIndex((sg) => local >= sg.start && local < sg.end);
      st.select({ kind: 'voice', id: String(Math.max(0, k)) });
      st.seek(p.voiceStart + local);
    });
  };
  // Drag the end of the video: past the narration this becomes the outro.
  const dragEnd = (e: React.PointerEvent) => {
    const l0 = length;
    const st = useEditor.getState();
    const pts = st.snap ? snapPoints(p, st.time).filter((q) => Math.abs(q - l0) > 1e-6) : [];
    startDrag(e, zoom, (dt) => update((d) => {
      const want = Math.max(0.5, pts.length ? snapTime(l0 + dt, pts, zoom) : l0 + dt);
      const ve = voiceEnd(d);
      if (ve) d.tail = Math.max(0, Math.round((want - ve) * 10) / 10);
      else d.length = Math.round(want * 10) / 10;
    }, 'end'));
  };
  const insertBlank = () => update((d) => {
    const t = useEditor.getState().time;
    d.clips.push(blankClip(d.clips.length ? t : 0));
    d.clips.sort((a, b) => a.start - b.start);
  });
  const ve = voiceEnd(p);
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
  const selCount = (sel ? 1 : 0) + multi.length;

  return (
    <div className="timeline" style={{ height: shownHeight }}>
      <div className="tl-resize" onPointerDown={resize} title="Drag to resize" />
      <div className="tl-tools">
        <button className="icon-btn" onClick={splitAtPlayhead} title="Split at playhead (S): the selected music, text or narration, otherwise the clip"><Icon name="scissors" /></button>
        <button className="icon-btn" disabled={!selCount} onClick={deleteAction} title="Delete (Del)"><Icon name="trash" /></button>
        <button className="icon-btn" disabled={!(sel?.kind === 'clip' || sel?.kind === 'voice' || multi.length)} onClick={() => void rippleDelete()} title="Ripple delete (Shift+Del): remove and close the gap"><Icon name="ripple" /></button>
        <span className="tl-sep" />
        <button className="icon-btn" disabled={!selCount || sel?.kind === 'voice'} onClick={() => void copySelection()} title="Copy (Ctrl+C)"><Icon name="copy" /></button>
        <button className="icon-btn" disabled={!hasClipboard()} onClick={() => paste()} title="Paste at playhead (Ctrl+V)"><Icon name="paste" /></button>
        <button className="icon-btn" disabled={!selCount || sel?.kind === 'voice'} onClick={duplicate} title="Duplicate (Ctrl+D)"><Icon name="layers" /></button>
        <button className="icon-btn" disabled={sel?.kind !== 'clip' || assets.get(p.clips.find((c) => c.id === sel.id)?.assetId ?? '')?.kind !== 'video'} onClick={detachSelectedAudio} title="Detach audio: move a video clip's sound to the music lane"><Icon name="unlink" /></button>
        {p.voiceover && <button className="btn ghost sm" onClick={splitVoiceAtPlayhead} title="Split the narration at the playhead, then click a part to select and delete it"><Icon name="mic" size={13} /> Split voice</button>}
        <span className="tl-sep" />
        <button className={`icon-btn ${snapOn ? 'on' : ''}`} onClick={() => setSnap(!snapOn)} title={`Snapping ${snapOn ? 'on' : 'off'} (N)`}><Icon name="magnet" /></button>
        <button className="btn ghost sm" onClick={insertBlank} title="Insert a blank (black) section at the playhead"><Icon name="plus" /> Blank</button>
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
            <div className="end-handle" style={{ left: length * zoom }} onPointerDown={dragEnd} title={`End of video ${fmtTime(length)} — drag to extend or shorten`}>
              <span>◀▶</span>
            </div>
            {ve > 0 && length > ve + 0.05 && <div className="outro-zone" style={{ left: ve * zoom, width: (length - ve) * zoom }} title="Outro (after the narration)" />}
            {p.voiceStart > 0 && <div className="outro-zone intro" style={{ left: 0, width: p.voiceStart * zoom }} title="Intro (before the narration)" />}
            <div className="track t-text">
              {p.overlays.filter((o) => inView(o.start, o.start + o.duration)).map((o) => (
                <div key={o.id} className={`item overlay ${sel?.id === o.id ? 'sel' : ''}`} style={{ left: o.start * zoom, width: Math.max(8, o.duration * zoom) }} onPointerDown={(e) => moveItem('overlays', o.id, e)}>
                  <div className="resize left" onPointerDown={(e) => moveItem('overlays', o.id, e, 'trimStart')} />
                  {o.assetId ? '🖼' : 'T'} {o.text}
                  <div className="resize" onPointerDown={(e) => moveItem('overlays', o.id, e, 'resize')} />
                </div>
              ))}
            </div>
            <div className="track t-kw">
              {p.captions.typography !== false && p.typo.filter((k) => inView(k.start, k.end)).map((k) => (
                <div key={k.id} className={`item kw ${sel?.id === k.id ? 'sel' : ''}`} style={{ left: k.start * zoom, width: Math.max(10, (k.end - k.start) * zoom) }} onPointerDown={(e) => moveItem('typo', k.id, e)}>
                  {k.words.map((w) => w.text).join(' ')}
                  <div className="resize" onPointerDown={(e) => moveItem('typo', k.id, e, 'resize')} />
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
              {p.clips.map((c, i) => (i > 0 && inView(c.start - 1, c.start + 1) ? (
                <TransitionMarker key={`tr-${c.id}`} clip={c} i={i} zoom={zoom} duration={p.transitionDuration} open={trOpen === i} onOpen={setTrOpen} />
              ) : null))}
            </div>
            <div className="track t-caps">
              {p.captions.enabled && lines.filter((l) => inView(l.start, l.end)).map((l, k) => (
                <div key={`${l.start}-${k}`} className="item cap" style={{ left: l.start * zoom, width: Math.max(2, (l.end - l.start) * zoom) }} onPointerDown={() => useEditor.getState().seek(l.start + 0.001)}>
                  {(l.end - l.start) * zoom > 30 && l.words.map((w) => w.text).join(' ')}
                </div>
              ))}
            </div>
            <div className="track t-audio">
              {p.voiceover && (
                <div className="voice-clip" style={{ left: p.voiceStart * zoom }} onPointerDown={dragVoice} title="Narration — drag to start it later (intro)">
                  <Waveform assetId={p.voiceover.assetId} length={assets.get(p.voiceover.assetId)?.duration ?? length} zoom={zoom} />
                  {segs.map((sg, k) => (
                    <div key={k} className={`voice-seg ${sel?.kind === 'voice' && sel.id === String(k) ? 'sel' : ''}`} style={{ left: sg.start * zoom, width: (sg.end - sg.start) * zoom }} />
                  ))}
                </div>
              )}
            </div>
            <div className="track t-music">
              {p.music.map((m) => (
                <div key={m.id} className={`item music ${sel?.id === m.id ? 'sel' : ''}`} style={{ left: m.start * zoom, width: Math.max(8, m.duration * zoom) }} onPointerDown={(e) => moveItem('music', m.id, e)}>
                  <div className="resize left" onPointerDown={(e) => moveItem('music', m.id, e, 'trimStart')} />
                  ♫ {assets.get(m.assetId)?.name}{m.rate && m.rate !== 1 ? ` · ${m.rate}×` : ''}
                  <div className="resize" onPointerDown={(e) => moveItem('music', m.id, e, 'resize')} />
                </div>
              ))}
            </div>
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
