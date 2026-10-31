import { useEffect, useState } from 'react';
import { ToolPage } from './common';
import { FilePick, Select, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { listProjects, loadProject, saveProject, type ProjectMeta } from '../lib/db';
import { parseCaptionFile } from '../lib/captions';
import { STYLE_PRESETS, buildPrompt, splitScenes } from '../lib/scenes';
import { chatJson, useLlm } from '../lib/llm';
import { download, fmtTime } from '../lib/util';
import { newProject, normalizeProject } from '../lib/project';
import { navigate } from '../App';
import type { FlowScene, Word } from '../types';

/** Prompt file in the Flow Automator's format: one prompt per paragraph, separated by a blank line. */
export const toFlowTxt = (scenes: FlowScene[]) => scenes.map((s) => s.prompt.replace(/\s*\n\s*/g, ' ').trim()).join('\n\n') + '\n';

export function FlowBridge() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectId, setProjectId] = useState('');
  const [words, setWords] = useState<Word[]>([]);
  const [manual, setManual] = useState('');
  const [sceneLen, setSceneLen] = useState(5);
  const [style, setStyle] = useState(STYLE_PRESETS[0][0]);
  const [character, setCharacter] = useState('');
  const [aspectHint, setAspectHint] = useState('16:9');
  const [smart, setSmart] = useState(false);
  const [scenes, setScenes] = useState<FlowScene[]>([]);
  const [busy, setBusy] = useState('');
  const llm = useLlm((s) => s.status);

  useEffect(() => void listProjects().then(setProjects), []);
  useEffect(() => {
    if (!projectId) return;
    loadProject(projectId).then((p) => {
      if (!p) return;
      const pr = normalizeProject(p);
      setWords(pr.words.length ? pr.words : pr.lines.flatMap((l) => l.words));
      if (pr.flowScenes.length) setScenes(pr.flowScenes);
      setAspectHint(pr.export.aspect);
    });
  }, [projectId]);

  const build = async () => {
    let base: { start: number; text: string }[];
    if (manual.trim()) base = manual.split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean).map((text, i) => ({ start: i * sceneLen, text }));
    else base = splitScenes(words, sceneLen).map((s, i) => ({ start: i === 0 ? 0 : s.start, text: s.text }));
    if (!base.length) return toast('Choose a project with captions, load a transcript, or type prompts.', 'error');
    const framing = aspectHint === '9:16' ? 'vertical 9:16 composition' : aspectHint === '1:1' ? 'square composition' : 'wide 16:9 cinematic composition';
    let prompts = base.map((b) => buildPrompt(style, character, b.text));
    if (smart) {
      setBusy('Writing visual prompts with your LLM…');
      try {
        prompts = [];
        for (let k = 0; k < base.length; k += 15) {
          const chunk = base.slice(k, k + 15);
          const res = await chatJson<string[]>(
            `You write prompts for an AI image/video generator (Google Flow / Imagen / Veo). For each narration line write ONE vivid visual prompt (max 50 words): subject, action, setting, lighting, camera. No on-screen text, no real people's names. Style: ${style || 'cinematic'}. ${character ? `Recurring character (describe identically every time): ${character}.` : ''} ${framing}.`,
            `Narration lines:\n${chunk.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}\n\nReturn a JSON array of ${chunk.length} strings, in order.`,
            2500,
          );
          prompts.push(...chunk.map((c, i) => res[i] ?? buildPrompt(style, character, c.text)));
          setBusy(`Writing visual prompts… ${Math.min(base.length, k + 15)}/${base.length}`);
        }
      } catch (e) {
        toast(`LLM failed, using template prompts: ${(e as Error).message}`, 'error');
        prompts = base.map((b) => buildPrompt(style, character, b.text));
      } finally {
        setBusy('');
      }
    }
    setScenes(base.map((b, i) => ({ seq: i + 1, start: b.start, text: b.text, prompt: `${prompts[i]}, ${framing}` })));
  };

  const saveToProject = async () => {
    let p = projectId ? await loadProject(projectId) : undefined;
    if (!p) p = newProject('Flow storyboard');
    p = normalizeProject(p);
    p.flowScenes = scenes;
    p.updatedAt = Date.now();
    await saveProject(p);
    return p;
  };

  const exportFiles = async () => {
    download(new Blob([toFlowTxt(scenes)], { type: 'text/plain' }), 'flow_prompts.txt');
    download(new Blob([JSON.stringify({ scenes }, null, 1)], { type: 'application/json' }), 'scenes.json');
    const p = await saveToProject();
    setProjectId(p.id);
    toast('Prompts exported and scenes saved to the project', 'ok');
  };

  return (
    <ToolPage
      needsEngine={false}
      title="Google Flow bridge"
      subtitle="Turn your narration into Flow prompts, run them with the TryAIToday Flow Automator extension in your own browser, then drop the downloads back — each file lands on its scene automatically."
      form={
        <>
          <h4>1 · Scenes</h4>
          <Select label="From a project's captions" value={projectId} options={[['', '— none —'], ...projects.map((p) => [p.id, p.name] as [string, string])]} onChange={setProjectId} />
          <FilePick accept=".srt,.vtt,.json,.txt" className="drop slim" onFiles={async ([f]) => {
            if (!f) return;
            const r = parseCaptionFile(f.name, await f.text(), 0);
            setWords(r.words.length ? r.words : r.lines.flatMap((l) => l.words));
            toast(`Loaded ${f.name}`, 'ok');
          }}><Icon name="upload" /> …or load a transcript (.srt / .json / .txt)</FilePick>
          <p className="hint">{words.length ? `${words.length} timed words · ${fmtTime(words[words.length - 1].end)}` : 'No transcript loaded'}</p>
          <textarea rows={4} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type your own prompts, one per line (each = one scene)" />
          <Slider label="Seconds / scene" value={sceneLen} min={2} max={15} step={0.5} onChange={setSceneLen} suffix="s" />
          <h4>2 · Prompts</h4>
          <Select label="Visual style" value={style} options={STYLE_PRESETS} onChange={setStyle} />
          <label className="field"><span>Recurring character</span><input value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="e.g. an old fisherman with a white beard and yellow raincoat" /></label>
          <Toggle label={`Rewrite narration into visual prompts with the AI assistant${llm !== 'ready' ? ' (connect LLM first)' : ''}`} value={smart && llm === 'ready'} onChange={setSmart} />
          <button className="btn primary lg" disabled={!!busy} onClick={build}>{busy || 'Build scene prompts'}</button>
        </>
      }
      side={
        <>
          <h4>3 · Send to Flow</h4>
          {!scenes.length ? <p className="hint">Build the scene prompts first.</p> : (
            <>
              <div className="scene-list">
                {scenes.map((s, i) => (
                  <div key={s.seq} className="scene-row">
                    <code>{String(s.seq).padStart(3, '0')}</code>
                    <span className="hint">{fmtTime(s.start)}</span>
                    <textarea rows={2} value={s.prompt} onChange={(e) => setScenes((l) => l.map((x, k) => (k === i ? { ...x, prompt: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
              <button className="btn primary" onClick={exportFiles}><Icon name="download" /> Export flow_prompts.txt + scenes.json</button>
              <ol className="steps">
                <li>Open <b>flow.google.com</b> in Edge and the <b>TryAIToday Flow Automator</b> side panel.</li>
                <li>Drop <code>flow_prompts.txt</code> into its prompt box. Keep <b>File naming</b> on <code>001_v1, 001_v2…</code>.</li>
                <li>Run the queue — the extension downloads <code>001_v1.png</code>, <code>002_v1.png</code>… (images or Veo videos).</li>
                <li>Come back and click <b>Import Flow downloads</b>: drop the files (or the folder) and press <b>Map Flow files to scenes</b> in the review table.</li>
              </ol>
              <button className="btn" onClick={async () => {
                const p = await saveToProject();
                navigate({ page: 'editor', id: p.id });
              }}><Icon name="upload" /> Import Flow downloads →</button>
              <p className="hint">The scenes are saved in the project, so you can import later too. You can also drop <code>scenes.json</code> together with the images.</p>
            </>
          )}
        </>
      }
    />
  );
}
