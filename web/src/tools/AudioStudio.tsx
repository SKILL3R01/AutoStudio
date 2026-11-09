import { useState } from 'react';
import { ToolPage } from './common';
import { FilePick, Select } from '../components/ui';
import { toast } from '../components/Toast';
import { transcribeLocal, speakDraft, KOKORO_VOICES } from '../ai/vision';
import { FX_PRESETS, defaultFx, makeupFor, voiceChain } from '../audio/enhance';
import { encodeAudio } from '../export/exporter';
import { toSrt } from '../lib/captions';
import { chat, useLlm } from '../lib/llm';
import { createProject } from '../lib/scenes';
import { download } from '../lib/util';
import { navigate } from '../App';
import { joinParagraphs } from '../voice/library';
import type { Word } from '../types';

/** Decode → (noise gate + enhance preset + loudness) → new buffer. */
async function clean(buf: AudioBuffer, preset: string, gate: boolean): Promise<AudioBuffer> {
  const fx = { ...defaultFx(preset), targetLufs: -14 };
  fx.gainDb = await makeupFor(buf, fx);
  const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(voiceChain(ctx, fx, ctx.destination));
  src.start();
  const out = await ctx.startRendering();
  if (gate) {
    // Simple noise gate: quiet 20 ms blocks (background hiss between words) are faded down.
    const d = out.getChannelData(0), n = Math.round(out.sampleRate * 0.02);
    let floor = 1;
    for (let i = 0; i < d.length; i += n) {
      let e = 0;
      for (let k = i; k < Math.min(d.length, i + n); k++) e += d[k] * d[k];
      floor = Math.min(floor, Math.sqrt(e / n) || 1);
    }
    const thr = Math.max(0.004, floor * 4);
    for (let i = 0; i < d.length; i += n) {
      let e = 0;
      for (let k = i; k < Math.min(d.length, i + n); k++) e += d[k] * d[k];
      if (Math.sqrt(e / n) < thr) for (let k = i; k < Math.min(d.length, i + n); k++) d[k] *= 0.15;
    }
  }
  return out;
}

/** Audio Studio: clean, transcribe, translate and dub a voice before using it in a video. */
export function AudioStudio() {
  const llm = useLlm((s) => s.status);
  const [file, setFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('clean');
  const [gate, setGate] = useState(true);
  const [lang, setLang] = useState('Arabic');
  const [voice, setVoice] = useState('af_heart');
  const [busy, setBusy] = useState('');
  const work = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const decode = async (b: Blob) => {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await b.arrayBuffer());
    void ctx.close();
    return buf;
  };
  const current = audio ?? file;
  const base = file?.name.replace(/\.[^.]+$/, '') ?? 'audio';

  return (
    <ToolPage
      title="Audio Studio"
      subtitle="Prepare a voice before the video: clean it, transcribe it, translate and dub it — then export or open it in a new video. Everything runs on this PC."
      form={
        <>
          <FilePick accept="audio/*,video/*" className="drop" onFiles={([f]) => f && (setFile(f), setAudio(null), setWords([]), setText(''))}>
            <span className="icon">♪</span>
            <b>{file ? file.name : 'Drop audio or video'}</b>
          </FilePick>
          {current && <audio controls src={URL.createObjectURL(current)} />}
          <h4>1 · Clean</h4>
          <Select label="Voice preset" value={preset} options={Object.entries(FX_PRESETS).map(([k, v]) => [k, v.label] as [string, string])} onChange={setPreset} />
          <label className="toggle"><input type="checkbox" checked={gate} onChange={(e) => setGate(e.target.checked)} /> Reduce background noise between words</label>
          <button className="btn" disabled={!file || !!busy} onClick={() => work('Cleaning…', async () => setAudio(await encodeAudio(await clean(await decode(file!), preset, gate), 'wav')))}>Clean & normalise (−14 LUFS)</button>
          <h4>2 · Transcript</h4>
          <button className="btn" disabled={!current || !!busy} onClick={() => work('Transcribing on this PC…', async () => {
            const r = await transcribeLocal(current!, 'base', 'auto');
            setWords(r.words);
            setText(r.words.map((w) => w.text).join(' '));
          })}>Transcribe</button>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Transcript appears here — edit freely" />
          <h4>3 · Translate & dub</h4>
          <div className="row">
            <Select label="Translate to" value={lang} options={['Arabic', 'English', 'French', 'Spanish', 'German', 'Turkish', 'Urdu', 'Hindi'].map((l) => [l, l] as [string, string])} onChange={setLang} />
            <button className="btn" disabled={!text || llm !== 'ready' || !!busy} onClick={() => work('Translating…', async () => setText(await chat([{ role: 'system', content: 'Translate the narration faithfully and naturally for a video voiceover. Keep paragraph breaks. Output only the translation.' }, { role: 'user', content: `Target language: ${lang}\n\n${text}` }], { maxTokens: 3000, temperature: 0.3 })))}>Translate</button>
          </div>
          {llm !== 'ready' && <p className="hint">Translation uses your AI assistant (Settings → AI connections).</p>}
          <div className="row">
            <Select label="Dub voice (English drafts)" value={voice} options={KOKORO_VOICES} onChange={setVoice} />
            <button className="btn" disabled={!text || !!busy} onClick={() => work('Dubbing…', async () => {
              const parts = [];
              for (const para of text.split(/\n\s*\n/).filter((x) => x.trim())) parts.push((await speakDraft(para, voice)).wav);
              setAudio(await joinParagraphs(parts));
              setWords([]);
            })}>Dub with draft voice</button>
          </div>
          <p className="hint">For your cloned voice or Arabic dubbing, open the result in a video and use Voice Studio (local cloning, 23 languages).</p>
          {busy && <p className="hint">{busy}</p>}
        </>
      }
      side={
        <div className="row wrap">
          <button className="btn sm" disabled={!current} onClick={async () => download(await encodeAudio(await decode(current!), 'wav'), `${base}.wav`)}>⤓ WAV</button>
          <button className="btn sm" disabled={!current} onClick={async () => download(await encodeAudio(await decode(current!), 'm4a'), `${base}.m4a`)}>⤓ M4A</button>
          <button className="btn sm" disabled={!words.length} onClick={() => download(new Blob([toSrt(words.map((w) => ({ start: w.start, end: w.end, words: [w] })))]), `${base}.srt`)}>⤓ SRT</button>
          <button className="btn sm" disabled={!text} onClick={() => download(new Blob([text]), `${base}.txt`)}>⤓ Script</button>
          <button className="btn primary sm" disabled={!current} onClick={async () => {
            const p = await createProject({ name: base, voice: current!, images: [], words: words.length ? words : undefined });
            navigate({ page: 'editor', id: p.id });
          }}>Use in a new video →</button>
        </div>
      }
    />
  );
}
