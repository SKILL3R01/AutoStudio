import { useEffect, useMemo, useState } from 'react';
import { ToolPage } from './common';
import { Select } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { listProjects, loadProject, type ProjectMeta } from '../lib/db';
import { normalizeProject } from '../lib/project';
import { uid } from '../lib/util';
import {
  BUILTIN_TEMPLATES, PREFILL_LIMIT, TARGETS, VARIABLES, fillTemplate, isEdited, loadTemplates, projectVariables, saveTemplates, type PromptTemplate, type Target,
} from '../lib/prompts';
import type { Project } from '../types';

const VARS_KEY = 'promptVars';

/** Copy the prompt, then open the AI site (pre-filled when the site supports it and the prompt is short enough). */
export async function handOff(prompt: string, target: Target) {
  await navigator.clipboard.writeText(prompt).catch(() => {});
  const t = TARGETS[target];
  const prefill = t.prefill && prompt.length <= PREFILL_LIMIT;
  window.open(t.url(prefill ? prompt : ''), '_blank', 'noopener');
  toast(prefill ? `Opened ${t.label} with the prompt filled in (also copied)` : `Prompt copied — paste it into ${t.label} (Ctrl+V)`, 'ok');
}

export function PromptStudio() {
  const [templates, setTemplates] = useState<PromptTemplate[]>(loadTemplates);
  const [id, setId] = useState(templates[0].id);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectId, setProjectId] = useState(() => localStorage.getItem('promptProject') ?? '');
  const [project, setProject] = useState<Project>();
  const [vars, setVars] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem(VARS_KEY) ?? '{}'));
  const [editing, setEditing] = useState(false);
  const [final, setFinal] = useState<string | null>(null);

  useEffect(() => void listProjects().then(setProjects), []);
  useEffect(() => {
    localStorage.setItem('promptProject', projectId);
    if (!projectId) return setProject(undefined);
    void loadProject(projectId).then((p) => setProject(p ? normalizeProject(p) : undefined));
  }, [projectId]);
  useEffect(() => localStorage.setItem(VARS_KEY, JSON.stringify(vars)), [vars]);
  useEffect(() => setFinal(null), [id, projectId]);

  const t = templates.find((x) => x.id === id) ?? templates[0];
  const fromProject = useMemo(() => projectVariables(project), [project]);
  const allVars = { ...fromProject, ...Object.fromEntries(Object.entries(vars).filter(([, v]) => v.trim())) };
  const used = new Set([...t.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  const filled = fillTemplate(t.body, allVars);
  const prompt = final ?? filled;
  const missing = [...used].filter((k) => !allVars[k]?.trim() && !VARIABLES.find((v) => v.key === k)?.optional);

  const setBody = (body: string) => {
    const next = templates.map((x) => (x.id === t.id ? { ...x, body } : x));
    setTemplates(next);
    saveTemplates(next);
  };
  const newTemplate = () => {
    const nt: PromptTemplate = { id: uid(), name: 'My template', category: 'Script', description: 'Your own prompt', targets: ['claude', 'chatgpt', 'gemini'], body: 'Write about {{topic}} for {{audience}}.\n\n{{transcript}}', custom: true };
    const next = [...templates, nt];
    setTemplates(next);
    saveTemplates(next);
    setId(nt.id);
    setEditing(true);
  };
  const removeTemplate = () => {
    const next = templates.filter((x) => x.id !== t.id);
    setTemplates(next);
    saveTemplates(next);
    setId(next[0].id);
  };

  const groups = ['Script', 'Visuals', 'Growth'] as const;
  return (
    <ToolPage
      title="Prompt Studio"
      subtitle="Ready-made prompts for jobs that need a stronger AI. They are filled with your project, then sent to Claude, ChatGPT, Gemini or Google Flow — edit anything before sending."
      needsEngine={false}
      form={
        <>
          <Select label="Use project" value={projectId} options={[['', '— none —'], ...projects.map((p) => [p.id, p.name] as [string, string])]} onChange={setProjectId} />
          {project && <p className="hint">Fills in: title, transcript ({fromProject.transcript ? `${fromProject.transcript.split(' ').length} words` : 'no captions yet'}), scenes, length, aspect.</p>}
          <div className="prompt-list">
            {groups.map((g) => (
              <div key={g}>
                <h4>{g}</h4>
                {templates.filter((x) => x.category === g).map((x) => (
                  <button key={x.id} className={`prompt-item ${x.id === t.id ? 'on' : ''}`} onClick={() => (setId(x.id), setEditing(false))}>
                    <b>{x.name}{isEdited(x) ? ' ✎' : ''}{x.custom ? ' ★' : ''}</b>
                    <span className="hint">{x.description}</span>
                  </button>
                ))}
              </div>
            ))}
            <button className="btn sm ghost" onClick={newTemplate}><Icon name="plus" /> New template</button>
          </div>
        </>
      }
      side={
        <>
          <div className="row between">
            <h3>{t.name}</h3>
            <div className="row">
              <button className={`btn sm ${editing ? 'primary' : 'ghost'}`} onClick={() => setEditing(!editing)}><Icon name="text" /> {editing ? 'Done editing' : 'Edit template'}</button>
              {isEdited(t) && <button className="btn sm ghost" onClick={() => setBody(BUILTIN_TEMPLATES.find((b) => b.id === t.id)!.body)}>Reset</button>}
              {t.custom && <button className="btn sm ghost" onClick={removeTemplate}><Icon name="trash" /></button>}
            </div>
          </div>
          {editing && (
            <>
              {t.custom && (
                <div className="row">
                  <label className="field"><span>Name</span><input value={t.name} onChange={(e) => {
                    const next = templates.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x));
                    setTemplates(next);
                    saveTemplates(next);
                  }} /></label>
                  <Select label="Group" value={t.category} options={groups.map((g) => [g, g] as [typeof g, string])} onChange={(v) => {
                    const next = templates.map((x) => (x.id === t.id ? { ...x, category: v } : x));
                    setTemplates(next);
                    saveTemplates(next);
                  }} />
                </div>
              )}
              <textarea className="mono" rows={12} value={t.body} onChange={(e) => setBody(e.target.value)} />
              <p className="hint">Use <code>{'{{topic}}'}</code>, <code>{'{{transcript}}'}</code>, <code>{'{{scenes}}'}</code>… — available: {VARIABLES.map((v) => v.key).join(', ')}. Your edits are saved.</p>
            </>
          )}
          <div className="var-grid">
            {VARIABLES.filter((v) => used.has(v.key) && !v.multiline).map((v) => (
              <label key={v.key} className="field">
                <span>{v.label}{v.fromProject && fromProject[v.key] ? ' (project)' : ''}</span>
                <input value={vars[v.key] ?? ''} placeholder={fromProject[v.key] || v.hint} onChange={(e) => (setVars({ ...vars, [v.key]: e.target.value }), setFinal(null))} />
              </label>
            ))}
          </div>
          {missing.length > 0 && <p className="warn">Still empty: {missing.join(', ')} — fill them in{missing.some((k) => k === 'transcript' || k === 'scenes') ? ', or pick a project with captions' : ''}.</p>}
          <div className="row between"><h4>Prompt</h4><span className="hint">{prompt.length.toLocaleString()} characters{final !== null ? ' · edited' : ''}</span></div>
          <textarea rows={14} value={prompt} onChange={(e) => setFinal(e.target.value)} />
          <div className="row wrap">
            {(Object.keys(TARGETS) as Target[]).map((k) => (
              <button key={k} className={`btn sm ${t.targets[0] === k ? 'primary' : ''}`} onClick={() => void handOff(prompt, k)} title={TARGETS[k].prefill ? 'Opens with the prompt filled in' : 'Copies the prompt, then opens the site'}>
                <Icon name="link" /> {TARGETS[k].label}{t.targets.includes(k) && t.targets[0] === k ? ' (best)' : ''}
              </button>
            ))}
            <button className="btn sm ghost" onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Copied', 'ok'))}><Icon name="copy" /> Copy</button>
            {final !== null && <button className="btn sm ghost" onClick={() => setFinal(null)}>Undo my edits</button>}
          </div>
          {t.id === 'flow-images' && <p className="hint">Paste the answer into a text file and load it in the <a href="#tools/flow">Google Flow bridge</a> — it is already in the Flow Automator's format.</p>}
        </>
      }
    />
  );
}
