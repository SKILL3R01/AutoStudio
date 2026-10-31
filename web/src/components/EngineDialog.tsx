import { useState } from 'react';
import { useEngine } from '../lib/engine';

export function EngineDialog({ onClose }: { onClose: () => void }) {
  const { url, setUrl, check, status, info } = useEngine();
  const [value, setValue] = useState(url);
  const [msg, setMsg] = useState('');
  const test = async () => {
    setUrl(value);
    setMsg('Testing…');
    setMsg((await check()) ? 'Connected ✓' : 'Could not reach the engine. Is the Colab cell still running?');
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Colab engine</h3>
        <p className="hint">Paste the URL your Colab notebook prints when you run it. This connects the AI features (voiceover, voice cloning, captions, image generation, upscaling) to your own free GPU.</p>
        <label className="field">
          <span>Engine URL</span>
          <input value={value} placeholder="https://xxxx.trycloudflare.com" onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn" onClick={test}>Test connection</button>
          <span className={`hint ${status}`}>{msg}</span>
        </div>
        {info && <p className="hint">GPU: {info.gpu} · Tools: {info.tools.join(', ')} · Drive: {info.drive ? 'mounted' : 'off'}</p>}
        <div className="box">
          <b>How to get this URL</b>
          <ol>
            <li>Open <code>engine/AutoStudio_Engine.ipynb</code> in Google Colab (File → Upload notebook).</li>
            <li>Runtime → Change runtime type → <b>T4 GPU</b>, then Runtime → <b>Run all</b>.</li>
            <li>Copy the <code>https://….trycloudflare.com</code> URL printed by the last cell and paste it above.</li>
          </ol>
          <p className="hint">The URL changes each Colab session — paste it again when you start a new one.</p>
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => (setUrl(value), void check(), onClose())}>Save</button>
        </div>
      </div>
    </div>
  );
}
