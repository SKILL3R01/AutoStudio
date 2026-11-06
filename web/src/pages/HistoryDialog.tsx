import { useEffect, useState } from 'react';
import { listSnapshots, snapshot, type Snapshot } from '../lib/history';
import { loadProject, saveProject } from '../lib/db';
import { normalizeProject } from '../lib/project';
import { fmtTime } from '../lib/util';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';

/** Restore an earlier version of a project (the current one is snapshotted first, so restoring is undoable). */
export function HistoryDialog({ id, name, onClose, onRestored }: { id: string; name: string; onClose: () => void; onRestored: () => void }) {
  const [list, setList] = useState<Snapshot[] | null>(null);
  useEffect(() => void listSnapshots(id).then(setList), [id]);
  const restore = async (s: Snapshot) => {
    if (!confirm(`Restore "${name}" to ${new Date(s.at).toLocaleString()}? The current version is kept in this list.`)) return;
    const cur = await loadProject(id);
    if (cur) await snapshot(cur, 'Before restore', true);
    await saveProject(normalizeProject({ ...s.project, id, updatedAt: Date.now() } as typeof s.project));
    toast('Version restored', 'ok');
    onRestored();
    onClose();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Version history · {name}</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Saved automatically every few minutes while you edit (last 30 versions), and before restores.</p>
        {!list ? <p className="hint">Loading…</p> : !list.length ? <p className="hint">No earlier versions yet — they appear after a few minutes of editing.</p> : (
          <ul className="history">
            {list.map((s) => (
              <li key={s.at}>
                <div><b>{new Date(s.at).toLocaleString()}</b><span className="hint"> · {s.label} · {s.clips} clips · {fmtTime(s.length, false)}</span></div>
                <button className="btn sm" onClick={() => void restore(s)}><Icon name="undo" /> Restore</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
