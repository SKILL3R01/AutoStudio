import { useState } from 'react';
import { useEditor, clipEnd } from '../store';
import { useProject, useThumb } from './hooks';
import { Section, Seg } from '../components/ui';
import { Icon } from '../components/icons';
import { ImportDialog } from './ImportScreen';
import { defaultClip } from '../lib/project';
import { clipIndexAt } from '../render/renderer';
import type { Asset, Project } from '../types';
import { indexMedia, matchPercent, queryVector, rank, unindexed } from '../lib/mediasearch';
import { useVision } from '../ai/vision';
import { confirmHeavyAi } from '../lib/perf';
import { toast } from '../components/Toast';

function MediaItem({ a, uses, onInsert, onReplace, canReplace, match }: { a: Asset; uses: number; onInsert: () => void; onReplace: () => void; canReplace: boolean; match?: number }) {
  const thumb = useThumb(a.id, a.kind);
  return (
    <div className="media-item" title={a.name}>
      <div className="mthumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={a.kind === 'video' ? 'film' : 'image'} />}
        {a.kind === 'video' && <span className="badge">{(a.duration ?? 0).toFixed(1)}s</span>}
        {uses > 0 && <span className="badge used">×{uses}</span>}
        {match !== undefined && <span className={`badge match ${match >= 60 ? 'hi' : ''}`} title="How well it matches your description">{match}%</span>}
        <div className="mactions">
          <button className="icon-btn" title="Insert at playhead" onClick={onInsert}><Icon name="plus" /></button>
          {canReplace && <button className="icon-btn" title="Use for selected clip" onClick={onReplace}><Icon name="link" /></button>}
        </div>
      </div>
      <span className="mname">{a.name}</span>
    </div>
  );
}

/** Add a clip using `assetId` at timeline time t (splits nothing — the new clip starts at t). */
export function insertAssetAt(d: Project, assetId: string, time: number) {
  const i = clipIndexAt(d.clips, time);
  const end = d.clips.length ? clipEnd(d, i) : 0;
  const at = d.clips.length && time - (i === 0 ? 0 : d.clips[i].start) < 0.2 ? Math.min(end - 0.2, time + 0.2) : time;
  d.clips.push(defaultClip(assetId, d.clips.length ? at : 0));
  d.clips.sort((x, y) => x.start - y.start);
}

/** Swap the media of a clip (keeps its timing, motion and transition). */
export function replaceClipAsset(d: Project, clipId: string, assetId: string) {
  const c = d.clips.find((x) => x.id === clipId);
  if (c) Object.assign(c, { assetId, trimIn: 0, trimOut: undefined, depthId: undefined, regions: [] });
}

export function MediaPanel() {
  const p = useProject();
  const { update, selection, time } = useEditor();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unused'>('all');
  const [query, setQuery] = useState('');
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState('');
  const vision = useVision();
  const uses = new Map<string, number>();
  p.clips.forEach((c) => uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1));
  let visuals = p.assets.filter((a) => (a.kind === 'image' || a.kind === 'video') && !a.name.startsWith('__') && (filter === 'all' || !uses.get(a.id)));
  if (scores) visuals = visuals.filter((a) => scores.has(a.id)).sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
  const insert = (a: Asset) => update((d) => insertAssetAt(d, a.id, time));
  const replace = (a: Asset) => selection?.kind === 'clip' && update((d) => replaceClipAsset(d, selection.id, a.id));

  /** Index new media (first use downloads the model), then rank by the description. */
  const search = async () => {
    if (!query.trim()) return setScores(null);
    const todo = unindexed(p);
    if (todo.length && !confirmHeavyAi()) return;
    try {
      if (todo.length) {
        setBusy(`Indexing 0 / ${todo.length}…`);
        const vecs = await indexMedia(todo, (n, total) => setBusy(`Indexing ${n} / ${total}…`));
        update((d) => void (d.embeddings = { ...(d.embeddings ?? {}), ...vecs }));
      }
      setBusy('Searching…');
      const q = await queryVector(query);
      const proj = useEditor.getState().project!;
      setScores(new Map(rank(proj, q).map((r) => [r.asset.id, matchPercent(r.score)])));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <Section title={`Media (${visuals.length})`}>
      <button className="btn primary" onClick={() => setOpen(true)}><Icon name="upload" /> Import media…</button>
      <div className="row">
        <input value={query} placeholder="Find by describing it — e.g. “man walking at sunset”" onChange={(e) => (setQuery(e.target.value), !e.target.value && setScores(null))} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="icon-btn" disabled={!!busy} onClick={search} title="Search your media by description (runs on this PC)"><Icon name="cursor" /></button>
      </div>
      {(busy || vision.label) && <p className="hint">{vision.label ? `${vision.label} ${Math.round(vision.value * 100)}% (first time only, ~150 MB)` : busy}</p>}
      {scores && <p className="hint">Best matches first · <button className="link" onClick={() => (setScores(null), setQuery(''))}>clear</button>. Descriptions work best in English.</p>}
      <Seg options={[['all', 'All'], ['unused', 'Unused']] as const} value={filter} onChange={setFilter} />
      <div className="media-grid">
        {visuals.map((a) => <MediaItem key={a.id} a={a} uses={uses.get(a.id) ?? 0} match={scores?.get(a.id)} onInsert={() => insert(a)} onReplace={() => replace(a)} canReplace={selection?.kind === 'clip'} />)}
      </div>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </Section>
  );
}
