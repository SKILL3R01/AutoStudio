/** Story Studio · "Use my voiceover": upload the audio (it becomes the narration), then subtitles or a transcription on this PC. */
import { useState } from 'react';
import { projectLength, useEditor } from '../store';
import { useProject } from './hooks';
import { FilePick } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { fmtTime } from '../lib/util';
import { probe, addVoiceTake } from '../lib/project';
import { parseCaptionFile } from '../lib/captions';
import { narrationAudio, offsetWords } from '../audio/mix';
import { narrationClips } from '../lib/audiotracks';
import { transcribeLocal } from '../ai/vision';
import { confirmHeavyAi } from '../lib/perf';

export function VoiceUpload() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const [busy, setBusy] = useState('');
  const voice = narrationClips(p);
  const words = p.words?.length ? p.words : p.lines.flatMap((l) => l.words);

  const addAudio = async (f?: File) => {
    if (!f) return;
    setBusy('Reading the voiceover…');
    try {
      const a = await probe(f, f.name, 'audio');
      update((d) => {
        d.assets.push(a);
        addVoiceTake(d, a.id, a.duration ?? 0, 0);
      });
      toast(`Voiceover added (${fmtTime(a.duration ?? 0)}) — now add its subtitles, or transcribe it`, 'ok');
    } catch (e) {
      toast(`Could not read ${f.name}: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };
  const addSubs = async (f?: File) => {
    if (!f) return;
    try {
      const r = parseCaptionFile(f.name, await f.text(), projectLength(p));
      const flat = r.words.length ? r.words : r.lines.flatMap((l) => l.words);
      if (flat.length < 3) return toast(`${f.name} has no timed text`, 'error');
      update((d) => {
        d.words = flat;
        d.lines = [];
        d.captions.enabled = true;
        d.captions.wordLevel = r.wordLevel;
      });
      toast(`${flat.length} timed words from ${f.name} — the scenes will follow your voice`, 'ok');
    } catch (e) {
      toast(`Could not read ${f.name}: ${(e as Error).message}`, 'error');
    }
  };
  const transcribe = async () => {
    if (!voice.length) return toast('Upload the voiceover first', 'info');
    if (!confirmHeavyAi()) return;
    setBusy('Transcribing on this PC (the model downloads once)…');
    try {
      const na = (await narrationAudio(p))!;
      const w = offsetWords((await transcribeLocal(na.blob!, 'base', 'auto')).words, na.offset);
      update((d) => {
        d.words = w;
        d.lines = [];
        d.captions.enabled = true;
        d.captions.wordLevel = true;
      });
      toast(`${w.length} words transcribed — the scenes will follow your voice`, 'ok');
    } catch (e) {
      toast(`Transcription: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="voice-upload" data-tour="voice-upload">
      <div className="vu-step">
        <span className={`ho-num ${voice.length ? 'done' : ''}`}>{voice.length ? '✓' : 1}</span>
        <div>
          <b>Your voiceover</b>
          {voice.length ? <span className="hint"> · on the timeline ({fmtTime(voice.reduce((s, c) => s + c.duration, 0))})</span> : null}
          <div className="row wrap">
            <FilePick className="btn sm" accept="audio/*,.mp3,.wav,.m4a,.ogg" onFiles={([f]) => void addAudio(f)}><Icon name="upload" /> {voice.length ? 'Replace the voiceover' : 'Upload voiceover'}</FilePick>
          </div>
        </div>
      </div>
      <div className="vu-step">
        <span className={`ho-num ${words.length >= 5 ? 'done' : ''}`}>{words.length >= 5 ? '✓' : 2}</span>
        <div>
          <b>Its timing</b>
          {words.length >= 5 ? <span className="hint"> · {words.length} timed words, until {fmtTime(words[words.length - 1].end)}</span> : null}
          <div className="row wrap">
            <FilePick className="btn sm" accept=".srt,.vtt,.json,.txt" onFiles={([f]) => void addSubs(f)}><Icon name="text" /> Upload subtitles (.srt / .vtt)</FilePick>
            <span className="hint">or</span>
            <button className="btn sm ghost" disabled={!voice.length || !!busy} onClick={() => void transcribe()}><Icon name="wand" /> Transcribe on this PC</button>
          </div>
          <p className="hint">Subtitles from ElevenLabs, TurboScribe and similar work as they are (their adverts are removed).</p>
        </div>
      </div>
      {busy && <p className="hint">{busy}</p>}
    </div>
  );
}
