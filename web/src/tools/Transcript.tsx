import { useMemo, useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Seg, Select, Slider } from '../components/ui';
import { download, fmtSrtTime } from '../lib/util';
import { linesByInterval, createProject } from '../lib/scenes';
import { toSrt, toVtt } from '../lib/captions';
import { navigate } from '../App';
import type { CaptionLine, Word } from '../types';

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
  const lines: CaptionLine[] = useMemo(
    () => (mode === 'words' ? words.map((w) => ({ start: w.start, end: w.end, words: [w] })) : linesByInterval(words, interval).map((s) => ({ start: s.start, end: s.end, words: [{ text: s.text, start: s.start, end: s.end }] }))),
    [words, mode, interval],
  );
  const base = file?.name.replace(/\.[^.]+$/, '') ?? 'transcript';
  const go = async () => {
    if (!file) return;
    setWords([]);
    try {
      const j = await job.run('transcribe', transcribeForm(file, file.name, lang, model));
      setWords(j.data.words);
      job.log(`✓ ${j.data.words.length} words · language ${j.data.language}`);
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    }
  };
  const txt = () => lines.map((l) => `[${fmtSrtTime(l.start, '.').slice(3, 11)}] ${l.words.map((w) => w.text).join(' ')}`).join('\n');
  return (
    <ToolPage
      title="AI Transcript"
      subtitle="Transcribe audio to timecoded lines (control the interval) or word-level, with faster-whisper on your Colab."
      form={
        <>
          <FilePick accept="audio/*,video/*" onFiles={([f]) => setFile(f ?? null)} className="drop">
            <span className="icon">♪</span>
            <b>{file ? file.name : 'Drop audio or video'}</b>
          </FilePick>
          <span className="hint">Output</span>
          <Seg options={[['words', 'Word-level'], ['lines', 'Timecoded lines']] as const} value={mode} onChange={setMode} />
          {mode === 'lines' && <Slider label="Interval" value={interval} min={1} max={15} step={0.5} onChange={setGap} suffix="s" />}
          <div className="row">
            <Select label="Language" value={lang} options={WHISPER_LANGS} onChange={setLang} />
            <Select label="Model" value={model} options={[['large-v3', 'large-v3 (best)'], ['large-v3-turbo', 'large-v3-turbo (fast)'], ['medium', 'medium'], ['small', 'small (fastest)']]} onChange={setModel} />
          </div>
          <button className="btn primary lg" disabled={!file || job.busy} onClick={go}>{job.busy ? 'Transcribing…' : 'Transcribe'}</button>
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
