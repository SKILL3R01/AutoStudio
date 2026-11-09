import { useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { FilePick, Section, Seg, Select, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { chat, useLlm } from '../lib/llm';
import { uid } from '../lib/util';
import { BUILTIN_SHADERS, compileShader } from '../render/shaderfx';
import { PARTICLE_PRESETS, type ParticleSpec, type Shape, type Emitter } from '../render/particles';
import type { CustomEffect } from '../types';

const STARTER = `vec4 effect(vec2 uv, vec4 frame) {
  // uv: 0..1 (top-left = 0,0). frame: the video pixel. u_time, u_amount, u_p1..u_p4 are available,
  // plus hash(), noise(), fbm() and frameAt(uv).
  float glow = fbm(uv * 4.0 + u_time * 0.2) * u_amount;
  return vec4(frame.rgb + vec3(0.2, 0.5, 1.0) * glow * 0.6, 1.0);
}`;

const AI_SYSTEM = `You write GLSL ES 3.0 fragment shader effects for a video editor. Output ONLY one function, no prose, no markdown:
vec4 effect(vec2 uv, vec4 frame) { ... }
uv is 0..1 with (0,0) at the TOP-left (so the bottom of the screen is uv.y = 1.0). frame is the video pixel at uv.
Available: uniforms float u_time (seconds), float u_amount (0..1 intensity), float u_p1..u_p4 (0..1 user sliders), vec2 u_res (pixels);
functions float hash(vec2), float noise(vec2), float fbm(vec2), vec4 frameAt(vec2 uv).
Rules: keep the video visible (blend over frame.rgb), scale the effect by u_amount, loops at most 64 iterations, no texture() other than frameAt, return alpha 1.0.`;

/** Strip markdown fences / chatter around a GLSL answer. */
export function extractShader(text: string): string {
  const fenced = text.match(/```(?:glsl|c|cpp)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const i = fenced.indexOf('vec4 effect(');
  if (i < 0) return fenced.trim();
  let depth = 0, end = -1;
  for (let k = fenced.indexOf('{', i); k < fenced.length; k++) {
    if (fenced[k] === '{') depth++;
    else if (fenced[k] === '}' && --depth === 0) {
      end = k + 1;
      break;
    }
  }
  return fenced.slice(i, end > 0 ? end : undefined).trim();
}

/** "My effects": saved effects available in every project (localStorage), with file import / export. */
const LIB_KEY = 'myEffects';
export const loadLibrary = (): CustomEffect[] => JSON.parse(globalThis.localStorage?.getItem(LIB_KEY) ?? '[]');
const saveLibrary = (l: CustomEffect[]) => localStorage.setItem(LIB_KEY, JSON.stringify(l));

export function EffectsLab() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const llm = useLlm((s) => s.status);
  const [edit, setEdit] = useState<CustomEffect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const list = p.customEffects ?? [];
  const [library, setLibrary] = useState<CustomEffect[]>(loadLibrary);
  const toLibrary = (c: CustomEffect) => {
    const next = [structuredClone(c), ...library.filter((x) => x.id !== c.id)];
    setLibrary(next);
    saveLibrary(next);
  };
  const removeFromLibrary = (id: string) => {
    const next = library.filter((x) => x.id !== id);
    setLibrary(next);
    saveLibrary(next);
  };
  const exportLibrary = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ autostudioEffects: 1, effects: library }, null, 1)], { type: 'application/json' }));
    a.download = 'my-effects.autostudio-fx.json';
    a.click();
  };
  const importLibrary = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const got: CustomEffect[] = (j.effects ?? []).filter((x: CustomEffect) => x && x.id && x.name && (x.code || x.particles));
      const next = [...got, ...library.filter((x) => !got.some((g) => g.id === x.id))];
      setLibrary(next);
      saveLibrary(next);
      toast(`Imported ${got.length} effect${got.length === 1 ? '' : 's'}`, 'ok');
    } catch {
      toast('That file is not an AutoStudio effects file', 'error');
    }
  };

  const save = (c: CustomEffect, apply = true) => update((d) => {
    d.customEffects = [...(d.customEffects ?? []).filter((x) => x.id !== c.id), c];
    if (apply && !d.effects.some((e) => e.customId === c.id)) d.effects.push({ kind: 'custom', customId: c.id, intensity: 0.7, scope: { kind: 'all' }, params: [0.5, 0.5, 0.5, 0.5] });
  });
  const checkCode = (code: string) => setError(compileShader(code));
  const newShader = (code = STARTER, name = 'My shader') => (setEdit({ id: uid(), name, kind: 'shader', code }), checkCode(code));
  const newParticles = (preset = 'sparks') => setEdit({ id: uid(), name: `My ${PARTICLE_PRESETS[preset].label.toLowerCase()}`, kind: 'particles', particles: structuredClone(PARTICLE_PRESETS[preset].spec) });

  const writeWithAi = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    try {
      let code = extractShader(await chat([{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: `Effect: ${desc}` }], { maxTokens: 900, temperature: 0.4 }));
      let err = compileShader(code);
      if (err) {
        // One repair round with the compiler message.
        code = extractShader(await chat([{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: `Effect: ${desc}\n\nYour previous shader failed to compile:\n${err}\n\n${code}\n\nReturn the fixed function only.` }], { maxTokens: 900, temperature: 0.2 }));
        err = compileShader(code);
      }
      setEdit({ id: uid(), name: desc.slice(0, 40), kind: 'shader', code });
      setError(err);
      toast(err ? 'The AI shader has an error — see below, or try again' : 'Shader written — preview it, then Save', err ? 'error' : 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const copyPrompt = () => void navigator.clipboard.writeText(`${AI_SYSTEM}\n\nEffect: ${desc || '(describe the effect)'}`).then(() => toast('Prompt copied — paste it into Claude or Gemini, then paste the answer into the code box', 'ok'));
  const setSpec = (fn: (s: ParticleSpec) => void) => edit?.particles && setEdit({ ...edit, particles: (() => { const s = { ...edit.particles! }; fn(s); return s; })() });

  return (
    <Section title="Effects lab" hint="Make your own effects: a particle system with sliders, or a GPU shader written by you or the AI. Saved in the project.">
      {list.map((c) => (
        <div key={c.id} className="row between card-row">
          <span><Icon name={c.kind === 'shader' ? 'bolt' : 'effects'} size={13} /> {c.name}</span>
          <div className="row">
            <button className="btn sm ghost" onClick={() => (setEdit(structuredClone(c)), c.code && checkCode(c.code))}>Edit</button>
            <button className="icon-btn" title="Delete" onClick={() => update((d) => ((d.customEffects = (d.customEffects ?? []).filter((x) => x.id !== c.id)), (d.effects = d.effects.filter((e) => e.customId !== c.id))))}><Icon name="trash" size={13} /></button>
          </div>
        </div>
      ))}
      {!edit && library.length > 0 && (
        <div className="card">
          <b>My effects <span className="hint">(every project)</span></b>
          {library.map((c) => (
            <div key={c.id} className="row between card-row">
              <span><Icon name={c.kind === 'shader' ? 'bolt' : 'effects'} size={13} /> {c.name}</span>
              <div className="row">
                {!list.some((x) => x.id === c.id) && <button className="btn sm ghost" onClick={() => save(structuredClone(c))}>Add</button>}
                <button className="btn sm ghost" onClick={() => {
                  const name = prompt('Rename effect', c.name);
                  if (name) toLibrary({ ...c, name });
                }}>Rename</button>
                <button className="icon-btn" title="Remove from My effects" onClick={() => confirm(`Remove “${c.name}” from My effects?`) && removeFromLibrary(c.id)}><Icon name="trash" size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!edit && (
        <>
          <div className="row wrap">
            <button className="btn sm ghost" disabled={!library.length} onClick={exportLibrary}><Icon name="download" /> Export my effects</button>
            <FilePick accept=".json" className="btn sm ghost" onFiles={([f]) => f && importLibrary(f)}><Icon name="upload" /> Import</FilePick>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => newParticles()}><Icon name="plus" /> Particles</button>
            <button className="btn sm" onClick={() => newShader()}><Icon name="plus" /> Code shader</button>
            <button className="btn sm ghost" onClick={() => newShader(BUILTIN_SHADERS.fire, 'My fire')}>Start from Fire</button>
          </div>
          <label className="field"><span>Describe an effect for the AI</span><input value={desc} placeholder="e.g. blue fire rising from the bottom, gentle snow of light" onChange={(e) => setDesc(e.target.value)} /></label>
          <div className="row wrap">
            <button className="btn sm primary" disabled={busy || llm !== 'ready' || !desc.trim()} onClick={writeWithAi}><Icon name="wand" /> {busy ? 'Writing…' : 'Write with my AI assistant'}</button>
            <button className="btn sm ghost" onClick={copyPrompt}><Icon name="copy" /> Copy prompt for Claude</button>
          </div>
          {llm !== 'ready' && <p className="hint">Connect an AI assistant (Settings → AI connections), or copy the prompt to Claude / Gemini and paste the answer into a Code shader.</p>}
        </>
      )}
      {edit && (
        <div className="card">
          <label className="field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          {edit.kind === 'shader' ? (
            <>
              <textarea className="code" rows={14} spellCheck={false} value={edit.code} onChange={(e) => (setEdit({ ...edit, code: e.target.value }), checkCode(e.target.value))} />
              {error ? <pre className="warn code-err">{error}</pre> : <p className="hint ok">✓ Compiles — it runs on the GPU; a broken shader is skipped, never breaks export.</p>}
              <p className="hint">Sliders u_p1–u_p4 appear on the effect card after saving.</p>
            </>
          ) : edit.particles && (
            <>
              <Select label="Start from" value="" options={[['', '—'], ...Object.entries(PARTICLE_PRESETS).map(([k, v]) => [k, v.label] as [string, string])]} onChange={(v) => v && setEdit({ ...edit, particles: structuredClone(PARTICLE_PRESETS[v].spec) })} />
              <Select label="Emitter" value={edit.particles.emitter} options={[['bottom', 'Bottom edge'], ['top', 'Top edge'], ['left', 'Left edge'], ['right', 'Right edge'], ['area', 'Whole frame'], ['center', 'Centre burst']] as [Emitter, string][]} onChange={(v) => setSpec((s) => void (s.emitter = v))} />
              <Select label="Shape" value={edit.particles.shape} options={[['dot', 'Dot'], ['spark', 'Spark'], ['streak', 'Streak'], ['heart', 'Heart'], ['star', 'Star'], ['square', 'Confetti'], ['smoke', 'Smoke puff']] as [Shape, string][]} onChange={(v) => setSpec((s) => void (s.shape = v))} />
              <Slider label="Count" value={edit.particles.count} min={5} max={300} step={1} onChange={(v) => setSpec((s) => void (s.count = v))} />
              <Slider label="Life" value={edit.particles.life} min={0.3} max={10} step={0.1} onChange={(v) => setSpec((s) => void (s.life = v))} suffix="s" />
              <Slider label="Speed" value={edit.particles.speed} min={0} max={1.5} step={0.01} onChange={(v) => setSpec((s) => void (s.speed = v))} />
              <Slider label="Direction" value={edit.particles.direction} min={0} max={359} step={1} onChange={(v) => setSpec((s) => void (s.direction = v))} suffix="°" />
              <Slider label="Spread" value={edit.particles.spread} min={0} max={180} step={1} onChange={(v) => setSpec((s) => void (s.spread = v))} suffix="°" />
              <Slider label="Gravity" value={edit.particles.gravity} min={-0.5} max={1} step={0.01} onChange={(v) => setSpec((s) => void (s.gravity = v))} />
              <Slider label="Wind" value={edit.particles.wind} min={-0.3} max={0.3} step={0.01} onChange={(v) => setSpec((s) => void (s.wind = v))} />
              <Slider label="Size" value={edit.particles.size} min={0.1} max={30} step={0.1} onChange={(v) => setSpec((s) => void (s.size = v))} />
              <Slider label="End size" value={edit.particles.sizeEnd} min={0} max={30} step={0.1} onChange={(v) => setSpec((s) => void (s.sizeEnd = v))} />
              <Slider label="Glow" value={edit.particles.glow} min={0} max={1} onChange={(v) => setSpec((s) => void (s.glow = v))} />
              <Slider label="Spin" value={edit.particles.spin} min={0} max={8} step={0.1} onChange={(v) => setSpec((s) => void (s.spin = v))} />
              <Seg options={[['add', 'Glowing (add)'], ['normal', 'Solid']] as const} value={edit.particles.blend} onChange={(v) => setSpec((s) => void (s.blend = v))} />
              <div className="row wrap">
                {edit.particles.colors.map((c, i) => <input key={i} type="color" value={c.startsWith('#') ? c : '#ffffff'} onChange={(e) => setSpec((s) => void (s.colors = s.colors.map((x, k) => (k === i ? e.target.value : x))))} />)}
                <button className="btn sm ghost" onClick={() => setSpec((s) => void (s.colors = [...s.colors, '#ffffff']))}>+ colour</button>
              </div>
            </>
          )}
          <div className="row">
            <button className="btn sm primary" disabled={edit.kind === 'shader' && !!error} onClick={() => (save(edit), toLibrary(edit), setEdit(null), toast('Saved to My effects (every project) and added here', 'ok'))}><Icon name="check" /> Save & apply</button>
            <button className="btn sm ghost" onClick={() => (save(edit, false), toast('Preview updated', 'info'))} disabled={edit.kind === 'shader' && !!error}>Update preview</button>
            <button className="btn sm ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}
