import { useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { FilePick } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { importAudio } from '../lib/project';
import { transcribeLocal, useVision } from '../ai/vision';
import { media } from '../render/media';
import { TEMPLATES, applyTemplate } from '../lib/templates';
import { readiness } from '../lib/growth';
import { confirmHeavyAi } from '../lib/perf';

/** Ask the editor to open a panel / dialog (keeps the wizard decoupled from the editor's layout state). */
export const openTab = (tab: string) => window.dispatchEvent(new CustomEvent('autostudio:tab', { detail: tab }));
export const openDialog = (d: 'auto' | 'export' | 'import') => window.dispatchEvent(new CustomEvent('autostudio:dialog', { detail: d }));

const STEPS = ['Voice', 'Captions', 'Visuals', 'Look', 'Export'] as const;

/** Guided first video: five skippable steps that drive the normal editor tools. */
export function Wizard() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const vision = useVision();
  const [busy, setBusy] = useState('');
  const [min, setMin] = useState(false);
  const step = p.wizardStep ?? 0;
  const go = (n: number) => update((d) => void (d.wizardStep = n));
  const close = () => update((d) => void (d.wizardStep = undefined));
  const done = [!!p.voiceover, p.words.length > 0 || p.lines.length > 0, p.clips.length > 0, !!p.templateId, false];

  const captions = async () => {
    if (!p.voiceover || !confirmHeavyAi()) return;
    setBusy('Creating captions on this PC (first time downloads ~80 MB)…');
    try {
      const blob = await media.blob(p.voiceover.assetId);
      const { words } = await transcribeLocal(blob!, 'base', 'auto');
      update((d) => void ((d.words = words), (d.lines = []), (d.captions.enabled = true), (d.captions.wordLevel = true)));
      toast(`${words.length} words captioned`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (min) return <button className="wizard-pill" onClick={() => setMin(false)}><Icon name="wand" /> Guide · step {step + 1}/5</button>;
  const issues = step === 4 ? readiness(p).filter((i) => i.status === 'warn') : [];
  return (
    <div className="wizard">
      <div className="row between">
        <b>Make your video</b>
        <div className="row">
          <button className="icon-btn" title="Minimise" onClick={() => setMin(true)}><Icon name="minus" /></button>
          <button className="icon-btn" title="Close the guide" onClick={close}><Icon name="x" /></button>
        </div>
      </div>
      <ol className="wz-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`${i === step ? 'on' : ''} ${done[i] ? 'done' : ''}`} onClick={() => go(i)}>{done[i] ? '✓' : i + 1} {s}</li>
        ))}
      </ol>
      <div className="wz-body">
        {step === 0 && (
          <>
            <p>Add the narration: generate it from a script (your cloned voice or the default AI voice), record yourself, or upload a file.</p>
            <div className="row wrap">
              <button className="btn sm primary" onClick={() => openTab('voice')}><Icon name="mic" /> Open Voice Studio</button>
              <FilePick accept="audio/*" className="btn sm" onFiles={async (fs) => {
                const next = await importAudio(useEditor.getState().project!, fs, { asVoiceover: true });
                update((d) => Object.assign(d, { assets: next.assets, voiceover: next.voiceover }));
              }}><Icon name="upload" /> Upload voice file</FilePick>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p>Captions come from the voice, on this PC — no engine needed. You can restyle them later in Text → Captions.</p>
            <button className="btn sm primary" disabled={!p.voiceover || !!busy} onClick={captions}><Icon name="captions" /> Create captions</button>
            {!p.voiceover && <p className="hint">Add a voiceover first (step 1).</p>}
          </>
        )}
        {step === 2 && (
          <>
            <p>Auto-edit splits the narration into scenes and finds a visual for each — your media first, then AI images or placeholders — and you review every scene.</p>
            <div className="row wrap">
              <button className="btn sm primary" onClick={() => openDialog('auto')}><Icon name="wand" /> Auto-edit</button>
              <button className="btn sm" onClick={() => openDialog('import')}><Icon name="upload" /> Add my media</button>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="wz-templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={`wz-tpl ${p.templateId === t.id ? 'on' : ''}`} onClick={() => (update((d) => applyTemplate(d, t)), toast(`“${t.name}” applied`, 'ok'))}>
                <b>{t.name}</b>
                <span className="hint">{t.description} · {t.aspect}</span>
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <>
            {issues.length ? (
              <>
                <p>Before you upload, {issues.length} thing{issues.length > 1 ? 's' : ''} to check for monetization:</p>
                <ul className="wz-issues">{issues.slice(0, 4).map((i) => <li key={i.id}>{i.title}</li>)}</ul>
                <a className="link" href="#growth/readiness">Open the full readiness check</a>
              </>
            ) : <p>Looks ready. Export your video.</p>}
            <button className="btn sm primary" onClick={() => openDialog('export')}><Icon name="export" /> Export</button>
          </>
        )}
        {(busy || vision.label) && <p className="hint">{busy} {vision.label && `${vision.label} ${Math.round(vision.value * 100)}%`}</p>}
      </div>
      <div className="row between">
        <button className="btn sm ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
        {step < 4 ? <button className="btn sm" onClick={() => go(step + 1)}>{done[step] ? 'Next' : 'Skip'} →</button> : <button className="btn sm" onClick={close}>Finish</button>}
      </div>
    </div>
  );
}
