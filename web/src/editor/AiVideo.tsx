import { useState } from 'react';
import { useEditor, clipEnd } from '../store';
import { clipStill } from '../ai/jobs';
import { engineHas, fetchResult, runJob, useEngine } from '../lib/engine';
import { chat, useLlm } from '../lib/llm';
import { probe } from '../lib/project';
import { Section, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import type { Asset, Clip, Project } from '../types';

const ASPECT: Record<string, string> = { '16:9': '16:9', '9:16': '9:16', '1:1': '1:1', '4:5': '4:5' };

/** Narration spoken while the clip is on screen. */
export function narrationFor(p: Project, i: number): string {
  const s = i === 0 ? 0 : p.clips[i].start, e = clipEnd(p, i);
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  return words.filter((w) => w.start >= s - 0.1 && w.start < e).map((w) => w.text).join(' ');
}

/** Turn a still clip into a short AI video (Wan 2.1 on the Colab engine) that starts on the same image. */
export function AiVideoSection({ clip, i, asset }: { clip: Clip; i: number; asset: Asset }) {
  const p = useEditor((s) => s.project!);
  const update = useEditor((s) => s.update);
  const engine = useEngine((s) => s.status);
  const kind = useEngine((s) => s.kind);
  const llm = useLlm((s) => s.status);
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState(3);
  const [steps, setSteps] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const narration = narrationFor(p, i);
  const available = engine === 'ready' && engineHas('videogen');

  const write = async () => {
    setBusy('Writing a motion prompt…');
    try {
      setPrompt(await chat([
        { role: 'system', content: 'You write prompts for an image-to-video model. Describe the motion that should happen in this scene in one or two sentences: subject movement, camera move, atmosphere (wind, light, particles). No text on screen. Keep the scene as it is — only add motion.' },
        { role: 'user', content: `Narration for this scene: "${narration || p.name}"` },
      ], { maxTokens: 120, temperature: 0.7 }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('Starting…');
    setLog([]);
    try {
      const still = await clipStill(clip, asset);
      if (!still) throw new Error('Could not read the image');
      const f = new FormData();
      f.append('image', still, `${asset.name.replace(/\.[^.]+$/, '')}.png`);
      f.append('prompt', prompt || `Subtle natural motion, slow cinematic camera push-in. ${narration}`.slice(0, 400));
      f.append('aspect', ASPECT[p.export.aspect] ?? '16:9');
      f.append('seconds', String(seconds));
      f.append('steps', String(steps));
      f.append('name', asset.name);
      const job = await runJob('videogen', f, (j) => (setLog(j.logs.slice(-4)), setBusy(`Generating… ${Math.round(j.progress * 100)}%`)));
      const blob = await fetchResult(job.files[0].url);
      const video = await probe(blob, job.files[0].name, 'video');
      update((d) => {
        d.assets.push(video);
        const c = d.clips.find((x) => x.id === clip.id)!;
        c.assetId = video.id;
        c.trimIn = 0;
        c.trimOut = undefined;
        c.loop = true;
        c.volume = 0;
      });
      toast(`AI video added (${seconds}s, loops to fill the clip) — Undo brings the image back`, 'ok');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Animate with AI (Colab)" hint="Real motion from the Wan 2.1 video model: the image becomes the first frame. Free, no watermark.">
      {engine !== 'ready' && <p className="hint">Connect the <b>AutoStudio engine</b> (top right) to use this.</p>}
      {engine === 'ready' && kind === 'tryai' && <p className="warn">The TryAIToday engine has no video model — connect the AutoStudio engine.</p>}
      <textarea rows={3} value={prompt} placeholder={`What should move? e.g. "leaves sway in the wind, slow push-in"${narration ? `\nNarration: ${narration.slice(0, 120)}` : ''}`} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row wrap">
        <button className="btn sm ghost" disabled={llm !== 'ready' || !!busy} onClick={write} title={llm !== 'ready' ? 'Connect the LLM in the top bar' : ''}><Icon name="wand" /> Write prompt from narration</button>
      </div>
      <Slider label="Length" value={seconds} min={1} max={5} step={0.5} onChange={setSeconds} suffix="s" />
      <Slider label="Quality steps" value={steps} min={10} max={40} step={1} onChange={setSteps} />
      <p className="hint">On a free T4 expect several minutes per clip (more steps = better and slower). The first run downloads ~18 GB of model files.</p>
      <button className="btn primary sm" disabled={!available || !!busy} onClick={generate}><Icon name="film" /> {busy ?? 'Generate AI video'}</button>
      {log.length > 0 && <pre className="log mini">{log.join('\n')}</pre>}
    </Section>
  );
}
