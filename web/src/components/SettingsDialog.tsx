import { useEffect } from 'react';
import { PROFILE_LABELS, PROFILE_SETTINGS, usePerf, type Profile } from '../lib/perf';
import { Icon } from './icons';
import { toast } from './Toast';

export const RELEASES_URL = 'https://github.com/SKILL3R01/AutoStudio/releases';
export const LAYOUT_KEYS = ['layoutLeft', 'layoutRight', 'layoutLeftCollapsed', 'layoutRightCollapsed', 'tlHeight'];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
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

        <h4>About</h4>
        <p className="hint">AutoStudio <b>v{__APP_VERSION__}</b> · <a href={RELEASES_URL} target="_blank" rel="noreferrer">Check for new releases</a></p>
      </div>
    </div>
  );
}
