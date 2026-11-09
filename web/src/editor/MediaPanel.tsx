import { narrationEnd } from '../lib/audiotracks';
import { keywordsFrom, siteLinks } from '../lib/stocklinks';
import { useState } from 'react';
import { useEditor, clipEnd } from '../store';
import { media } from '../render/media';
import { fmtTime } from '../lib/util';
import { addVoiceTake, placeAudio } from '../lib/project';
import { narrationClips } from '../lib/audiotracks';
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
import { makeProxy, needsProxy } from '../lib/proxy';

let previewAudio: HTMLAudioElement | null = null;
/** Play / stop a short preview of an audio asset. */
async function togglePreview(id: string) {
  if (previewAudio) {
    previewAudio.pause();
    const same = previewAudio.dataset.id === id;
    previewAudio = null;
    if (same) return;
  }
  const blob = await media.blob(id);
  if (!blob) return;
  previewAudio = new Audio(URL.createObjectURL(blob));
  previewAudio.dataset.id = id;
  void previewAudio.play();
}

function MediaItem({ a, uses, onInsert, onReplace, canReplace, match, list }: { a: Asset; uses: number; onInsert: (kind?: 'voice' | 'music' | 'sfx') => void; onReplace: () => void; canReplace: boolean; match?: number; list: boolean }) {
  const thumb = useThumb(a.kind === 'audio' ? undefined : a.id, a.kind);
  const audio = a.kind === 'audio';
  return (
    <div className={`media-item ${list ? 'row-item' : ''} k-${a.kind}`} title={`${a.name} — drag onto the timeline`} draggable
      onDragStart={(e) => (e.dataTransfer.setData('application/x-asset', a.id), (e.dataTransfer.effectAllowed = 'copy'))}>
      <div className="mthumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={a.kind === 'video' ? 'film' : audio ? 'music' : 'image'} />}
        {(a.kind === 'video' || audio) && <span className="badge">{fmtTime(a.duration ?? 0, false)}</span>}
        {uses > 0 && <span className="badge used">×{uses}</span>}
        {match !== undefined && <span className={`badge match ${match >= 60 ? 'hi' : ''}`} title="How well it matches your description">{match}%</span>}
        <div className="mactions">
          {audio ? (
            <>
              <button className="icon-btn" title="Listen" onClick={() => void togglePreview(a.id)}><Icon name="play" /></button>
              <button className="icon-btn" title="Add to Music at the playhead" onClick={() => onInsert('music')}><Icon name="music" /></button>
              <button className="icon-btn" title="Add as a voice take" onClick={() => onInsert('voice')}><Icon name="mic" /></button>
              <button className="icon-btn" title="Add to SFX at the playhead" onClick={() => onInsert('sfx')}><Icon name="sfx" /></button>
            </>
          ) : (
            <>
              <button className="icon-btn" title="Insert at playhead" onClick={() => onInsert()}><Icon name="plus" /></button>
              {canReplace && <button className="icon-btn" title="Use for selected clip" onClick={onReplace}><Icon name="link" /></button>}
            </>
          )}
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
  const start = d.clips.length ? at : 0;
  d.clips.push(defaultClip(assetId, start));
  d.clips.sort((x, y) => x.start - y.start);
  // Appended at the end: the main track grows by the new clip (video length, or 4 s for an image).
  if (d.clips[d.clips.length - 1].assetId === assetId && d.clips[d.clips.length - 1].start === start) {
    const a = d.assets.find((x) => x.id === assetId);
    d.length = Math.max(d.length, start + (a?.kind === 'video' ? a.duration ?? 4 : 4), d.clips.length === 1 ? narrationEnd(d) : 0);
  }
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
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [sort, setSort] = useState<'new' | 'old' | 'name' | 'used'>('new');
  const [list, setList] = useState(() => localStorage.getItem('mediaView') === 'list');
  const [query, setQuery] = useState('');
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState('');
  const vision = useVision();
  const uses = new Map<string, number>();
  p.clips.forEach((c) => uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1));
  p.audio.forEach((c) => c.assetId && uses.set(c.assetId, (uses.get(c.assetId) ?? 0) + 1));
  p.overlays.forEach((o) => o.assetId && uses.set(o.assetId, (uses.get(o.assetId) ?? 0) + 1));
  const hidden = new Set([...p.assets.map((a) => a.proxyId), ...p.clips.map((c) => c.depthId)].filter(Boolean));
  const all = p.assets.filter((a) => !a.name.startsWith('__') && !hidden.has(a.id));
  const counts = { all: all.length, image: all.filter((a) => a.kind === 'image').length, video: all.filter((a) => a.kind === 'video').length, audio: all.filter((a) => a.kind === 'audio').length };
  let visuals = all.filter((a) => (kind === 'all' || a.kind === kind) && (filter === 'all' || !uses.get(a.id)));
  visuals = sort === 'name' ? [...visuals].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })) : sort === 'used' ? [...visuals].sort((x, y) => (uses.get(y.id) ?? 0) - (uses.get(x.id) ?? 0)) : sort === 'new' ? [...visuals].reverse() : visuals;
  if (scores) visuals = visuals.filter((a) => scores.has(a.id)).sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
  const insert = (a: Asset, as?: 'voice' | 'music' | 'sfx') => {
    if (a.kind !== 'audio') return update((d) => insertAssetAt(d, a.id, time));
    let info: ReturnType<typeof addVoiceTake> | undefined;
    update((d) => void (as === 'voice' ? (info = addVoiceTake(d, a.id, a.duration ?? 0, narrationClips(d).length ? 0 : time)) : placeAudio(d, a.id, as ?? 'music', time, a.duration ?? 5)));
    if (info?.replacedName) toast(`Added on “${info.trackName}” — your previous voice is kept on “${info.replacedName}” (muted)`, 'ok');
  };
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
    <Section title={`Media (${all.length})`}>
      <button className="btn primary" onClick={() => setOpen(true)}><Icon name="upload" /> Import media…</button>
      {p.assets.some(needsProxy) && (
        <div className="card notice">
          <b>{p.assets.filter(needsProxy).length} large video{p.assets.filter(needsProxy).length > 1 ? 's' : ''} (above 1080p)</b>
          <p className="hint">Make 720p working copies for smooth editing. The preview uses them; export always uses your original files.</p>
          <button className="btn sm" disabled={!!busy} onClick={async () => {
            const list = p.assets.filter(needsProxy);
            try {
              for (const [i, a] of list.entries()) {
                const id = await makeProxy(a, (f) => setBusy(`Working copy ${i + 1} / ${list.length}: ${Math.round(f * 100)}%`));
                update((d) => void (d.assets.find((x) => x.id === a.id)!.proxyId = id));
              }
              toast('Working copies ready — preview is lighter now', 'ok');
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy('');
            }
          }}><Icon name="bolt" /> Make 720p working copies</button>
        </div>
      )}
      <div className="row">
        <input value={query} placeholder="Find by describing it — e.g. “man walking at sunset”" onChange={(e) => (setQuery(e.target.value), !e.target.value && setScores(null))} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="icon-btn" disabled={!!busy} onClick={search} title="Search your media by description (runs on this PC)"><Icon name="cursor" /></button>
      </div>
      {(busy || vision.label) && <p className="hint">{vision.label ? `${vision.label} ${Math.round(vision.value * 100)}% (first time only, ~150 MB)` : busy}</p>}
      {scores && <p className="hint">Best matches first · <button className="link" onClick={() => (setScores(null), setQuery(''))}>clear</button>. Descriptions work best in English.</p>}
      <Seg options={[['all', `All ${counts.all}`], ['image', `Images ${counts.image}`], ['video', `Video ${counts.video}`], ['audio', `Audio ${counts.audio}`]] as const} value={kind} onChange={setKind} />
      <div className="row media-bar">
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} title="Sort">
          <option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name</option><option value="used">Most used</option>
        </select>
        <label className="toggle sm"><input type="checkbox" checked={filter === 'unused'} onChange={(e) => setFilter(e.target.checked ? 'unused' : 'all')} /> Unused only</label>
        <span className="grow" />
        <button className={`icon-btn ${!list ? 'on' : ''}`} title="Grid" onClick={() => (setList(false), localStorage.setItem('mediaView', 'grid'))}><Icon name="media" /></button>
        <button className={`icon-btn ${list ? 'on' : ''}`} title="List" onClick={() => (setList(true), localStorage.setItem('mediaView', 'list'))}><Icon name="list" /></button>
      </div>
      {!visuals.length && <p className="hint">{all.length ? 'Nothing here with these filters.' : 'No media yet — Import, or drop files onto the window.'}</p>}
      <div className={list ? 'media-list' : 'media-grid'}>
        {visuals.map((a) => <MediaItem key={a.id} a={a} list={list} uses={uses.get(a.id) ?? 0} match={scores?.get(a.id)} onInsert={(as) => insert(a, as)} onReplace={() => replace(a)} canReplace={selection?.kind === 'clip' && a.kind !== 'audio'} />)}
      </div>
      <p className="hint">Tip: drag any item onto a timeline track.</p>
      <p className="hint">Need more? Download from a stock site, then Import:</p>
      <div className="row wrap">
        {siteLinks(query || keywordsFrom(p.words.filter((w) => Math.abs(w.start - time) < 4).map((w) => w.text).join(' ')) || 'nature', 'video').map((l) => <a key={l.label} className="btn sm ghost" href={l.url} target="_blank" rel="noreferrer"><Icon name="link" /> {l.label}</a>)}
      </div>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </Section>
  );
}
