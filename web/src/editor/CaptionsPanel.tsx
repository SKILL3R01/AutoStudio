import { useEffect, useRef, useState } from 'react';
import { useEditor, projectLength } from '../store';
import { useLines, useProject } from './hooks';
import { FilePick, LogBox, Section, Seg, Select, Slider, Toggle } from '../components/ui';
import { CAPTION_FONTS, CAPTION_STYLES, drawCaptionLine, type CaptionStyle } from '../render/captions';
import { parseCaptionFile, spreadWords, toSrt, toVtt } from '../lib/captions';
import { runJob, useEngine } from '../lib/engine';
import { media } from '../render/media';
import { download } from '../lib/util';
import type { CaptionSettings, Word } from '../types';
import { toast } from '../components/Toast';

function StylePreview({ st, font }: { st: CaptionStyle; font: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const draw = () => {
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = '#2a2f3a';
      g.fillRect(0, 0, c.width, c.height);
      const words = [{ text: 'Big', start: 0, end: 0.5 }, { text: 'idea', start: 0.5, end: 1 }];
      const s: CaptionSettings = { enabled: true, mode: 'full', style: st.id, font, size: 5, position: 50, maxWords: 4, uppercase: false, wordLevel: true };
      drawCaptionLine(g, { start: 0, end: 1, words }, 0.8, s, c.width, c.height, st);
    };
    draw();
    void document.fonts.ready.then(draw);
  }, [st, font]);
  return <canvas ref={ref} width={160} height={90} />;
}

/** Replace caption text while keeping timings where possible. */
function retime(words: Word[], text: string): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === words.length) return words.map((w, i) => ({ ...w, text: tokens[i] }));
  if (!words.length) return [];
  return spreadWords(tokens.join(' '), words[0].start, words[words.length - 1].end);
}

export function CaptionsPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const lines = useLines();
  const engine = useEngine((s) => s.status);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState('auto');
  const [editing, setEditing] = useState(false);
  const c = p.captions;
  const set = (fn: (c: CaptionSettings) => void, key?: string) => update((d) => fn(d.captions), key);

  const transcribe = async () => {
    if (!p.voiceover) return toast('Add a voiceover first (Audio panel).', 'error');
    setBusy(true);
    setLog(['Uploading voiceover…']);
    try {
      const blob = await media.blob(p.voiceover.assetId);
      const f = new FormData();
      f.append('file', blob!, 'voiceover.wav');
      f.append('mode', 'words');
      f.append('language', lang);
      const job = await runJob('transcribe', f, (j) => setLog(j.logs));
      const words: Word[] = job.data.words;
      update((d) => {
        d.words = words;
        d.lines = [];
        d.captions.enabled = true;
        d.captions.wordLevel = true;
      });
      setLog((l) => [...l, `✓ ${words.length} words`]);
    } catch (e) {
      setLog((l) => [...l, `✗ ${(e as Error).message}`]);
    } finally {
      setBusy(false);
    }
  };

  const upload = async ([f]: File[]) => {
    if (!f) return;
    try {
      const r = parseCaptionFile(f.name, await f.text(), projectLength(p));
      update((d) => {
        d.words = r.words;
        d.lines = r.lines;
        d.captions.enabled = true;
        d.captions.wordLevel = r.wordLevel;
      });
    } catch (e) {
      toast(`Could not read ${f.name}: ${(e as Error).message}`, 'error');
    }
  };

  const allText = (p.words.length ? p.words : p.lines.flatMap((l) => l.words)).map((w) => w.text).join(' ');
  return (
    <>
      <Section title="Captions source">
        <button className="btn" disabled={busy || engine !== 'ready'} onClick={transcribe}>✨ Transcribe audio → word-level</button>
        <Select label="Language" value={lang} options={[['auto', 'Auto-detect'], 'en', 'ar', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'ur', 'hi', 'ru', 'ja', 'zh']} onChange={setLang} />
        {engine !== 'ready' && <p className="hint">Connect the Colab engine to transcribe, or upload a script below.</p>}
        <p className="hint center">or upload a script</p>
        <FilePick accept=".srt,.vtt,.json,.txt" onFiles={upload} className="btn">⤒ Upload timestamped script</FilePick>
        <p className="hint">An .srt, .vtt, .json (word-level), or timestamped .txt. A word-level file (one word per SRT cue, or our transcript JSON) unlocks the animated styles; a plain transcript uses the basic styles.</p>
        {log.length > 0 && <LogBox lines={log} />}
        <p className="hint">{p.words.length ? `${p.words.length} timed words` : p.lines.length ? `${p.lines.length} timed lines` : 'No captions yet.'}</p>
        {allText && (
          <>
            <button className="btn sm ghost" onClick={() => setEditing(!editing)}>{editing ? 'Done editing' : '✎ Fix typos in transcript'}</button>
            {editing && (
              <textarea rows={6} defaultValue={allText} onBlur={(e) => update((d) => {
                if (d.words.length) d.words = retime(d.words, e.target.value);
                else {
                  const flat = retime(d.lines.flatMap((l) => l.words), e.target.value);
                  d.words = flat;
                  d.lines = [];
                }
              })} />
            )}
            <div className="row">
              <button className="btn sm ghost" onClick={() => download(new Blob([toSrt(lines)]), `${p.name}.srt`)}>⤓ .srt</button>
              <button className="btn sm ghost" onClick={() => download(new Blob([toVtt(lines)]), `${p.name}.vtt`)}>⤓ .vtt</button>
              <button className="btn sm ghost" onClick={() => download(new Blob([JSON.stringify({ words: p.words.length ? p.words : lines.flatMap((l) => l.words) }, null, 1)]), `${p.name}.words.json`)}>⤓ .json</button>
              <button className="btn sm ghost" onClick={() => update((d) => ((d.words = []), (d.lines = [])))}>Clear</button>
            </div>
          </>
        )}
      </Section>
      <Section title="Style">
        <Toggle label="Show captions" value={c.enabled} onChange={(v) => set((x) => void (x.enabled = v))} />
        <Toggle label="Word-level highlight" value={c.wordLevel} onChange={(v) => set((x) => void (x.wordLevel = v))} />
        <div className="styles">
          {CAPTION_STYLES.map((st) => (
            <button key={st.id} className={`style ${c.style === st.id ? 'on' : ''}`} onClick={() => set((x) => void (x.style = st.id))}>
              <StylePreview st={st} font={c.font} />
              <span>{st.name}</span>
            </button>
          ))}
        </div>
        <Select label="Font" value={c.font} options={[['', 'Style default'], ...CAPTION_FONTS.map((f) => [f, f] as [string, string])]} onChange={(v) => set((x) => void (x.font = v))} />
        <span className="hint">Vertical position (100% = top, 0% = bottom)</span>
        <Seg options={[[15, 'Top'], [50, 'Middle'], [82, 'Bottom']] as const} value={c.position as 15} onChange={(v) => set((x) => void (x.position = v))} />
        <Slider label="Position" value={100 - c.position} min={0} max={100} step={1} onChange={(v) => set((x) => void (x.position = 100 - v), 'cpos')} suffix="%" />
        <span className="hint">Size</span>
        <Seg options={[[0.75, 'Small'], [1, 'Medium'], [1.35, 'Large']] as const} value={c.size as 1} onChange={(v) => set((x) => void (x.size = v))} />
        <Slider label="Scale" value={c.size} min={0.4} max={2.5} onChange={(v) => set((x) => void (x.size = v), 'csize')} />
        <Slider label="Max words / line" value={c.maxWords} min={1} max={12} step={1} onChange={(v) => set((x) => void (x.maxWords = v), 'cmw')} />
        <Toggle label="UPPERCASE" value={c.uppercase} onChange={(v) => set((x) => void (x.uppercase = v))} />
      </Section>
    </>
  );
}
