import { useMemo, useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Seg, Select, Slider } from '../components/ui';
import { download, fmtSrtTime } from '../lib/util';
import { linesByInterval, createProject } from '../lib/scenes';
import { toSrt, toVtt } from '../lib/captions';
import { navigate } from '../App';
import type { CaptionLine, Word } from '../types';
import { transcribeLocal, useVision } from '../ai/vision';
import { useEngine } from '../lib/engine';

export const WHISPER_LANGS: [string, string][] = [['auto', 'Auto-detect'], ['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['tr', 'Turkish'], ['ur', 'Urdu'], ['hi', 'Hindi'], ['ru', 'Russian'], ['ja', 'Japanese'], ['zh', 'Chinese']];

export function transcribeForm(file: Blob, name: string, language: string, model: string) {
  const f = new FormData();
  f.append('file', file, name);
  f.append('language', language);
  f.append('model', model);
  return f;
}

export function Transcript() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'lines' | 'words'>('words');
  const [interval, setGap] = useState(4);
  const [lang, setLang] = useState('auto');
  const [model, setModel] = useState('large-v3');
  const [words, setWords] = useState<Word[]>([]);
  const job = useJob();
  const engine = useEngine((e) => e.status);
  const [where, setWhere] = useState<'base' | 'small' | 'engine'>(engine === 'ready' ? 'engine' : 'base');
  const [localBusy, setLocalBusy] = useState(false);
  const vision = useVision();
  const lines: CaptionLine[] = useMemo(
    () => (mode === 'words' ? words.map((w) => ({ start: w.start, end: w.end, words: [w] })) : linesByInterval(words, interval).map((s) => ({ start: s.start, end: s.end, words: [{ text: s.text, start: s.start, end: s.end }] }))),
    [words, mode, interval],
  );
  const base = file?.name.replace(/\.[^.]+$/, '') ?? 'transcript';
  const go = async () => {
    if (!file) return;
    setWords([]);
    try {
      if (where === 'engine') {
        const j = await job.run('transcribe', transcribeForm(file, file.name, lang, model));
        setWords(j.data.words);
        job.log(`✓ ${j.data.words.length} words · language ${j.data.language}`);
      } else {
        setLocalBusy(true);
        job.log(`Transcribing on this PC (Whisper ${where}) — the model downloads once…`);
        const t0 = Date.now();
        const r = await transcribeLocal(file, where, lang);
        setWords(r.words);
        job.log(`✓ ${r.words.length} words in ${Math.round((Date.now() - t0) / 1000)} s (on this PC)`);
      }
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    } finally {
      setLocalBusy(false);
    }
  };
  const txt = () => lines.map((l) => `[${fmtSrtTime(l.start, '.').slice(3, 11)}] ${l.words.map((w) => w.text).join(' ')}`).join('\n');
  return (
    <ToolPage
      title="AI Transcript"
      subtitle="Transcribe audio or video to timecoded lines (control the interval) or word-level — on this PC, or with faster-whisper on your Colab."
      form={
        <>
          <FilePick accept="audio/*,video/*" onFiles={([f]) => setFile(f ?? null)} className="drop">
            <span className="icon">♪</span>
            <b>{file ? file.name : 'Drop audio or video'}</b>
          </FilePick>
          <span className="hint">Output</span>
          <Seg options={[['words', 'Word-level'], ['lines', 'Timecoded lines']] as const} value={mode} onChange={setMode} />
          {mode === 'lines' && <Slider label="Interval" value={interval} min={1} max={15} step={0.5} onChange={setGap} suffix="s" />}
          <Seg options={[['base', 'This PC · Fast'], ['small', 'This PC · Accurate'], ['engine', 'Colab engine']] as const} value={where} onChange={setWhere} />
          {localBusy && vision.label && <span className="hint">{vision.label} {Math.round(vision.value * 100)}%</span>}
          <div className="row">
            <Select label="Language" value={lang} options={WHISPER_LANGS} onChange={setLang} />
            {where === 'engine' && <Select label="Model" value={model} options={[['large-v3', 'large-v3 (best)'], ['large-v3-turbo', 'large-v3-turbo (fast)'], ['medium', 'medium'], ['small', 'small (fastest)']]} onChange={setModel} />}
          </div>
          <button className="btn primary lg" disabled={!file || job.busy || localBusy || (where === 'engine' && engine !== 'ready')} onClick={go}>{job.busy || localBusy ? 'Transcribing…' : 'Transcribe'}</button>
        </>
      }
      side={
        <Activity job={job}>
          {words.length > 0 && (
            <>
              <div className="row wrap">
                <button className="btn sm" onClick={() => download(new Blob([toSrt(lines)]), `${base}.srt`)}>⤓ .srt</button>
                <button className="btn sm" onClick={() => download(new Blob([toVtt(lines)]), `${base}.vtt`)}>⤓ .vtt</button>
                <button className="btn sm" onClick={() => download(new Blob([txt()]), `${base}.txt`)}>⤓ .txt</button>
                <button className="btn sm" onClick={() => download(new Blob([JSON.stringify({ words }, null, 1)]), `${base}.words.json`)}>⤓ .json (words)</button>
                {file?.type.startsWith('audio') && (
                  <button className="btn primary sm" onClick={async () => {
                    const p = await createProject({ name: base, voice: file, images: [], words });
                    navigate({ page: 'editor', id: p.id });
                  }}>Open in editor →</button>
                )}
              </div>
              <div className="transcript">
                {lines.slice(0, 600).map((l, i) => <div key={i}><code>{fmtSrtTime(l.start, '.').slice(3, 11)}</code> {l.words.map((w) => w.text).join(' ')}</div>)}
              </div>
            </>
          )}
        </Activity>
      }
    />
  );
}
