import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { sfxBuffer } from '../audio/sfx';
import { downloadOnline, onlinePreviewUrl, onlineSearchAvailable, searchMedia, searchOnline, searchPack, type SoundHit, type SoundPick } from '../audio/sfxsearch';
import { probe } from '../lib/project';
import { fmtTime } from '../lib/util';
import { FilePick } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';

interface PickerRequest { title: string; query: string; onPick: (pick: SoundPick) => void }
/** Opens the sound picker; `onPick` gets a built-in recording or a Media file (online / uploaded files are added to Media first). */
export const useSoundPicker = create<{ req: PickerRequest | null; open: (r: PickerRequest) => void; close: () => void }>((set) => ({
  req: null,
  open: (req) => set({ req }),
  close: () => set({ req: null }),
}));

let stopPreview: (() => void) | null = null;
async function preview(hit: SoundHit) {
  stopPreview?.();
  if (hit.kind === 'online') {
    const url = await onlinePreviewUrl(hit);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    stopPreview = () => (a.pause(), URL.revokeObjectURL(url));
    return void a.play();
  }
  const b = await sfxBuffer(hit.kind === 'pack' ? hit.sound : `asset:${hit.assetId}`);
  if (!b) return;
  const ctx = new AudioContext();
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0, 0, Math.min(b.duration, 12));
  s.onended = () => void ctx.close();
  stopPreview = () => void ctx.close();
}

function Row({ hit, busy, onUse }: { hit: SoundHit; busy: boolean; onUse: () => void }) {
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    setPlaying(true);
    try {
      await preview(hit);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPlaying(false);
    }
  };
  return (
    <div className="list-item sfx-row sound-hit">
      <button className="icon-btn" title="Listen" disabled={playing} onClick={() => void play()}><Icon name="play" /></button>
      <span className="grow">
        <b>{hit.title}</b>{hit.duration ? ` · ${hit.duration < 60 ? `${hit.duration.toFixed(1)} s` : fmtTime(hit.duration, false)}` : ''}
        <br /><span className="hint">{hit.kind === 'pack' ? `Built-in · ${hit.credit}` : hit.kind === 'media' ? 'Your file' : `${hit.site} · ${hit.credit}${hit.detail ? ` · ${hit.detail}` : ''}`}</span>
      </span>
      <button className="btn sm primary" disabled={busy} onClick={onUse}>Use</button>
    </div>
  );
}

/** Find a sound: built-in recordings, your files, and free CC0 libraries online (desktop app). */
export function SoundPicker() {
  const { req, close } = useSoundPicker();
  const p = useEditor((s) => s.project);
  const update = useEditor((s) => s.update);
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<{ hits: SoundHit[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    setQ(req?.query ?? '');
    setOnline(null);
  }, [req]);
  useEffect(() => () => stopPreview?.(), []);
  if (!req || !p) return null;
  const can = onlineSearchAvailable();
  const finish = (pick: SoundPick) => {
    stopPreview?.();
    req.onPick(pick);
    close();
  };
  const addAsset = (asset: Awaited<ReturnType<typeof probe>>) => {
    update((d) => void d.assets.push(asset));
    finish({ assetId: asset.id, title: asset.name, duration: asset.duration ?? 2 });
  };
  const use = async (hit: SoundHit) => {
    if (hit.kind === 'pack') return finish({ sound: hit.sound, title: hit.title, duration: hit.duration });
    if (hit.kind === 'media') return finish({ assetId: hit.assetId, title: hit.title, duration: hit.duration ?? 2 });
    setBusy(hit.key);
    try {
      addAsset(await downloadOnline(hit));
      toast(`Downloaded “${hit.title}” (CC0) into Media`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const searchWeb = async () => {
    setBusy('search');
    try {
      setOnline(await searchOnline(q));
    } finally {
      setBusy('');
    }
  };
  const pack = searchPack(q).slice(0, 12);
  const mine = searchMedia(p, q).slice(0, 12);
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal wide sound-picker" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{req.title} <HelpButton topic="scriptsounds" small /></h3><button className="icon-btn" onClick={close}><Icon name="x" /></button></div>
        <form className="row" onSubmit={(e) => (e.preventDefault(), can && void searchWeb())}>
          <input className="grow" autoFocus placeholder="Describe the sound: door buzzer, footsteps on gravel, phone ringing…" value={q} onChange={(e) => setQ(e.target.value)} />
          {can && <button className="btn primary" disabled={!q.trim() || busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search online'}</button>}
        </form>
        <div className="sound-results">
          <h4>Built-in recordings ({pack.length})</h4>
          {pack.length ? pack.map((h) => <Row key={h.key} hit={h} busy={!!busy} onUse={() => void use(h)} />) : <p className="hint">No built-in recording matches — try other words or search online.</p>}
          {mine.length > 0 && <><h4>Your files ({mine.length})</h4>{mine.map((h) => <Row key={h.key} hit={h} busy={!!busy} onUse={() => void use(h)} />)}</>}
          <h4>Online · free CC0 sounds</h4>
          {!can ? (
            <p className="hint">Online search works in the desktop app. In the browser, find a sound on <a href={`https://bigsoundbank.com/search?q=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">BigSoundBank</a> or <a href={`https://freesound.org/search/?q=${encodeURIComponent(q)}&f=${encodeURIComponent('license:"Creative Commons 0"')}`} target="_blank" rel="noreferrer">Freesound (CC0)</a>, download it, then use Upload a file below.</p>
          ) : !online ? (
            <p className="hint">Press <b>Search online</b> to look in BigSoundBank and Freesound. Only CC0 sounds are shown (free for any video, no credit needed); the licence is checked again before download.</p>
          ) : (
            <>
              {online.hits.map((h) => <Row key={h.key} hit={h} busy={!!busy} onUse={() => void use(h)} />)}
              {!online.hits.length && <p className="hint">Nothing found online for “{q}”.</p>}
              {online.errors.map((e) => <p key={e} className="hint warn">{e}</p>)}
            </>
          )}
        </div>
        <FilePick className="btn" accept="audio/*" onFiles={async ([f]) => f && addAsset(await probe(f, f.name, 'audio'))}><Icon name="upload" /> Upload a file…</FilePick>
      </div>
    </div>
  );
}
