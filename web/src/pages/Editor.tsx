import { mainVoiceAsset } from '../lib/audiotracks';
import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { useEditor, findAsset } from '../store';
import { loadProject } from '../lib/db';
import { normalizeProject } from '../lib/project';
import { media } from '../render/media';
import { Icon } from '../components/icons';
import { Preview } from '../editor/Preview';
import { Timeline } from '../editor/Timeline';
import { Sidebar } from '../editor/Panels';
import { Inspector } from '../editor/Inspector';
import { ImportScreen, ImportDialog } from '../editor/ImportScreen';
import { ExportDialog } from '../editor/ExportDialog';
import { ShortcutsDialog, useShortcuts } from '../editor/shortcuts';
import { Splitter, usePanelSize } from '../editor/Splitter';
import { AutoEditDialog } from '../editor/AutoEditDialog';
import { Wizard } from '../editor/Wizard';
import { ContextMenu } from '../editor/ContextMenu';
import { FormatSwitch } from '../editor/Framing';
import { ShortsDialog } from '../editor/ShortsDialog';
import { updateThumbnail } from '../lib/thumbnail';
import { buildLines } from '../lib/captions';
import type { Project } from '../types';

export function Editor({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    media.reset();
    loadProject(id).then((p) => (p ? useEditor.getState().load(normalizeProject(p)) : setMissing(true)));
    return () => {
      useEditor.getState().close();
      media.reset();
    };
  }, [id]);
  useShortcuts();
  // Keep the gallery poster frame fresh (debounced) and refresh it when leaving the editor.
  useEffect(() => {
    let timer: number | undefined;
    let last: Project | null = null;
    let dirty = false;
    const run = () => {
      if (last && dirty) void updateThumbnail(last, buildLines(last.words, last.lines, last.captions)).catch(() => {});
      dirty = false;
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.project && s.project !== prev.project) {
        dirty = true;
        last = s.project;
        clearTimeout(timer);
        timer = window.setTimeout(run, 4000);
      }
    });
    return () => (unsub(), clearTimeout(timer), run());
  }, []);
  if (missing) return <main className="page"><h2>Project not found</h2><a href="#projects">Back to projects</a></main>;
  if (!project) return <main className="page"><p className="hint">Loading project…</p></main>;
  // The guided wizard starts in the workspace even before there are clips (voice comes first).
  return project.clips.length || project.wizardStep !== undefined || project.assets.length || project.audio.length ? <Workspace /> : <ImportScreen />;
}

function Workspace() {
  const p = useEditor((s) => s.project!);
  const { update, undo, redo, past, future } = useEditor();
  const [dialog, setDialog] = useState<'import' | 'export' | 'keys' | 'auto' | 'shorts' | null>(null);
  useEffect(() => {
    const h = (e: Event) => setDialog((e as CustomEvent<'import' | 'export' | 'auto'>).detail);
    window.addEventListener('autostudio:dialog', h);
    return () => window.removeEventListener('autostudio:dialog', h);
  }, []);
  const vo = mainVoiceAsset(p) ? findAsset(p, mainVoiceAsset(p)!) : undefined;
  const left = usePanelSize('layoutLeft', 300, 220, 560);
  const right = usePanelSize('layoutRight', 300, 220, 560);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === '?' && !(e.target as HTMLElement).matches('input,textarea') && setDialog('keys');
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <div className="editor">
      <div className="ed-top">
        <button className="icon-btn" onClick={() => navigate({ page: 'projects' })} title="All projects"><Icon name="back" /></button>
        <input className="title" value={p.name} onChange={(e) => update((d) => void (d.name = e.target.value), 'name')} />
        <button className="icon-btn" disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button className="icon-btn" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" /></button>
        <div className="grow" />
        <FormatSwitch />
        {vo && <span className="chip"><Icon name="mic" size={13} /> {vo.name}</span>}
        <span className="chip"><Icon name="film" size={13} /> {p.clips.length} clips</span>
        <button className="icon-btn" onClick={() => setDialog('keys')} title="Keyboard shortcuts (?)"><Icon name="keyboard" /></button>
        <button className="btn sm" onClick={() => setDialog('auto')} title="Voiceover → scenes → a visual per scene → timeline"><Icon name="wand" /> Auto-edit</button>
        {p.export.aspect !== '9:16' && <button className="btn sm" onClick={() => setDialog('shorts')} title="Make a vertical Short from a part of this video"><Icon name="film" /> Make Short</button>}
        {p.sourceProjectId && <button className="btn sm ghost" onClick={() => navigate({ page: 'editor', id: p.sourceProjectId! })} title="Open the long video this Short was made from"><Icon name="back" /> Long version</button>}
        <button className="btn sm" onClick={() => setDialog('import')}><Icon name="upload" /> Add media</button>
        <button className="btn sm primary" onClick={() => setDialog('export')}><Icon name="export" /> Export</button>
      </div>
      <div
        className={`ed-main ${left.collapsed ? 'left-collapsed' : ''} ${right.collapsed ? 'right-collapsed' : ''}`}
        style={{ gridTemplateColumns: `var(--rail) ${left.collapsed ? 0 : left.size}px 8px minmax(0, 1fr) 8px ${right.collapsed ? 0 : right.size}px` }}
      >
        <Sidebar />
        <Splitter panel={left} dir={1} label="tools panel" />
        <Preview />
        <Splitter panel={right} dir={-1} label="properties panel" />
        <Inspector />
      </div>
      <Timeline />
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'shorts' && <ShortsDialog onClose={() => setDialog(null)} />}
      {dialog === 'keys' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'auto' && <AutoEditDialog onClose={() => setDialog(null)} />}
      {p.wizardStep !== undefined && <Wizard />}
      <ContextMenu />
    </div>
  );
}
