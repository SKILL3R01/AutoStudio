import { useState } from 'react';
import { useEditor, clipEnd } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { probe, importAudio } from '../lib/project';
import { clipIndexAt } from '../render/renderer';
import { uid } from '../lib/util';
import { creditsText, downloadFree, keywordsFrom, searchOpenverse, searchWikimedia, siteLinks, type FreeItem, type FreeKind, type FreeSource } from '../lib/freemedia';
import { insertAssetAt, replaceClipAsset } from './MediaPanel';

const KINDS: [FreeKind, string][] = [['image', 'Images'], ['video', 'Video'], ['music', 'Music'], ['sfx', 'Sound FX']];

/** Narration spoken around the playhead (the current clip), for a one-click search. */
function narrationAt(p: ReturnType<typeof useProject>, t: number) {
  if (!p.clips.length) return '';
  const i = clipIndexAt(p.clips, t);
  const s = i === 0 ? 0 : p.clips[i].start, e = clipEnd(p, i);
  return (p.words.length ? p.words : p.lines.flatMap((l) => l.words)).filter((w) => w.start >= s - 0.1 && w.start < e).map((w) => w.text).join(' ');
}

export function FreeMediaPanel() {
  const p = useProject();
  const { update, selection, time } = useEditor();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<FreeKind>('image');
  const [source, setSource] = useState<FreeSource>('wikimedia');
  const [allowCredit, setAllowCredit] = useState(false);
  const [items, setItems] = useState<FreeItem[]>([]);
  const [busy, setBusy] = useState('');
  const credits = p.credits ?? [];

  const search = async (query = q) => {
    if (!query.trim()) return;
    setBusy('Searching…');
    try {
      const aspect = p.export.aspect === '9:16' ? 'tall' : p.export.aspect === '1:1' ? 'square' : 'wide';
      const list = source === 'openverse' ? await searchOpenverse(query, kind, allowCredit, aspect) : await searchWikimedia(query, kind, allowCredit);
      setItems(list);
      if (!list.length) toast(kind === 'video' && source === 'openverse' ? 'Openverse has no video — use Wikimedia Commons' : 'Nothing free found — try other words, allow CC BY, or open Pexels / Pixabay', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const fromNarration = () => {
    const words = keywordsFrom(narrationAt(p, time));
    if (!words) return toast('No narration under the playhead', 'info');
    setQ(words);
    void search(words);
  };

  /** Download → add to the project with its credit; then place it. */
  const use = async (it: FreeItem, action: 'bin' | 'insert' | 'replace' | 'music' | 'sfx') => {
    setBusy(`Downloading “${it.title.slice(0, 40)}”…`);
    try {
      const blob = await downloadFree(it);
      const ext = (blob.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg').replace(/;.*/, '');
      const name = `${it.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 50).trim() || 'free'}.${ext}`;
      const credit = { title: it.title, creator: it.creator, license: it.license, page: it.page, required: it.credit };
      if (action === 'music') {
        const next = await importAudio(p, [new File([blob], name, { type: blob.type })], { asMusic: true });
        const asset = next.assets[next.assets.length - 1];
        update((d) => Object.assign(d, next, { credits: [...(d.credits ?? []), { ...credit, assetId: asset.id }] }));
      } else {
        const asset = await probe(blob, name, it.kind);
        update((d) => {
          d.assets.push(asset);
          d.credits = [...(d.credits ?? []), { ...credit, assetId: asset.id }];
          if (action === 'insert') insertAssetAt(d, asset.id, time);
          if (action === 'replace' && selection?.kind === 'clip') replaceClipAsset(d, selection.id, asset.id);
          if (action === 'sfx') d.sfx.push({ id: uid(), sound: `asset:${asset.id}`, start: time, volume: 0.8 });
        });
      }
      toast(`Added${it.credit ? ' — credit required (see Credits below)' : ''}`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const visual = kind === 'image' || kind === 'video';
  return (
    <>
      <Section title="Free media" hint="No account or key needed. Public-domain / CC0 by default — free to use, no credit needed.">
        <Seg options={KINDS} value={kind} onChange={(k) => (setKind(k), setItems([]))} />
        <div className="row">
          <input value={q} placeholder={kind === 'sfx' ? 'e.g. door slam, rain' : 'e.g. city at night'} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="icon-btn" disabled={!!busy} onClick={() => search()} title="Search"><Icon name="cursor" /></button>
        </div>
        <div className="row wrap">
          <button className="btn sm ghost" disabled={!!busy} onClick={fromNarration} title="Search with the key words spoken in the current clip"><Icon name="mic" /> From narration here</button>
          <select value={source} onChange={(e) => (setSource(e.target.value as FreeSource), setItems([]))}>
            <option value="wikimedia">Wikimedia Commons</option>
            <option value="openverse">Openverse</option>
          </select>
        </div>
        <Toggle label="Also show CC BY / BY-SA (needs a credit line)" value={allowCredit} onChange={setAllowCredit} />
        {busy && <p className="hint">{busy}</p>}
        <div className={visual ? 'free-grid' : 'free-list'}>
          {items.map((it) => (
            <div key={it.id} className="free-item" title={`${it.title} — ${it.creator} — ${it.license}`}>
              {visual ? (
                <div className="fthumb">
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : <Icon name="image" />}
                  {it.duration ? <span className="badge">{Math.round(it.duration)}s</span> : null}
                  <span className={`badge lic ${it.credit ? 'credit' : ''}`}>{it.credit ? 'credit' : 'free'}</span>
                  <div className="mactions">
                    <button className="icon-btn" title="Insert at playhead" onClick={() => use(it, 'insert')}><Icon name="plus" /></button>
                    {selection?.kind === 'clip' && <button className="icon-btn" title="Use for selected clip" onClick={() => use(it, 'replace')}><Icon name="link" /></button>}
                    <button className="icon-btn" title="Add to media bin" onClick={() => use(it, 'bin')}><Icon name="download" /></button>
                  </div>
                </div>
              ) : (
                <div className="row between">
                  <div className="col">
                    <b>{it.title.slice(0, 60)}</b>
                    <span className="hint">{it.creator.slice(0, 40)} · {it.license}{it.duration ? ` · ${Math.round(it.duration)}s` : ''}</span>
                  </div>
                  <audio src={it.url} controls preload="none" />
                  <button className="btn sm" onClick={() => use(it, kind === 'music' ? 'music' : 'sfx')}><Icon name="plus" /> {kind === 'music' ? 'Music' : 'At playhead'}</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="row wrap">
          <span className="hint">Modern stock (needs a free download):</span>
          {siteLinks(q || keywordsFrom(narrationAt(p, time)) || 'nature', kind).map((l) => <a key={l.label} className="btn sm ghost" href={l.url} target="_blank" rel="noreferrer"><Icon name="link" /> {l.label}</a>)}
        </div>
        <p className="hint">Downloaded files from Pexels / Pixabay can be dropped into <b>Add media</b>.</p>
      </Section>
      {credits.length > 0 && (
        <Section title={`Credits (${credits.length})`} hint="Paste into your video description — required for the items marked “credit”.">
          <ul className="credits">
            {credits.map((c) => <li key={c.assetId} className={c.required ? 'req' : ''}>{c.title} — {c.creator} — {c.license}</li>)}
          </ul>
          <button className="btn sm" onClick={() => void navigator.clipboard.writeText(creditsText(credits)).then(() => toast('Credits copied', 'ok'))}><Icon name="copy" /> Copy credits</button>
        </Section>
      )}
    </>
  );
}
