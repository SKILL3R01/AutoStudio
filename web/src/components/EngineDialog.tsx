import { useState } from 'react';
import { useEngine } from '../lib/engine';
import { Icon } from './icons';
import { download } from '../lib/util';
import notebook from '../../../engine/AutoStudio_Engine.ipynb?raw';

export const COLAB_URL = 'https://colab.research.google.com/github/SKILL3R01/autostudio-engine/blob/main/AutoStudio_Engine.ipynb';

export function EngineDialog({ onClose }: { onClose: () => void }) {
  const { url, setUrl, check, status, info } = useEngine();
  const [value, setValue] = useState(url);
  const [msg, setMsg] = useState('');
  const [help, setHelp] = useState(false);
  const test = async () => {
    setUrl(value);
    setMsg('Testing…');
    setMsg((await check()) ? 'Connected ✓' : 'Could not reach the engine. Is the Colab notebook still running? (A new run gives a new URL.)');
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Colab engine</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Free AI on Google's GPUs: voiceover & voice cloning, word-level captions, image generation and upscaling. It runs in your own Google account.</p>

        <ol className="setup">
          <li>
            <b>Open the AutoStudio notebook in Colab</b>
            <div className="row wrap">
              <a className="btn primary" href={COLAB_URL} target="_blank" rel="noreferrer"><Icon name="link" /> Open in Colab</a>
              <button className="btn ghost sm" onClick={() => download(new Blob([notebook], { type: 'application/x-ipynb+json' }), 'AutoStudio_Engine.ipynb')}><Icon name="download" /> Download notebook</button>
            </div>
            <span className="hint">Sign in with any Google account. If the link doesn't open, download the notebook and use Colab → File → Upload notebook.</span>
          </li>
          <li>
            <b>Runtime → Change runtime type → T4 GPU, then Runtime → Run all</b>
            <span className="hint">The first run installs everything (~5 min). Allow Google Drive if you want outputs saved there.</span>
          </li>
          <li>
            <b>Click “Open desktop app & connect”</b> in the last cell — AutoStudio fills in the URL by itself.
            <span className="hint">Or copy the <code>https://….trycloudflare.com</code> URL and paste it here:</span>
            <div className="row">
              <input value={value} placeholder="https://xxxx.trycloudflare.com" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && test()} />
              <button className="btn" onClick={test}>Test</button>
            </div>
          </li>
        </ol>

        <div className={`engine-status ${status}`}>
          <i />
          {status === 'ready' && info ? (
            <span>Connected · {info.gpu} · {info.tools.length} tools{info.drive ? ' · Drive mounted' : ''}</span>
          ) : <span>{msg || (status === 'checking' ? 'Checking…' : 'Not connected')}</span>}
        </div>

        <button className="link" onClick={() => setHelp(!help)}>{help ? 'Hide' : 'Show'} troubleshooting</button>
        {help && (
          <ul className="hint steps">
            <li>The URL changes every time the notebook runs — reconnect after each new Colab session.</li>
            <li>Colab stops idle sessions after ~90 min and free GPUs after a few hours; just Run all again.</li>
            <li>“No GPU” in step 1: Runtime → Change runtime type → T4 GPU, then Run all.</li>
            <li>Test fails but the cell is running: make sure you copied the whole <code>https://…trycloudflare.com</code> address (no trailing text).</li>
            <li>The desktop-app button does nothing: the app must be installed with the Setup installer (the portable exe can't register links) — paste the URL instead.</li>
          </ul>
        )}
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={() => (setUrl(value), void check(), onClose())}>Save</button>
        </div>
      </div>
    </div>
  );
}
