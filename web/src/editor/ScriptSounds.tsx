import { useState } from 'react';
import { useEditor } from '../store';
import { sfxBuffer } from '../audio/sfx';
import { applySfxCues, findSfxCues, hasScriptSounds, removeScriptSounds, SFX_RULES, type SfxCue } from '../audio/scriptsfx';
import { fmtTime } from '../lib/util';
import { Section, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { HelpButton } from '../components/HelpButton';
import { useProject } from './hooks';
import { useSoundPicker } from './SoundPicker';

async function play(c: SfxCue) {
  const b = await sfxBuffer(c.assetId ? `asset:${c.assetId}` : c.sound ?? 'pop');
  if (!b) return;
  const ctx = new AudioContext();
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0, 0, Math.min(b.duration, c.dur));
  s.onended = () => ctx.close();
}

/** Sounds from the script: footsteps, breathing, screams… placed on the spoken word, reviewed before they are added. */
export function ScriptSounds() {
  const p = useProject();
  const { update, setTime } = useEditor();
  const [cues, setCues] = useState<SfxCue[] | null>(null);
  const [vol, setVol] = useState(0.5);
  const hasWords = p.words.length > 0 || p.lines.some((l) => l.words.length > 0);
  const placed = hasScriptSounds(p);
  const find = () => {
    const found = findSfxCues(p);
    setCues(found);
    if (!found.length) toast('No sound words found in the narration (walk, breathe, scream, knock, rain…)', 'info');
  };
  const add = () => {
    let n = 0;
    update((d) => void (n = applySfxCues(d, cues ?? [], vol)));
    toast(`Added ${n} sound${n === 1 ? '' : 's'} on the “Script sounds” track — Auto levels in Export keeps them under the voice`, 'ok');
    setCues(null);
  };
  const change = (i: number) => useSoundPicker.getState().open({
    title: `Sound for “${cues![i].word}”`,
    query: cues![i].label,
    onPick: (pick) => setCues((cur) => cur && cur.map((x, j) => (j !== i ? x : 'sound' in pick
      ? { ...x, sound: pick.sound, assetId: undefined, fileName: undefined, credit: pick.title, dur: Math.min(pick.duration, 10), on: true }
      : { ...x, assetId: pick.assetId, fileName: pick.title, sound: undefined, credit: undefined, dur: Math.min(pick.duration, 10), on: true }))),
  });
  const missing = [...new Set((cues ?? []).filter((c) => !c.assetId && !c.sound).map((c) => c.label))];
  return (
    <Section title="Sounds from the script" hint="Finds words like walked, sighed, screamed, knock, rain in the narration and puts a matching sound on the spoken word.">
      {!hasWords ? (
        <p className="hint">Needs word timings: add captions (Captions → Transcribe) or a voiceover with its .srt first.</p>
      ) : (
        <div className="row wrap">
          <HelpButton topic="scriptsounds" small />
          <button className="btn primary sm" onClick={find}><Icon name="wand" /> Find sounds</button>
          {placed && <button className="btn sm" onClick={() => update((d) => removeScriptSounds(d))}><Icon name="trash" /> Remove script sounds</button>}
        </div>
      )}
      {cues && cues.length > 0 && (
        <>
          <div className="list script-sfx">
            {cues.map((c, i) => (
              <label key={c.id} className="list-item sfx-row">
                <input type="checkbox" checked={c.on} disabled={!c.assetId && !c.sound} onChange={(e) => setCues(cues.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <button className="link" title="Go to this moment" onClick={(e) => (e.preventDefault(), setTime(c.t))}>{fmtTime(c.t)}</button>
                <span className="grow" title={c.context}><b>{c.label}</b> · “{c.word}”<br /><span className="hint">{c.assetId ? `Your file: ${c.fileName}` : c.credit ? `Recording: ${c.credit}` : 'Needs a sound file'}</span></span>
                {(c.assetId || c.sound) && <button className="icon-btn" title="Listen" onClick={(e) => (e.preventDefault(), void play(c))}><Icon name="play" /></button>}
                <button className="btn sm" title="Pick another sound" onClick={(e) => (e.preventDefault(), change(i))}>Change…</button>
              </label>
            ))}
          </div>
          <Slider label="Volume" value={vol} min={0} max={1} onChange={setVol} fmt={(v) => `${Math.round(v * 100)}%`} />
          <button className="btn primary" disabled={!cues.some((c) => c.on)} onClick={add}>Add {cues.filter((c) => c.on).length} sounds</button>
          {missing.length > 0 && <p className="hint">No recording for: {missing.join(', ')}. Import a sound file named after it (e.g. “scream.mp3”) with Add media → Media only, then press Find sounds again.</p>}
        </>
      )}
      <p className="hint">Every sound is a real recording (CC0, free for any video). To use your own instead, import files with Add media → <b>Media only</b>: files named like {SFX_RULES.slice(0, 4).map((r) => `“${r.files[0]}”`).join(', ')} are picked first.</p>
    </Section>
  );
}
