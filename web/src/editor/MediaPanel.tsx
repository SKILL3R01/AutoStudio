import { useState } from 'react';
import { useEditor, clipEnd } from '../store';
import { useProject, useThumb } from './hooks';
import { Section, Seg } from '../components/ui';
import { Icon } from '../components/icons';
import { ImportDialog } from './ImportScreen';
import { defaultClip } from '../lib/project';
import { clipIndexAt } from '../render/renderer';
import type { Asset } from '../types';

function MediaItem({ a, uses, onInsert, onReplace, canReplace }: { a: Asset; uses: number; onInsert: () => void; onReplace: () => void; canReplace: boolean }) {
  const thumb = useThumb(a.id, a.kind);
  return (
    <div className="media-item" title={a.name}>
      <div className="mthumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={a.kind === 'video' ? 'film' : 'image'} />}
        {a.kind === 'video' && <span className="badge">{(a.duration ?? 0).toFixed(1)}s</span>}
        {uses > 0 && <span className="badge used">×{uses}</span>}
        <div className="mactions">
          <button className="icon-btn" title="Insert at playhead" onClick={onInsert}><Icon name="plus" /></button>
          {canReplace && <button className="icon-btn" title="Use for selected clip" onClick={onReplace}><Icon name="link" /></button>}
        </div>
      </div>
      <span className="mname">{a.name}</span>
    </div>
  );
}

export function MediaPanel() {
  const p = useProject();
  const { update, selection, time } = useEditor();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unused'>('all');
  const uses = new Map<string, number>();
  p.clips.forEach((c) => uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1));
  const visuals = p.assets.filter((a) => (a.kind === 'image' || a.kind === 'video') && !a.name.startsWith('__') && (filter === 'all' || !uses.get(a.id)));
  const insert = (a: Asset) => update((d) => {
    const i = clipIndexAt(d.clips, time);
    const end = d.clips.length ? clipEnd(d, i) : 0;
    const at = d.clips.length && time - (i === 0 ? 0 : d.clips[i].start) < 0.2 ? Math.min(end - 0.2, time + 0.2) : time;
    d.clips.push(defaultClip(a.id, d.clips.length ? at : 0));
    d.clips.sort((x, y) => x.start - y.start);
  });
  const replace = (a: Asset) => selection?.kind === 'clip' && update((d) => {
    const c = d.clips.find((x) => x.id === selection.id);
    if (c) Object.assign(c, { assetId: a.id, trimIn: 0, trimOut: undefined, depthId: undefined, regions: [] });
  });
  return (
    <Section title={`Media (${visuals.length})`}>
      <button className="btn primary" onClick={() => setOpen(true)}><Icon name="upload" /> Import media…</button>
      <Seg options={[['all', 'All'], ['unused', 'Unused']] as const} value={filter} onChange={setFilter} />
      <div className="media-grid">
        {visuals.map((a) => <MediaItem key={a.id} a={a} uses={uses.get(a.id) ?? 0} onInsert={() => insert(a)} onReplace={() => replace(a)} canReplace={selection?.kind === 'clip'} />)}
      </div>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </Section>
  );
}
