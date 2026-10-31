import { useState } from 'react';
import { ToolPage, Activity, useJob } from './common';
import { FilePick, Seg, Select, Slider, Toggle } from '../components/ui';
import { engineFileUrl, fetchResult } from '../lib/engine';
import { download } from '../lib/util';
import { STYLE_PRESETS, buildPrompt, createProject, splitScenes, stampName } from '../lib/scenes';
import { parseCaptionFile } from '../lib/captions';
import { navigate } from '../App';

export type GenAspect = '16:9' | '9:16' | '1:1';
export type GenModel = 'lightning' | 'turbo';

export interface GenItem {
  prompt: string;
  name: string;
  t: number;
}

export function imageForm(items: GenItem[], o: { aspect: GenAspect; model: GenModel; steps: number; seed: number; smart: boolean; style: string; character: string }) {
  const f = new FormData();
  f.append('items', JSON.stringify(items));
  f.append('aspect', o.aspect);
  f.append('model', o.model);
  f.append('steps', String(o.steps));
  f.append('seed', String(o.seed));
  f.append('smart_prompts', o.smart ? '1' : '0');
  f.append('style', o.style);
  f.append('character', o.character);
  return f;
}

export function ImageGen() {
  const [src, setSrc] = useState<'prompts' | 'script'>('prompts');
  const [prompts, setPrompts] = useState('');
  const [items, setItems] = useState<GenItem[]>([]);
  const [scene, setScene] = useState(5);
  const [style, setStyle] = useState(STYLE_PRESETS[0][0]);
  const [character, setCharacter] = useState('');
  const [model, setModel] = useState<GenModel>('lightning');
  const [aspect, setAspect] = useState<GenAspect>('16:9');
  const [steps, setSteps] = useState(4);
  const [seed, setSeed] = useState(0);
  const [smart, setSmart] = useState(true);
  const [voice, setVoice] = useState<File | null>(null);
  const job = useJob();

  const loadScript = async ([f]: File[]) => {
    if (!f) return;
    const r = parseCaptionFile(f.name, await f.text(), 0);
    const words = r.words.length ? r.words : r.lines.flatMap((l) => l.words);
    setItems(splitScenes(words, scene).map((s) => ({ prompt: s.text, name: stampName(s.start, 'png'), t: s.start })));
  };
  const list: GenItem[] = src === 'prompts'
    ? prompts.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => ({ prompt: l, name: stampName(i * scene, 'png'), t: i * scene }))
    : items;

  const go = async () => {
    try {
      const final = smart ? list : list.map((x) => ({ ...x, prompt: buildPrompt(style, character, x.prompt) }));
      await job.run('imagegen', imageForm(final, { aspect, model, steps, seed, smart, style, character }));
      job.log('✓ Done');
    } catch (e) {
      job.log(`✗ ${(e as Error).message}`);
    }
  };
  const files = job.state?.files ?? [];
  const toProject = async () => {
    job.log('Downloading images…');
    const images = await Promise.all(files.map(async (f) => ({ blob: await fetchResult(f.url), name: f.name, t: list.find((x) => x.name === f.name)?.t ?? 0 })));
    const p = await createProject({ name: 'AI storyboard', voice: voice ?? undefined, images, aspect });
    navigate({ page: 'editor', id: p.id });
  };
  return (
    <ToolPage
      title="AI Images"
      subtitle="Generate a storyboard with SDXL-Lightning / SDXL-Turbo on your Colab. Files are named by timestamp, so they drop straight into the editor."
      form={
        <>
          <Seg options={[['prompts', 'Prompts'], ['script', 'From transcript']] as const} value={src} onChange={setSrc} />
          {src === 'prompts' ? (
            <textarea rows={8} value={prompts} onChange={(e) => setPrompts(e.target.value)} placeholder={'One prompt per line — each becomes one scene.\nA lighthouse on a stormy night\nAn old sailor smiling…'} />
          ) : (
            <>
              <FilePick accept=".srt,.vtt,.json,.txt" onFiles={loadScript} className="drop slim">⤒ Load a transcript (.srt / .json / .txt) — one image per scene</FilePick>
              {items.length > 0 && <p className="hint">{items.length} scenes</p>}
            </>
          )}
          <Slider label="Seconds per scene" value={scene} min={2} max={15} step={0.5} onChange={setScene} suffix="s" />
          <Select label="Style" value={style} options={STYLE_PRESETS} onChange={setStyle} />
          <label className="field"><span>Recurring character (keeps people consistent)</span><input value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="e.g. a young man with curly black hair, green hoodie" /></label>
          <div className="row">
            <Select label="Model" value={model} options={[['lightning', 'SDXL-Lightning (best, 1344px)'], ['turbo', 'SDXL-Turbo (fastest)']] as [GenModel, string][]} onChange={setModel} />
            <Select label="Aspect" value={aspect} options={[['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']] as [GenAspect, string][]} onChange={setAspect} />
            {model === 'turbo' && <Select label="Steps" value={steps} options={[1, 2, 3, 4]} onChange={setSteps} />}
          </div>
          <Slider label="Seed (0 = random)" value={seed} min={0} max={99999} step={1} onChange={setSeed} />
          <Toggle label="Smart prompts (rewrite narration into visual prompts with a local LLM)" value={smart} onChange={setSmart} />
          <button className="btn primary lg" disabled={!list.length || job.busy} onClick={go}>{job.busy ? 'Generating…' : `Generate ${list.length} image${list.length === 1 ? '' : 's'}`}</button>
        </>
      }
      side={
        <Activity job={job}>
          {files.length > 0 && (
            <>
              <div className="gallery">
                {files.map((f) => (
                  <a key={f.url} href={engineFileUrl(f.url)} target="_blank" rel="noreferrer" title={f.name}>
                    <img src={engineFileUrl(f.url)} loading="lazy" />
                    <span>{f.name}</span>
                  </a>
                ))}
              </div>
              <FilePick accept="audio/*" onFiles={([f]) => setVoice(f ?? null)} className="drop slim">{voice ? `🎙 ${voice.name}` : 'Optional: add the voiceover these images sync to'}</FilePick>
              <div className="row">
                <button className="btn" onClick={async () => {
                  for (const f of files) download(await fetchResult(f.url), f.name);
                }}>⤓ Download all</button>
                <button className="btn primary" disabled={job.busy} onClick={toProject}>Open in editor →</button>
              </div>
            </>
          )}
        </Activity>
      }
    />
  );
}
