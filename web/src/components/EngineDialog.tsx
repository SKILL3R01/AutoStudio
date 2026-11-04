import { useState } from 'react';
import { ENGINE_LABELS, engineDiagnostics, useEngine, type Diagnostics, type EngineKind } from '../lib/engine';
import { toast } from './Toast';
import { Icon } from './icons';
import { download } from '../lib/util';
import notebook from '../../../engine/AutoStudio_Engine.ipynb?raw';

const NL = String.fromCharCode(10);
export const COLAB_URL = 'https://colab.research.google.com/github/SKILL3R01/autostudio-engine/blob/main/AutoStudio_Engine.ipynb';
/** The reference site's public notebook — voiceover (English, cloning), Whisper transcripts and upscaling. */
export const TRYAI_COLAB_URL = 'https://colab.research.google.com/github/codewithsiddique-04/tryaitoday-studio-notebook/blob/main/TryAIToday_Studio.ipynb';

const ENGINE_FEATURES: Record<EngineKind, string> = {
  autostudio: 'Voiceover in 23 languages + voice cloning, captions, AI images, AI video, AI assistant, upscaling.',
  tryai: 'English voiceover with voice cloning (Chatterbox Turbo), Whisper large-v3-turbo captions, image & video upscaling. No AI images / video / assistant.',
};

export function EngineDialog({ onClose }: { onClose: () => void }) {
  const { url, setUrl, check, status, info } = useEngine();
  const [value, setValue] = useState(url);
  const [msg, setMsg] = useState('');
  const [help, setHelp] = useState(false);
  const kind = useEngine((s) => s.kind);
  const [pick, setPick] = useState<EngineKind>(kind);
  const [diag, setDiag] = useState<Diagnostics | string | null>(null);
  const runDiag = async () => {
    setDiag('Checking every tool on the engine (up to a minute)…');
    try {
      setDiag(await engineDiagnostics());
    } catch (e) {
      setDiag((e as Error).message);
    }
  };
  const report = (d: Diagnostics) => [
    'AutoStudio engine report',
    ...d.checks.map((c) => `${c.ok ? 'OK ' : 'ERR'} ${c.name}: ${c.detail}`),
    ...d.jobs.map((j) => `job ${j.tool} ${j.status}${j.error ? `: ${j.error}` : ''}${NL}  ${j.log.slice(-6).join(`${NL}  `)}`),
  ].join(NL);
  const test = async () => {
    setUrl(value);
    setMsg('Testing…');
    setMsg((await check()) ? 'Connected ✓' : 'Could not reach the engine. Is the Colab notebook still running? (A new run gives a new URL.)');
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Colab engine</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <p className="hint">Free AI on Google's GPUs, in your own Google account. AutoStudio works with two notebooks — pick one:</p>
        <div className="engine-pick">
          {(['autostudio', 'tryai'] as EngineKind[]).map((k) => (
            <button key={k} className={`card pick ${pick === k ? 'on' : ''}`} onClick={() => setPick(k)}>
              <b>{ENGINE_LABELS[k]}{k === 'autostudio' ? ' (recommended)' : ''}</b>
              <span className="hint">{ENGINE_FEATURES[k]}</span>
            </button>
          ))}
        </div>

        <ol className="setup">
          <li>
            <b>Open the {ENGINE_LABELS[pick]} notebook in Colab</b>
            <div className="row wrap">
              <a className="btn primary" href={pick === 'autostudio' ? COLAB_URL : TRYAI_COLAB_URL} target="_blank" rel="noreferrer"><Icon name="link" /> Open in Colab</a>
              {pick === 'autostudio' && <button className="btn ghost sm" onClick={() => download(new Blob([notebook], { type: 'application/x-ipynb+json' }), 'AutoStudio_Engine.ipynb')}><Icon name="download" /> Download notebook</button>}
            </div>
            <span className="hint">Sign in with any Google account.{pick === 'autostudio' ? " If the link doesn't open, download the notebook and use Colab → File → Upload notebook." : ' It asks to mount your Google Drive (results are also saved there).'}</span>
          </li>
          <li>
            <b>Runtime → Change runtime type → T4 GPU, then Runtime → Run all</b>
            <span className="hint">The first run installs everything (~5 min).</span>
          </li>
          <li>
            {pick === 'autostudio'
              ? <><b>Click “Open desktop app & connect”</b> in the last cell — AutoStudio fills in the URL by itself.</>
              : <b>Copy the address after “🌐 OPEN:” in the last cell</b>}
            <span className="hint">{pick === 'autostudio' ? 'Or copy' : 'It looks like'} the <code>https://….trycloudflare.com</code> URL{pick === 'autostudio' ? ' and paste it here' : ' — paste it here'}:</span>
            <div className="row">
              <input value={value} placeholder="https://xxxx.trycloudflare.com" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && test()} />
              <button className="btn" onClick={test}>Test</button>
            </div>
          </li>
        </ol>

        <div className={`engine-status ${status}`}>
          <i />
          {status === 'ready' && info ? (
            <span>Connected · {ENGINE_LABELS[kind]} · {kind === 'autostudio' ? info.gpu : `${info.tools.length} tools ready`}{info.drive ? ' · Drive' : ''}</span>
          ) : <span>{msg || (status === 'checking' ? 'Checking…' : 'Not connected')}</span>}
        </div>

        {status === 'ready' && kind === 'autostudio' && (
          <div className="row wrap">
            <button className="btn sm" onClick={runDiag}><Icon name="check" /> Check engine</button>
            <span className="hint">Tests the GPU and every AI tool, and shows the last errors.</span>
          </div>
        )}
        {typeof diag === 'string' && <p className="hint">{diag}</p>}
        {diag && typeof diag === 'object' && (
          <div className="diag">
            <ul className="readiness">
              {diag.checks.map((c) => (
                <li key={c.name} className={c.ok ? 'ok' : 'warn'}>
                  <Icon name={c.ok ? 'check' : 'warn'} size={14} />
                  <div><b>{c.name}</b><span className="hint">{c.detail}</span></div>
                </li>
              ))}
            </ul>
            {diag.jobs.filter((j) => j.status === 'error').map((j) => (
              <details key={j.id}>
                <summary><b>Failed {j.tool}</b> — {j.error}</summary>
                <pre className="log mini">{j.log.join(NL)}</pre>
              </details>
            ))}
            <button className="btn sm ghost" onClick={() => void navigator.clipboard.writeText(report(diag)).then(() => toast('Report copied — paste it to your assistant', 'ok'))}><Icon name="copy" /> Copy report</button>
          </div>
        )}
        <button className="link" onClick={() => setHelp(!help)}>{help ? 'Hide' : 'Show'} troubleshooting</button>
        {help && (
          <ul className="hint steps">
            <li>The URL changes every time the notebook runs — reconnect after each new Colab session.</li>
            <li>Colab stops idle sessions after ~90 min and free GPUs after a few hours; just Run all again.</li>
            <li>“No GPU” in step 1: Runtime → Change runtime type → T4 GPU, then Run all.</li>
            <li>TryAIToday engine: voiceover needs a reference voice sample and speaks English only; AI images, AI video and the assistant need the AutoStudio engine.</li>
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
