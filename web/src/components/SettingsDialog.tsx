import { useEffect } from 'react';
import { PROFILE_LABELS, PROFILE_SETTINGS, usePerf, type Profile } from '../lib/perf';
import { Icon } from './icons';
import { toast } from './Toast';
import { Toggle } from './ui';
import { updatesSupported, useUpdates } from '../lib/updates';

export const RELEASES_URL = 'https://github.com/SKILL3R01/AutoStudio/releases';
export const LAYOUT_KEYS = ['layoutLeft', 'layoutRight', 'layoutLeftCollapsed', 'layoutRightCollapsed', 'tlHeight'];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fastPreview = usePerf((s) => s.fastPreview);
  const setFastPreview = usePerf((s) => s.setFastPreview);
  const { hw, detected, override, profile, setOverride, init } = usePerf();
  useEffect(() => void (!hw && init()), []);
  const s = PROFILE_SETTINGS[profile];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Settings</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>

        <h4>Performance</h4>
        <dl className="specs">
          <dt>Memory</dt><dd>{hw ? `${hw.ramGB} GB${hw.source === 'browser' ? ' (browser estimate)' : ''}` : 'Checking…'}</dd>
          <dt>CPU</dt><dd>{hw ? `${hw.cores} cores${hw.cpu ? ` · ${hw.cpu}` : ''}` : '…'}</dd>
          <dt>Graphics</dt><dd title={hw?.gpu}>{hw?.gpu || '…'}</dd>
          <dt>WebGPU</dt><dd>{hw ? (hw.webgpu ? 'available' : 'not available (AI runs on CPU)') : '…'}</dd>
          <dt>Detected</dt><dd>{PROFILE_LABELS[detected]}</dd>
        </dl>
        <div className="seg">
          <button className={!override ? 'on' : ''} onClick={() => setOverride(null)}>Auto</button>
          {(['low', 'medium', 'high'] as Profile[]).map((p) => (
            <button key={p} className={override === p ? 'on' : ''} onClick={() => setOverride(p)}>{PROFILE_LABELS[p]}</button>
          ))}
        </div>
        <p className="hint">
          Using <b>{PROFILE_LABELS[profile]}</b>: preview {s.preview}px, image cache {s.lru} images up to {s.maxDim}px{s.heavyAiWarning ? ', 3D depth / object selection ask before running' : ''}.
          Exports always use full quality — weaker PCs just export more slowly.
        </p>

        <h4>Layout</h4>
        <button className="btn sm" onClick={() => {
          LAYOUT_KEYS.forEach((k) => localStorage.removeItem(k));
          window.dispatchEvent(new Event('layout-reset'));
          toast('Layout reset', 'ok');
        }}><Icon name="fit" /> Reset panel sizes</button>

        <Toggle label="Fast preview while playing (lighter effects and resolution; paused frames and export stay full quality)" value={fastPreview} onChange={setFastPreview} />

        <h4>AI connections (optional)</h4>
        <p className="hint">Everything core works on this PC. These add extras: a local LLM (LM Studio / Ollama) for AI writing, and the Colab GPU engine for fast AI images / video / voices.</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => (onClose(), window.dispatchEvent(new CustomEvent('autostudio:open', { detail: 'llm' })))}><Icon name="wand" /> AI assistant (LLM)…</button>
          <button className="btn sm" onClick={() => (onClose(), window.dispatchEvent(new CustomEvent('autostudio:open', { detail: 'engine' })))}><Icon name="bolt" /> Colab GPU engine…</button>
        </div>

        <h4>Updates</h4>
        <UpdatesSection />

        <h4>About</h4>
        <p className="hint">AutoStudio <b>v{__APP_VERSION__}</b> · <a href={RELEASES_URL} target="_blank" rel="noreferrer">All releases</a></p>
      </div>
    </div>
  );
}

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

/** Check → download (SHA-256 verified) → restart & install. Desktop app only. */
export function UpdatesSection() {
  const u = useUpdates();
  if (!updatesSupported()) return <p className="hint">In the browser version, download new versions from the <a href={RELEASES_URL} target="_blank" rel="noreferrer">Releases page</a>.</p>;
  const latest = u.info?.latest;
  return (
    <div className="updates">
      {u.phase === 'idle' && <button className="btn sm" onClick={() => void u.check()}><Icon name="undo" /> Check for updates</button>}
      {u.phase === 'checking' && <p className="hint">Checking GitHub for a new version…</p>}
      {u.phase === 'uptodate' && (
        <div className="row wrap"><span className="chip ok"><Icon name="check" size={13} /> Up to date (v{u.info?.current})</span><button className="btn sm ghost" onClick={() => void u.check()}>Check again</button></div>
      )}
      {(u.phase === 'available' || u.phase === 'downloading' || u.phase === 'ready' || u.phase === 'installing') && (
        <>
          <p><b>Version {latest} is available</b> <span className="hint">(you have {u.info?.current}{u.info?.size ? ` · ${mb(u.info.size)}` : ''})</span></p>
          {u.info?.notes && <details><summary className="hint">What's new</summary><pre className="meta-out">{u.info.notes}</pre></details>}
          {u.info?.portable ? (
            <>
              <p className="hint">You are using the portable exe, which can't update itself — download the new one (or install the Setup version once to get automatic updates).</p>
              <a className="btn sm primary" href={u.info.page} target="_blank" rel="noreferrer"><Icon name="download" /> Open the download page</a>
            </>
          ) : u.phase === 'available' ? (
            <button className="btn sm primary" onClick={() => void u.download()}><Icon name="download" /> Download update</button>
          ) : u.phase === 'downloading' ? (
            <div className="meter"><div className="row between"><span>Downloading…</span><span className="hint">{Math.round(u.progress * 100)}%</span></div><div className="bar"><i style={{ width: `${u.progress * 100}%` }} /></div></div>
          ) : u.phase === 'ready' ? (
            <>
              <p className="hint">Downloaded and verified. Your projects are saved automatically — the app closes, updates and opens again (about a minute).</p>
              <button className="btn sm primary" onClick={() => void u.install()}><Icon name="bolt" /> Restart & install v{latest}</button>
            </>
          ) : <p className="hint">Installing — AutoStudio will reopen by itself…</p>}
        </>
      )}
      {u.phase === 'error' && (
        <div className="row wrap"><span className="warn">{u.error}</span><button className="btn sm ghost" onClick={() => void u.check()}>Try again</button></div>
      )}
      <Toggle label="Check for updates automatically (once a day)" value={u.auto} onChange={u.setAuto} />
    </div>
  );
}
