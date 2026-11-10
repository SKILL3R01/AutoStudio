import { useState } from 'react';
import { useEditor, projectLength } from '../store';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { useThumb } from './hooks';
import { applyFix, fixPlan, fmtClock, type FixAction, type FixItem } from '../lib/timeline';
import { rippleDeleteClips } from './edit';
import type { Clip } from '../types';

const LABELS: Record<FixAction, string> = {
  mergePrev: 'Merge into previous', mergeNext: 'Merge into next', extend: 'Extend to 1 s', delete: 'Delete & close gap', split: 'Split every 10 s', ignore: 'Keep as is',
};

function Thumb({ clip }: { clip: Clip }) {
  const a = useEditor((s) => s.project!.assets.find((x) => x.id === clip.assetId));
  const t = useThumb(a?.id, a?.kind === 'video' ? 'video' : 'image');
  return <span className="fix-thumb" style={{ backgroundImage: t ? `url(${t})` : undefined, backgroundColor: clip.fill }} />;
}

/** List clips under 1 s / over 20 s with a suggested fix each; Apply is one undo step. */
export function FixClipsDialog({ onClose }: { onClose: () => void }) {
  const p = useEditor((s) => s.project!);
  const len = projectLength(p);
  const [items, setItems] = useState<FixItem[]>(() => fixPlan(p, len));
  const apply = () => {
    useEditor.getState().update((d) => applyFix(d, items, projectLength(d), (ids) => rippleDeleteClips(d, ids)));
    toast(`Fixed ${items.filter((i) => i.action !== 'ignore').length} clip(s) — Undo brings them back`, 'ok');
    onClose();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Fix clip lengths</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Clips shorter than 1 s flash by; clips longer than 20 s can feel static. Each has a suggested fix — change it if you like, then Apply.</p>
        <div className="fix-list">
          {items.map((it, k) => {
            const i = p.clips.findIndex((c) => c.id === it.id);
            const c = p.clips[i];
            if (!c) return null;
            const actions: FixAction[] = it.kind === 'short' ? ['mergePrev', 'mergeNext', 'extend', 'delete', 'ignore'] : ['split', 'ignore'];
            return (
              <div key={it.id} className="fix-row">
                <Thumb clip={c} />
                <span><b>Clip {i + 1}</b> <span className="hint">{fmtClock(i === 0 ? 0 : c.start)} · {it.duration.toFixed(2)} s {it.kind === 'short' ? '(short)' : '(long)'}</span></span>
                <select value={it.action} onChange={(e) => setItems((l) => l.map((x, j) => (j === k ? { ...x, action: e.target.value as FixAction } : x)))}>
                  {actions.map((a) => <option key={a} value={a} disabled={(a === 'mergePrev' && i === 0) || (a === 'mergeNext' && i === p.clips.length - 1)}>{LABELS[a]}</option>)}
                </select>
                <button className="icon-btn" title="Show on the timeline" onClick={() => (useEditor.getState().select({ kind: 'clip', id: c.id }), useEditor.getState().seek(i === 0 ? 0 : c.start))}><Icon name="play" /></button>
              </div>
            );
          })}
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={() => setItems((l) => l.map((x) => ({ ...x, action: 'ignore' })))}>Keep all as is</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!items.length} onClick={apply}><Icon name="check" /> Apply</button>
        </div>
      </div>
    </div>
  );
}
