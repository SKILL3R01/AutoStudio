import { useEffect } from 'react';
import { useEditor, projectLength } from '../store';
import { Icon } from '../components/icons';
import { copySelection, duplicate, paste, rippleDelete, splitAtPlayhead } from './actions';

export function deleteSelection() {
  const { selection, update, select, multi } = useEditor.getState();
  if (!selection && !multi.length) return;
  const ids = new Set([...(selection ? [selection.id] : []), ...multi]);
  update((p) => {
    const firstStart = p.clips[0]?.start ?? 0;
    p.clips = p.clips.filter((c) => !ids.has(c.id));
    if (p.clips[0]) p.clips[0].start = Math.min(p.clips[0].start, firstStart);
    if (!p.clips.length) p.length = 0;
    p.overlays = p.overlays.filter((o) => !ids.has(o.id));
    p.audio = p.audio.filter((o) => !ids.has(o.id));
    p.typo = p.typo.filter((o) => !ids.has(o.id));
    p.pips = p.pips.filter((o) => !ids.has(o.id));
  });
  select(null);
}

/** Ctrl+A: select every clip, text, typography block and audio clip. */
export function selectAll() {
  const { project: p } = useEditor.getState();
  if (!p) return;
  useEditor.setState({ selection: null, multi: [...p.clips, ...p.overlays, ...p.typo, ...p.audio, ...p.pips].map((x) => x.id) });
}

/** Ctrl+X: copy, then delete. */
export function cutSelection() {
  if (copySelection()) deleteSelection();
}

/** Delete: narration segments can only be cut (ripple), everything else is removed in place. */
export function deleteAction() {
  deleteSelection();
}

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'], ['← / →', 'Step 0.5 s (Shift = 5 s, Ctrl = 1 frame)'], ['Home / End', 'Jump to start / end'],
  ['S', 'Split at playhead (selected audio / text, else the clip) — right-click → Split here'], ['Delete', 'Remove selection'], ['Shift+Delete', 'Ripple delete (close the gap)'],
  ['Ctrl+A', 'Select everything'], ['Ctrl+X / Ctrl+C / Ctrl+V', 'Cut / copy / paste at playhead'], ['Ctrl+D', 'Duplicate'], ['N', 'Snapping on / off'], ['Shift / Ctrl-click', 'Select several items (any track)'], ['Esc', 'Clear selection'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+wheel', 'Zoom timeline'], ['Double-click preview', 'Play / pause'], ['?', 'This list'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Keyboard shortcuts</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <dl className="specs keys">
          {SHORTCUTS.map(([k, v]) => [<dt key={k}><kbd>{k}</kbd></dt>, <dd key={v}>{v}</dd>])}
        </dl>
      </div>
    </div>
  );
}

export function useShortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useEditor.getState();
      if (!s.project) return;
      const mod = e.ctrlKey || e.metaKey;
      const len = projectLength(s.project);
      if (e.code === 'Space') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutSelection();
      } else if (mod && e.key.toLowerCase() === 'c') {
        if (copySelection()) e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        paste();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) {
        void rippleDelete();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteAction();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = e.shiftKey ? 5 : mod ? 1 / s.project.export.fps : 0.5;
        s.seek(Math.min(len, Math.max(0, s.time + (e.key === 'ArrowLeft' ? -step : step))));
      } else if (e.key === 'Home') s.seek(0);
      else if (e.key === 'End') s.seek(len);
      else if (e.key.toLowerCase() === 's' && !mod) splitAtPlayhead();
      else if (e.key.toLowerCase() === 'n' && !mod) s.setSnap(!s.snap);
      else if (e.key === 'Escape') s.select(null);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}
