import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { HistoryDialog } from './HistoryDialog';
import { deleteProject, duplicateProject, exportProjectFile, importProjectFile, listProjects, renameProject, saveProject, type ProjectMeta } from '../lib/db';
import { newProject } from '../lib/project';
import type { Aspect } from '../types';
import { download, fmtTime, uid } from '../lib/util';
import { createDemoProject } from '../lib/demo';
import { FilePick, useObjectUrl } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { RELEASES_URL } from '../components/SettingsDialog';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

function ProjectCard({ p, refresh }: { p: ProjectMeta; refresh: () => void }) {
  const url = useObjectUrl(p.thumb);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  return (
    <div className="pcard" onClick={() => navigate({ page: 'editor', id: p.id })}>
      <div className="pthumb">
        {url ? <img src={url} alt="" /> : <span className="pthumb-empty"><Icon name="film" size={28} /></span>}
        <span className="pdur">{fmtTime(p.length, false)}</span>
      </div>
      <div className="pinfo">
        <div>
          <b title={p.name}>{p.name}</b>
          <span>{p.clips} clips · {p.aspect} · edited {ago(p.updatedAt)}</span>
        </div>
        <button className="icon-btn" onClick={(e) => (e.stopPropagation(), setMenu(!menu))} aria-label="Project menu"><Icon name="more" /></button>
      </div>
      {menu && (
        <div className="menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <button onClick={async () => {
            const name = prompt('Rename project', p.name);
            if (name) await renameProject(p.id, name);
            setMenu(false);
            refresh();
          }}>Rename</button>
          <button onClick={async () => {
            setMenu(false);
            toast('Packing project…');
            const b = await exportProjectFile(p.id);
            if (b) download(b, `${p.name.replace(/[^\w\- ]+/g, '') || 'project'}.autostudio`);
          }}>Back up (.autostudio)</button>
          <button onClick={() => (setMenu(false), setHistory(true))}>Version history…</button>
          <button onClick={async () => {
            await duplicateProject(p.id, 'p_' + uid());
            setMenu(false);
            toast('Project duplicated', 'ok');
            refresh();
          }}>Duplicate</button>
          <button className="danger" onClick={async () => {
            if (!confirm(`Delete "${p.name}"? This removes its media from this browser.`)) return;
            await deleteProject(p.id);
            refresh();
          }}>Delete</button>
        </div>
      )}
      {history && <div onClick={(e) => e.stopPropagation()}><HistoryDialog id={p.id} name={p.name} onClose={() => setHistory(false)} onRestored={refresh} /></div>}
    </div>
  );
}

export function Projects() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [usage, setUsage] = useState('');
  const refresh = () => {
    void listProjects().then(setProjects);
    void navigator.storage?.estimate().then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1e9).toFixed(2)} GB used of ${((e.quota ?? 0) / 1e9).toFixed(0)} GB available in this browser`));
  };
  useEffect(() => {
    refresh();
    void navigator.storage?.persist?.();
  }, []);
  const [newOpen, setNewOpen] = useState(false);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Your projects</h1>
          <p className="hint">Pick up where you left off — or start a fresh cut. {usage}</p>
        </div>
        <div className="row">
          <FilePick accept=".autostudio" className="btn" onFiles={async ([f]) => {
            if (!f) return;
            try {
              const p = await importProjectFile(f);
              toast(`Restored “${p.name}”`, 'ok');
              refresh();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}><Icon name="upload" /> Restore backup</FilePick>
          <button className="btn" onClick={async () => navigate({ page: 'editor', id: (await createDemoProject()).id })}><Icon name="play" /> Demo project</button>
        </div>
      </div>
      <div className="pgrid">
        <button className="pcard new guided" onClick={() => setNewOpen(true)}>
          <span className="plus"><Icon name="plus" size={22} /></span>
          <b>New project</b>
          <span className="hint">Empty, organised import or guided · vertical or horizontal</span>
        </button>
        {projects?.map((p) => <ProjectCard key={p.id} p={p} refresh={refresh} />)}
      </div>
      {newOpen && <NewProjectDialog onClose={() => setNewOpen(false)} />}
      <p className="hint center footer-version">AutoStudio v{__APP_VERSION__} · <a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases</a></p>
    </main>
  );
}

type StartMode = 'empty' | 'import' | 'guided';
const FORMATS: [Aspect, string, string][] = [['16:9', 'Horizontal', 'YouTube · 16:9'], ['9:16', 'Vertical', 'Shorts · TikTok · Reels · 9:16'], ['1:1', 'Square', '1:1'], ['4:5', 'Feed', 'Instagram / Facebook · 4:5']];

/** New project: how to start (empty / organised import / guided) and in which format. */
function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<StartMode>(() => (localStorage.getItem('newMode') as StartMode) || 'empty');
  const [aspect, setAspect] = useState<Aspect>(() => (localStorage.getItem('newAspect') as Aspect) || '16:9');
  const [name, setName] = useState('');
  const [autoSep, setAutoSep] = useState(() => localStorage.getItem('autoSeparate') === '1');
  const create = async () => {
    localStorage.setItem('newMode', mode);
    localStorage.setItem('newAspect', aspect);
    localStorage.setItem('autoSeparate', autoSep ? '1' : '0');
    const p = newProject(name.trim() || (mode === 'guided' ? 'My video' : undefined));
    p.export.aspect = aspect;
    if (aspect === '9:16') Object.assign(p.captions, { position: 70, maxWords: 3, size: 1.15 });
    if (mode === 'guided') p.wizardStep = 0;
    if (mode === 'empty') p.startEmpty = true;
    await saveProject(p);
    navigate({ page: 'editor', id: p.id });
  };
  const card = (on: boolean, onClick: () => void, icon: string, title: string, hint: string) => (
    <button key={title} className={`tile start-tile ${on ? 'on' : ''}`} onClick={onClick}><Icon name={icon} size={20} /><b>{title}</b><span className="hint">{hint}</span></button>
  );
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>New project</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <label className="field"><span>Name</span><input value={name} placeholder="Untitled project" onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <h4>How do you want to start?</h4>
        <div className="grid3">
          {card(mode === 'empty', () => setMode('empty'), 'plus', 'Empty editor', 'Open the editor straight away and add media, voice and text yourself')}
          {card(mode === 'import', () => setMode('import'), 'list', 'Organised import', 'Drop a voiceover and timed images / videos — review them in a table first')}
          {card(mode === 'guided', () => setMode('guided'), 'wand', 'Guided', 'Step by step: voice → captions → visuals → look → export')}
        </div>
        <h4>Format</h4>
        <div className="grid4">
          {FORMATS.map(([a, t, h]) => (
            <button key={a} className={`tile start-tile ${aspect === a ? 'on' : ''}`} onClick={() => setAspect(a)}>
              <span className={`fmt-shape f${a.replace(':', 'x')}`} /><b>{t}</b><span className="hint">{h}</span>
            </button>
          ))}
        </div>
        <label className="toggle"><input type="checkbox" checked={autoSep} onChange={(e) => setAutoSep(e.target.checked)} /> Separate sound automatically when adding videos</label>
        <p className="hint">You can change the format any time from the editor's top bar — each format keeps its own framing.</p>
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={create}><Icon name="check" /> Create</button>
        </div>
      </div>
    </div>
  );
}
