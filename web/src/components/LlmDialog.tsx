import { useState } from 'react';
import { PRESETS, chat, useLlm, type LlmPreset } from '../lib/llm';
import { Select } from './ui';

export function LlmDialog({ onClose }: { onClose: () => void }) {
  const s = useLlm();
  const [reply, setReply] = useState('');
  const pick = (preset: LlmPreset) => s.set({ preset, url: PRESETS[preset].url || s.url });
  const test = async () => {
    setReply('Testing…');
    if (!(await s.check())) return setReply(useLlm.getState().error ?? 'Not reachable');
    try {
      setReply(await chat([{ role: 'user', content: 'Reply with exactly: AutoStudio connected.' }], { maxTokens: 20 }));
    } catch (e) {
      setReply((e as Error).message);
    }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>AI assistant (LLM)</h3>
        <p className="hint">Used to pick caption keywords, write scene prompts and scripts, and suggest edits. Runs on your own PC — nothing leaves your machine.</p>
        <div className="seg">
          {(Object.keys(PRESETS) as LlmPreset[]).map((p) => (
            <button key={p} className={s.preset === p ? 'on' : ''} onClick={() => pick(p)}>{PRESETS[p].label}</button>
          ))}
        </div>
        <p className="hint">{PRESETS[s.preset].help}</p>
        {s.preset !== 'colab' && (
          <>
            <label className="field"><span>Server URL</span><input value={s.url} onChange={(e) => s.set({ url: e.target.value })} /></label>
            {s.preset === 'custom' && <label className="field"><span>API key (optional)</span><input type="password" value={s.key} onChange={(e) => s.set({ key: e.target.value })} /></label>}
            {s.models.length > 0 ? <Select label="Model" value={s.model} options={s.models} onChange={(v) => s.set({ model: v })} /> : <label className="field"><span>Model id</span><input value={s.model} placeholder="loaded automatically after Test" onChange={(e) => s.set({ model: e.target.value })} /></label>}
          </>
        )}
        <div className="row">
          <button className="btn" onClick={test}>Test connection</button>
          <span className={`hint ${s.status}`}>{reply}</span>
        </div>
        <div className="row end">
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
