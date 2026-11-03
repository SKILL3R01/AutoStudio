import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';

const read = (key: string, fallback: number) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** A persisted panel width with collapse state; resets on the global `layout-reset` event. */
export function usePanelSize(key: string, fallback: number, min: number, max: number) {
  const [size, setSize] = useState(() => Math.min(max, Math.max(min, read(key, fallback))));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(`${key}Collapsed`) === '1');
  useEffect(() => {
    const reset = () => (setSize(fallback), setCollapsed(false));
    window.addEventListener('layout-reset', reset);
    return () => window.removeEventListener('layout-reset', reset);
  }, [fallback]);
  return {
    size,
    collapsed,
    set: (v: number) => {
      const s = Math.min(max, Math.max(min, Math.round(v)));
      setSize(s);
      localStorage.setItem(key, String(s));
    },
    toggle: () => setCollapsed((c) => (localStorage.setItem(`${key}Collapsed`, c ? '0' : '1'), !c)),
  };
}

/** Vertical drag handle between two columns. `dir` = +1 when dragging right grows the panel, -1 otherwise. */
export function Splitter({ panel, dir, label }: { panel: ReturnType<typeof usePanelSize>; dir: 1 | -1; label: string }) {
  const start = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const x0 = e.clientX, s0 = panel.size;
    if (panel.collapsed) panel.toggle();
    const move = (ev: PointerEvent) => panel.set(s0 + (ev.clientX - x0) * dir);
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up), document.body.classList.remove('resizing'));
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pointsLeft = (dir === 1) !== panel.collapsed;
  return (
    <div className="splitter" onPointerDown={start} onDoubleClick={panel.toggle} title={`Drag to resize the ${label} · double-click to ${panel.collapsed ? 'show' : 'hide'}`}>
      <button className="splitter-btn" onClick={panel.toggle} title={panel.collapsed ? `Show ${label}` : `Hide ${label}`}>
        <Icon name="back" size={12} className={pointsLeft ? '' : 'flip'} />
      </button>
    </div>
  );
}
