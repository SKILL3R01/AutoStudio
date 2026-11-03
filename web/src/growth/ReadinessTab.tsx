import { useEffect, useState } from 'react';
import { listProjects, loadProject, type ProjectMeta } from '../lib/db';
import { normalizeProject } from '../lib/project';
import { readiness, type ReadinessItem } from '../lib/growth';
import { Select } from '../components/ui';
import { Icon } from '../components/icons';
import { navigate } from '../App';

/** Pre-upload check of a project against YouTube's monetization policies for faceless videos. */
export function ReadinessTab() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [id, setId] = useState(() => localStorage.getItem('promptProject') ?? '');
  const [items, setItems] = useState<ReadinessItem[] | null>(null);

  useEffect(() => void listProjects().then((l) => (setProjects(l), !id && l[0] && setId(l[0].id))), []);
  useEffect(() => {
    if (!id) return;
    void (async () => {
      const p = await loadProject(id);
      if (!p) return setItems(null);
      const others = (await Promise.all(projects.filter((x) => x.id !== id).slice(0, 12).map((x) => loadProject(x.id)))).filter(Boolean).map((x) => normalizeProject(x!));
      setItems(readiness(normalizeProject(p), others));
    })();
  }, [id, projects.length]);

  const warn = items?.filter((i) => i.status === 'warn').length ?? 0;
  return (
    <div className="card">
      <h3>Monetization readiness</h3>
      <p className="hint">Checks a project before you upload, against what YouTube reviews for faceless and AI-assisted channels: original commentary, variety, rights, and videos that look mass-produced. It's guidance, not a guarantee.</p>
      <div className="row">
        <Select label="Project" value={id} options={projects.map((p) => [p.id, p.name] as [string, string])} onChange={setId} />
        {id && <button className="btn sm ghost" onClick={() => navigate({ page: 'editor', id })}><Icon name="film" /> Open in editor</button>}
      </div>
      {items && (
        <>
          <p className={warn ? 'warn' : 'ok-note'}>{warn ? `${warn} thing${warn > 1 ? 's' : ''} to look at before uploading.` : 'Looks ready — nothing flagged.'}</p>
          <ul className="readiness">
            {items.map((i) => (
              <li key={i.id} className={i.status}>
                <Icon name={i.status === 'ok' ? 'check' : i.status === 'warn' ? 'warn' : 'bolt'} size={14} />
                <div><b>{i.title}</b><span className="hint">{i.detail}</span></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
