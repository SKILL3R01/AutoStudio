import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { HistoryDialog } from './HistoryDialog';
import { deleteProject, duplicateProject, exportProjectFile, importProjectFile, listProjects, renameProject, saveProject, type ProjectMeta } from '../lib/db';
import { newProject } from '../lib/project';
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
  const create = async () => {
    const p = newProject();
    await saveProject(p);
    navigate({ page: 'editor', id: p.id });
  };
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
        <button className="pcard new" onClick={create}>
          <span className="plus"><Icon name="plus" size={22} /></span>
          <b>New project</b>
        </button>
        {projects?.map((p) => <ProjectCard key={p.id} p={p} refresh={refresh} />)}
      </div>
      <p className="hint center footer-version">AutoStudio v{__APP_VERSION__} · <a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases</a></p>
    </main>
  );
}
