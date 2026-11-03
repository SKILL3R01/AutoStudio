import { useEffect } from 'react';
import { useEditor, projectLength } from '../store';
import { Icon } from '../components/icons';
import { copySelection, duplicate, paste, rippleDelete, splitAtPlayhead } from './actions';

export function deleteSelection() {
  const { selection, update, select, multi } = useEditor.getState();
  if (!selection && !multi.length) return;
  update((p) => {
    if (selection?.kind === 'clip' || multi.length) {
      const ids = new Set([...(selection?.kind === 'clip' ? [selection.id] : []), ...multi]);
      const firstStart = p.clips[0]?.start ?? 0;
      p.clips = p.clips.filter((c) => !ids.has(c.id));
      if (p.clips[0]) p.clips[0].start = Math.min(p.clips[0].start, firstStart);
    }
    if (selection?.kind === 'overlay') p.overlays = p.overlays.filter((o) => o.id !== selection.id);
    if (selection?.kind === 'music') p.music = p.music.filter((o) => o.id !== selection.id);
    if (selection?.kind === 'sfx') p.sfx = p.sfx.filter((o) => o.id !== selection.id);
    if (selection?.kind === 'keyword') p.typo = p.typo.filter((o) => o.id !== selection.id);
  });
  select(null);
}

/** Delete: narration segments can only be cut (ripple), everything else is removed in place. */
export function deleteAction() {
  if (useEditor.getState().selection?.kind === 'voice') return void rippleDelete();
  deleteSelection();
}

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'], ['← / →', 'Step 0.5 s (Shift = 5 s, Ctrl = 1 frame)'], ['Home / End', 'Jump to start / end'],
  ['S', 'Split at playhead (selected music / text / narration, else the clip)'], ['Delete', 'Remove selection'], ['Shift+Delete', 'Ripple delete (close the gap)'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste at playhead'], ['Ctrl+D', 'Duplicate'], ['N', 'Snapping on / off'], ['Shift-click', 'Select several clips'], ['Esc', 'Clear selection'],
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
