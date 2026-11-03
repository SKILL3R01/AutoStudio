import { useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Select, Slider, useObjectUrl } from '../components/ui';
import { fetchResult, useEngine } from '../lib/engine';
import { download } from '../lib/util';
import { createProject } from '../lib/scenes';
import { navigate } from '../App';

export const TTS_LANGS: [string, string][] = [
  ['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['tr', 'Turkish'], ['ru', 'Russian'], ['hi', 'Hindi'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['ko', 'Korean'], ['nl', 'Dutch'],
  ['pl', 'Polish'], ['sv', 'Swedish'], ['da', 'Danish'], ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'], ['ms', 'Malay'],
  ['no', 'Norwegian'], ['sw', 'Swahili'],
];

export interface TtsOptions {
  language: string;
  model: 'auto' | 'english' | 'turbo' | 'multilingual';
  exaggeration: number;
  cfg: number;
  temperature: number;
  seed: number;
}

export const defaultTts: TtsOptions = { language: 'en', model: 'auto', exaggeration: 0.5, cfg: 0.5, temperature: 0.8, seed: 0 };

export function ttsForm(text: string, voice: File | null, o: TtsOptions) {
  const f = new FormData();
  f.append('text', text);
  if (voice) f.append('voice', voice, voice.name);
  f.append('language', o.language);
  f.append('model', o.model);
  f.append('exaggeration', String(o.exaggeration));
  f.append('cfg_weight', String(o.cfg));
  f.append('temperature', String(o.temperature));
  f.append('seed', String(o.seed));
  return f;
}

export function TtsSettings({ o, set }: { o: TtsOptions; set: (o: TtsOptions) => void }) {
  const engineKind = useEngine((s) => s.kind);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="row">
        <Select label="Language" value={o.language} options={TTS_LANGS} onChange={(v) => set({ ...o, language: v })} />
        <Select label="Model" value={o.model} options={[['auto', 'Auto'], ['english', 'Chatterbox (English, expressive)'], ['turbo', 'Turbo (English, fast, [laugh] tags)'], ['multilingual', 'Multilingual V3 (23 langs)']] as [TtsOptions['model'], string][]} onChange={(v) => set({ ...o, model: v })} />
      </div>
      {o.model === 'turbo' && <p className="hint">Turbo needs a reference voice and supports tags like [laugh], [chuckle], [cough] in the script.</p>}
      {engineKind === 'tryai' && <p className="warn">Connected to the TryAIToday engine: English only, and a reference voice sample is required (it clones that voice).</p>}
      <button className="btn ghost sm" onClick={() => setOpen(!open)}>⚙ Advanced settings</button>
      {open && (
        <>
          <Slider label="Emotion / exaggeration" value={o.exaggeration} min={0.25} max={2} onChange={(v) => set({ ...o, exaggeration: v })} />
          <Slider label="Pace (CFG weight)" value={o.cfg} min={0} max={1} onChange={(v) => set({ ...o, cfg: v })} />
          <Slider label="Temperature" value={o.temperature} min={0.05} max={2} onChange={(v) => set({ ...o, temperature: v })} />
          <Slider label="Seed (0 = random)" value={o.seed} min={0} max={9999} step={1} onChange={(v) => set({ ...o, seed: v })} />
          <p className="hint">Tip: for a fast-talking reference voice lower the CFG weight to ~0.3. Higher exaggeration = more dramatic delivery.</p>
        </>
      )}
    </>
  );
}

export function Voiceover() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<File | null>(null);
  const [o, setO] = useState(defaultTts);
  const [result, setResult] = useState<Blob | null>(null);
  const url = useObjectUrl(result);
  const job = useJob();
  const words = text.split(/\s+/).filter(Boolean).length;
  const go = async () => {
    setResult(null);
    try {
      const j = await job.run('tts', ttsForm(text, voice, o));
      setResult(await fetchResult(j.files[0].url));
      job.log('✓ Voiceover ready.');
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    }
  };
  return (
    <ToolPage
      title="AI Voiceover"
      subtitle="Narration from your Colab engine (Chatterbox — free, open-source, with zero-shot voice cloning)."
      form={
        <>
          <div className="row between"><h4>Script</h4><span className="hint">{words} words · {text.length} chars</span></div>
          <textarea rows={12} value={text} placeholder="Paste or type your script…" onChange={(e) => setText(e.target.value)} />
          <FilePick accept=".txt" onFiles={async ([f]) => f && setText(await f.text())} className="btn sm ghost">⤒ Load .txt script</FilePick>
          <div className="row between"><h4>Reference voice</h4><span className="hint">optional — clones this voice</span></div>
          <FilePick accept="audio/*" onFiles={([f]) => setVoice(f ?? null)} className="drop slim">
            {voice ? <>🎙 {voice.name} <button className="btn ghost sm" onClick={(e) => (e.stopPropagation(), setVoice(null))}>remove</button></> : '🎙 Drop a 10–30s clean voice sample (wav/mp3)'}
          </FilePick>
          <TtsSettings o={o} set={setO} />
          <button className="btn primary lg" disabled={!text.trim() || job.busy} onClick={go}>{job.busy ? 'Generating…' : 'Generate voiceover'}</button>
        </>
      }
      side={
        <Activity job={job}>
          {url && (
            <>
              <audio controls src={url} />
              <div className="row">
                <button className="btn" onClick={() => download(result!, 'voiceover.wav')}>Download WAV</button>
                <button className="btn primary" onClick={async () => {
                  const p = await createProject({ name: 'Voiceover project', voice: result!, images: [] });
                  navigate({ page: 'editor', id: p.id });
                }}>Open in editor →</button>
              </div>
            </>
          )}
        </Activity>
      }
    />
  );
}
