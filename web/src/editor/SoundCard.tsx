/** Story sound (v5.4): the style's sound kit (effects) and music that follows the story, each music style previewable. */
import { useRef, useState } from 'react';
import { useEditor } from '../store';
import { Icon } from '../components/icons';
import { HelpButton } from '../components/HelpButton';
import { toast } from '../components/Toast';
import { Slider } from '../components/ui';
import { applyMotionSound, soundKitOf } from '../motion/finish';
import { MUSIC_STYLES, composeMusic, musicStyleOf, renderMusic, type MusicStyle } from '../audio/music';
import { makeStoryMusic } from '../motion/story/sound';
import type { StyleKit } from '../motion/styles/types';

let previewCtx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
async function preview(st: MusicStyle) {
  playing?.stop();
  previewCtx ??= new AudioContext();
  const buf = await renderMusic(composeMusic(st, [{ start: 0, end: 4.5, kind: 'build' }, { start: 4.5, end: 9, kind: 'reveal' }], 9), 9);
  const src = previewCtx.createBufferSource();
  src.buffer = buf;
  src.connect(previewCtx.destination);
  src.start();
  playing = src;
}

export function SoundCard({ kit }: { kit: StyleKit }) {
  const update = useEditor((s) => s.update);
  const hasMusic = useEditor((s) => !!s.project?.audio.some((c) => c.id.startsWith('smusic_')));
  const sk = soundKitOf(kit.id, kit.base);
  const [pick, setPick] = useState(musicStyleOf(kit.id, kit.base).id);
  const [vol, setVol] = useState(55);
  const [busy, setBusy] = useState('');
  const [hear, setHear] = useState('');
  const once = useRef(false);
  const make = async () => {
    if (once.current) return;
    once.current = true;
    setBusy('Composing…');
    try {
      const r = await makeStoryMusic(MUSIC_STYLES[pick], vol / 100, (k) => setBusy(`Playing the instruments… ${Math.round(k * 100)}%`));
      toast(`Music added (${Math.round(r.seconds)} s, ${MUSIC_STYLES[pick].name})${r.stops ? ` · stops before ${r.stops} reveal${r.stops === 1 ? '' : 's'}` : ''} — it ducks under your voice`, 'ok');
    } catch (e) {
      toast(`Music: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
      once.current = false;
    }
  };
  return (
    <div className="polish-card sound-card" data-tour="sound">
      <b>Sound · {sk.name} <HelpButton topic="sound" small /></b>
      <button className="btn sm" onClick={() => { let n = 0; update((d) => void (n = applyMotionSound(d, 1, sk))); toast(n ? `${n} sound effects placed (${sk.says})` : 'No sounds to add', n ? 'ok' : 'info'); }}><Icon name="sfx" /> Add sound effects</button>
      <span className="hint">{sk.says}</span>
      <label className="lbl">Music that follows the story</label>
      <div className="music-grid">
        {Object.values(MUSIC_STYLES).map((m) => (
          <div key={m.id} className={`music-card ${pick === m.id ? 'on' : ''}`} data-music={m.id} onClick={() => setPick(m.id)} title={m.mood}>
            <button className="btn sm ghost icon" title={`Listen to ${m.name}`} onClick={(e) => { e.stopPropagation(); setHear(m.id); void preview(m).finally(() => setHear('')); }}>{hear === m.id ? '…' : '▶'}</button>
            <span><b>{m.name}</b><em>{m.mood}</em></span>
          </div>
        ))}
      </div>
      <Slider label="Music volume" value={vol} min={10} max={100} step={1} suffix="%" onChange={setVol} />
      <button className="btn sm primary" disabled={!!busy} onClick={() => void make()}>{busy || (hasMusic ? 'Make the music again' : 'Add music')}</button>
      <span className="hint">Calm while you explain, a short stop before each reveal, a lift at the end. Made by the app — free to use.</span>
    </div>
  );
}
