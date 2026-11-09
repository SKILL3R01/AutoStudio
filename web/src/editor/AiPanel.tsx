import { ensureTrack, newAudioClip } from '../lib/audiotracks';
import { useState } from 'react';
import { useEditor, clipEnd, findAsset } from '../store';
import { useProject } from './hooks';
import { Progress, Section, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { useVision } from '../ai/vision';
import { makeDepthAsset } from '../ai/jobs';
import { navigate } from '../App';
import { confirmHeavyAi } from '../lib/perf';
import { chat, chatJson, useLlm } from '../lib/llm';
import { MOTIONS, TRANSITIONS, type Motion, type Transition } from '../types';
import { SFX } from '../audio/sfx';
import { spreadWords } from '../lib/captions';
import { uid } from '../lib/util';

export function AiPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const vision = useVision();
  const llm = useLlm((s) => s.status);
  const [depthProg, setDepthProg] = useState<[number, number] | null>(null);
  const [setMotion, setSetMotion] = useState(true);
  const [busy, setBusy] = useState('');
  const [meta, setMeta] = useState('');
  const missing = p.clips.filter((c) => !c.depthId);

  const depthAll = async () => {
    if (!confirmHeavyAi()) return;
    setDepthProg([0, missing.length]);
    try {
      for (const [i, c] of missing.entries()) {
        const a = findAsset(useEditor.getState().project!, c.assetId);
        const d = a && (await makeDepthAsset(c, a));
        if (d) update((pr) => {
          pr.assets.push(d);
          const cl = pr.clips.find((x) => x.id === c.id);
          if (cl) {
            cl.depthId = d.id;
            if (setMotion && !cl.motion.startsWith('parallax') && cl.motion !== 'dollyZoom') cl.motion = i % 3 === 2 ? 'parallaxOrbit' : 'parallaxZoom';
          }
        });
        setDepthProg([i + 1, missing.length]);
      }
      toast('Depth maps ready', 'ok');
    } catch (e) {
      toast(`Depth failed: ${(e as Error).message}`, 'error');
    } finally {
      setDepthProg(null);
    }
  };

  const scriptFor = (i: number) => {
    const s = i === 0 ? 0 : p.clips[i].start, e = clipEnd(p, i);
    const ws = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
    return ws.filter((w) => w.start >= s && w.start < e).map((w) => w.text).join(' ');
  };

  const autoEdit = async () => {
    setBusy('Planning the edit…');
    try {
      const scenes = p.clips.map((_, i) => `${i}: ${scriptFor(i) || '(no narration)'}`).join('\n');
      const plan = await chatJson<{ i: number; motion?: Motion; transition?: Transition; sfx?: string }[]>(
        `You are a video editor for faceless YouTube videos. For each scene choose a camera motion from [${MOTIONS.filter((m) => m !== 'random' && m !== 'alternate').join(', ')}], a transition INTO it from [${TRANSITIONS.filter((t) => t !== 'random').join(', ')}], and optionally a sound effect from [${SFX.join(', ')}] when the line is dramatic. Vary choices, keep calm scenes calm, use punchy cuts for intense lines. Only use 3D motions sparingly.`,
        `Scenes (index: narration):\n${scenes}\n\nReturn a JSON array: [{"i":0,"motion":"zoomIn","transition":"none"},{"i":1,"motion":"panLeft","transition":"crossfade","sfx":"whoosh"}]`,
        3000,
      );
      update((d) => {
        d.audio = d.audio.filter((s) => !s.id.startsWith('ai_'));
        const sfxTrack = ensureTrack(d, 'sfx');
        for (const s of plan) {
          const c = d.clips[s.i];
          if (!c) continue;
          if (s.motion && MOTIONS.includes(s.motion)) c.motion = s.motion;
          if (s.transition && TRANSITIONS.includes(s.transition) && s.i > 0) c.transition = s.transition;
          if (s.sfx && (SFX as readonly string[]).includes(s.sfx)) d.audio.push(newAudioClip(sfxTrack, '', Math.max(0, (s.i === 0 ? 0 : c.start) - 0.2), 1.2, 'sfx', { id: 'ai_' + uid(), sound: s.sfx, volume: 0.5 }));
        }
      });
      toast(`Applied AI edit to ${plan.length} scenes`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const fixCaptions = async () => {
    setBusy('Proofreading captions…');
    try {
      const ws = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
      const text = ws.map((w) => w.text).join(' ');
      const fixed = await chat([
        { role: 'system', content: 'Fix spelling, punctuation and obvious transcription mistakes in this voiceover transcript. Keep the same words and order wherever possible — do not rephrase, summarise or add text. Reply with the corrected transcript only.' },
        { role: 'user', content: text },
      ], { maxTokens: Math.min(6000, text.length), temperature: 0.1 });
      const tokens = fixed.split(/\s+/).filter(Boolean);
      update((d) => {
        if (tokens.length === ws.length) d.words = ws.map((w, i) => ({ ...w, text: tokens[i] }));
        else d.words = spreadWords(fixed, ws[0].start, ws[ws.length - 1].end);
        d.lines = [];
      });
      toast(tokens.length === ws.length ? 'Captions corrected (timings kept)' : 'Captions corrected (re-timed)', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const writeMeta = async () => {
    setBusy('Writing title & description…');
    try {
      const text = (p.words.length ? p.words : p.lines.flatMap((l) => l.words)).map((w) => w.text).join(' ').slice(0, 6000);
      setMeta(await chat([
        { role: 'system', content: 'You write YouTube upload metadata. Give: 5 title options (max 70 chars, curiosity-driven), a 2-paragraph description with a hook, 3 chapter ideas, and 15 hashtags.' },
        { role: 'user', content: text || p.name },
      ], { maxTokens: 900, temperature: 0.8 }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Section title="3D depth (in your browser)" hint="Depth Anything V2 estimates how far every pixel is. Used by the 3D motions and by object effects. Runs locally — first use downloads ~50 MB.">
        <p className="hint">{missing.length} of {p.clips.length} clips need a depth map{vision.device ? ` · running on ${vision.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WASM)'}` : ''}</p>
        <Toggle label="Switch those clips to a 3D motion" value={setMotion} onChange={setSetMotion} />
        {depthProg ? <Progress value={depthProg[0] / Math.max(1, depthProg[1])} label={vision.label ? `${vision.label} ${Math.round(vision.value * 100)}%` : `Depth ${depthProg[0]}/${depthProg[1]}`} /> : (
          <button className="btn primary" disabled={!missing.length} onClick={depthAll}><Icon name="depth" /> Generate depth for all clips</button>
        )}
        <p className="hint">To animate a detail (water, fire, hair, eyes…), select a clip and use <b>Animate a detail</b> in Properties.</p>
      </Section>
      <Section title="AI assistant" hint="Uses your local LLM (LM Studio / Ollama) or the Colab Qwen model.">
        {llm !== 'ready' && <p className="warn">Not connected — click <b>Connect LLM</b> in the top bar.</p>}
        <button className="btn" disabled={llm !== 'ready' || !!busy || !p.clips.length} onClick={autoEdit}><Icon name="wand" /> Auto-edit: motion, transitions & SFX per scene</button>
        <button className="btn" disabled={llm !== 'ready' || !!busy || !(p.words.length || p.lines.length)} onClick={fixCaptions}><Icon name="captions" /> Proofread captions</button>
        <button className="btn" disabled={llm !== 'ready' || !!busy} onClick={writeMeta}><Icon name="text" /> Title, description & hashtags</button>
        {busy && <p className="hint">{busy}</p>}
        {meta && <textarea rows={12} value={meta} onChange={(e) => setMeta(e.target.value)} />}
        <p className="hint">Keyword picking and scene prompts use the assistant too (Keywords panel, AI Images, Flow bridge).</p>
      </Section>
      <Section title="Prompt Studio" hint="For bigger jobs, send a ready-made prompt (filled with this project) to Claude, ChatGPT, Gemini or Google Flow.">
        <button className="btn" onClick={() => (localStorage.setItem('promptProject', p.id), navigate({ page: 'tool', tool: 'prompts' }))}><Icon name="wand" /> Open Prompt Studio for this project</button>
      </Section>
    </>
  );
}
