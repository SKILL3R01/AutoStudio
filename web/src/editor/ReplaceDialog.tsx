import { useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { probe } from '../lib/project';
import { FilePick, Seg } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';
import { useThumb } from './hooks';
import { replaceClipAsset } from './MediaPanel';
import type { Asset, Project } from '../types';

/** The clip whose media is being replaced: a main-track clip or an overlay clip. */
export const useReplace = create<{ target: { kind: 'clip' | 'pip'; id: string } | null; open: (kind: 'clip' | 'pip', id: string) => void; close: () => void }>((set) => ({
  target: null,
  open: (kind, id) => set({ target: { kind, id } }),
  close: () => set({ target: null }),
}));

/** Pictures and videos that can replace a clip, unused first. */
export function replaceCandidates(p: Project, current?: string) {
  const used = new Set([...p.clips.map((c) => c.assetId), ...p.pips.map((c) => c.assetId)]);
  const hidden = new Set([...p.assets.map((a) => a.proxyId), ...p.clips.map((c) => c.depthId)].filter(Boolean));
  return p.assets
    .filter((a) => (a.kind === 'image' || a.kind === 'video') && a.id !== current && !a.name.startsWith('__') && !hidden.has(a.id))
    .map((a) => ({ a, used: used.has(a.id) }))
    .sort((x, y) => Number(x.used) - Number(y.used));
}

function Tile({ a, used, onPick }: { a: Asset; used: boolean; onPick: () => void }) {
  const thumb = useThumb(a.id, a.kind);
  return (
    <button className="replace-tile" title={a.name} onClick={onPick}>
      {thumb ? <img src={thumb} alt="" /> : <Icon name={a.kind === 'video' ? 'film' : 'image'} size={24} />}
      <span className="name">{a.name}</span>
      {used && <span className="badge">used</span>}
    </button>
  );
}

/** Right-click → Replace with…: pick another file from Media or upload one; the new media takes the clip's place and time. */
export function ReplaceDialog() {
  const { target, close } = useReplace();
  const p = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const [show, setShow] = useState<'unused' | 'all'>('unused');
  if (!target || !p) return null;
  const item = target.kind === 'clip' ? p.clips.find((c) => c.id === target.id) : p.pips.find((c) => c.id === target.id);
  if (!item) return null;
  const old = p.assets.find((a) => a.id === item.assetId);
  const list = replaceCandidates(p, item.assetId).filter((x) => show === 'all' || !x.used);
  const apply = (asset: Asset, add = false) => {
    update((d) => {
      if (add) d.assets.push(asset);
      replaceClipAsset(d, target.id, asset.id);
    });
    toast(`Replaced with “${asset.name}”${old ? ` — “${old.name}” stays in Media` : ''}`, 'ok');
    close();
  };
  const upload = async ([f]: File[]) => {
    if (!f) return;
    try {
      apply(await probe(f, f.name, f.type.startsWith('video') || /\.(mp4|webm|mov|mkv)$/i.test(f.name) ? 'video' : 'image'), true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Replace {old ? `“${old.name}”` : 'clip'} <HelpButton topic="replace" small /></h3><button className="icon-btn" onClick={close}><Icon name="x" /></button></div>
        <p className="hint">The new picture or video takes this clip's place, length, motion and transition. The old file stays in Media.</p>
        <div className="row between">
          <Seg options={[['unused', 'Unused'], ['all', 'All media']] as const} value={show} onChange={setShow} />
          <FilePick className="btn primary" accept="image/*,video/*" onFiles={upload}><Icon name="upload" /> Upload new…</FilePick>
        </div>
        {list.length ? (
          <div className="replace-grid">{list.map(({ a, used }) => <Tile key={a.id} a={a} used={used} onPick={() => apply(a)} />)}</div>
        ) : (
          <div className="empty"><p>{show === 'unused' ? 'Every picture and video in Media is already used.' : 'No other pictures or videos in Media yet.'}</p>
            {show === 'unused' ? <button className="btn" onClick={() => setShow('all')}>Show all media</button> : <FilePick className="btn" accept="image/*,video/*" onFiles={upload}>Upload one</FilePick>}</div>
        )}
      </div>
    </div>
  );
}
