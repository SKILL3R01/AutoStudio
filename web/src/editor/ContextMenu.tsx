import { useEffect } from 'react';
import { create } from 'zustand';
import { useEditor, projectLength, type Selection } from '../store';
import { Icon } from '../components/icons';
import { copySelection, detachSelectedAudio, duplicate, hasClipboard, paste, rippleDelete, splitAtPlayhead } from './actions';
import { fmtClock, parseClock, setClipStart } from '../lib/timeline';
import { moveAudioClip } from '../lib/audiotracks';
import { MOTION_LABELS } from './Panels';
import { deleteSelection, selectAll } from './shortcuts';
import type { Motion } from '../types';

type Target = NonNullable<Selection>;
export const useMenu = create<{ at: { x: number; y: number; target: Target; time: number } | null; open: (e: React.MouseEvent, target: Target, time: number) => void; close: () => void }>((set) => ({
  at: null,
  open: (e, target, time) => {
    e.preventDefault();
    e.stopPropagation();
    useEditor.getState().select(target);
    set({ at: { x: e.clientX, y: e.clientY, target, time } });
  },
  close: () => set({ at: null }),
}));

const QUICK_MOTIONS: Motion[] = ['none', 'zoomIn', 'zoomOut', 'panLeft', 'panRight', 'drift', 'parallaxZoom'];

/** Right-click quick edit menu for timeline items. */
export function ContextMenu() {
  const { at, close } = useMenu();
  const update = useEditor((s) => s.update);
  useEffect(() => {
    if (!at) return;
    const h = (e: Event) => (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' && close() : close());
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', h);
    window.addEventListener('blur', h);
    return () => (window.removeEventListener('pointerdown', h), window.removeEventListener('keydown', h), window.removeEventListener('blur', h));
  }, [at]);
  if (!at) return null;
  const p = useEditor.getState().project!;
  const len = projectLength(p);
  const { target } = at;
  const ci = target.kind === 'clip' ? p.clips.findIndex((c) => c.id === target.id) : -1;
  const clip = ci >= 0 ? p.clips[ci] : undefined;
  const music = target.kind === 'audio' ? p.audio.find((m) => m.id === target.id) : undefined;
  const isVideo = clip && p.assets.find((a) => a.id === clip.assetId)?.kind === 'video';
  const run = (fn: () => unknown) => () => (close(), void fn());
  const item = (label: string, icon: string, fn: () => unknown, disabled = false) => (
    <button key={label} disabled={disabled} onPointerDown={(e) => e.stopPropagation()} onClick={run(fn)}><Icon name={icon} size={13} /> {label}</button>
  );
  const setStart = () => {
    const cur = clip ? (ci === 0 ? 0 : clip.start) : music?.start ?? 0;
    const v = parseClock(prompt('Start time (m:ss.mmm)', fmtClock(cur)) ?? '');
    if (v === null) return;
    update((d) => {
      if (clip) setClipStart(d, ci, v, len);
      if (music) moveAudioClip(d, music.id, v);
    });
  };
  const setLength = () => {
    if (!clip) return;
    const end = ci + 1 < p.clips.length ? p.clips[ci + 1].start : len;
    const v = parseClock(prompt('Length in seconds', (end - (ci === 0 ? 0 : clip.start)).toFixed(2)) ?? '');
    if (v === null || ci + 1 >= p.clips.length) return;
    update((d) => setClipStart(d, ci + 1, (ci === 0 ? 0 : clip.start) + v, len));
  };
  const fade = (which: 'fadeIn' | 'fadeOut') => {
    const v = parseClock(prompt(`${which === 'fadeIn' ? 'Fade in' : 'Fade out'} (seconds)`, String(music?.[which] ?? 1)) ?? '');
    if (v !== null) update((d) => void (d.audio.find((x) => x.id === target.id)![which] = Math.max(0, v)));
  };
  const y = Math.min(at.y, window.innerHeight - 360), x = Math.min(at.x, window.innerWidth - 230);
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {item(`Split here (${fmtClock(at.time)})`, 'scissors', () => splitAtPlayhead(at.time))}
      {item('Select all (Ctrl+A)', 'layers', selectAll)}
      {item('Duplicate', 'copy', duplicate)}
      {item('Copy', 'copy', copySelection)}
      {item('Paste here', 'paste', () => paste(at.time), !hasClipboard())}
      {(clip || music) && item('Set start time…', 'clock', setStart)}
      {clip && item('Set length…', 'clock', setLength, ci + 1 >= p.clips.length)}
      {music && item('Fade in…', 'music', () => fade('fadeIn'))}
      {music && item('Fade out…', 'music', () => fade('fadeOut'))}
      {isVideo && item('Detach audio', 'unlink', detachSelectedAudio)}
      {clip && !clip.fill && (
        <div className="ctx-sub">
          <span className="hint">Motion</span>
          <div className="row wrap">{QUICK_MOTIONS.map((m) => <button key={m} className={`chip ${clip.motion === m ? 'on' : ''}`} onPointerDown={(e) => e.stopPropagation()} onClick={run(() => update((d) => void (d.clips[ci].motion = m)))}>{MOTION_LABELS[m]}</button>)}</div>
        </div>
      )}
      {clip?.depthId && item('Remove 3D depth', 'x', () => update((d) => void ((d.clips[ci].depthId = undefined), ['parallaxZoom', 'parallaxOrbit', 'dollyZoom'].includes(d.clips[ci].motion) && (d.clips[ci].motion = 'zoomIn'))))}
      {clip && item(clip.ignoreDuration ? 'Warn about length again' : 'Ignore length warning', 'warn', () => update((d) => void (d.clips[ci].ignoreDuration = !clip.ignoreDuration)))}
      <hr />
      {item('Delete', 'trash', deleteSelection)}
      {clip && item('Ripple delete', 'trash', rippleDelete)}
    </div>
  );
}
