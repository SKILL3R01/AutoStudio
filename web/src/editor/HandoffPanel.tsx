/**
 * The AI hand-off panel (same everywhere): ① Copy → ② paste into Claude / ChatGPT / Gemini → ③ copy the AI's answer →
 * ④ paste it here. Parts advance on their own; "Do it for me" runs every part with the local assistant.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { TARGETS, type Target } from '../lib/prompts';
import { handOff } from '../tools/PromptStudio';
import { chat, useLlm } from '../lib/llm';

export interface HandoffResult {
  ok: boolean;
  /** Lines shown under the paste box (✓ / ✗ / fixed …). */
  lines: string[];
  /** A ready reply for the chat (cut off / invalid): copied to the clipboard for the user. */
  reply?: string;
}
export interface HandoffProps {
  /** Number of messages (parts). */
  parts: number;
  /** What part i covers, e.g. "scenes 1–48". */
  what: (i: number) => string;
  message: (i: number) => string;
  /** Message for the local assistant (no chat memory). Defaults to `message`. */
  localMessage?: (i: number) => string;
  apply: (i: number, raw: string) => HandoffResult;
  /** Called when every part is done. */
  onDone?: () => void;
  /** Text answers (scripts) instead of JSON. */
  plainText?: boolean;
  best?: Target;
}

export function HandoffPanel({ parts, what, message, localMessage, apply, onDone, plainText, best = 'claude' }: HandoffProps) {
  const [part, setPart] = useState(0);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState<HandoffResult | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [busy, setBusy] = useState('');
  const stop = useRef(false);
  const llmOk = useLlm((s) => !!s.model);
  const msg = message(part);
  useEffect(() => void setCopied(false), [part]);

  const copy = async () => {
    await navigator.clipboard.writeText(msg).catch(() => {});
    setCopied(true);
    toast(part === 0 ? 'Copied — paste it into a NEW chat' : 'Copied — paste it into the SAME chat as before', 'ok');
  };
  const run = (raw: string, i = part) => {
    if (!raw.trim()) return;
    const r = apply(i, raw);
    setResult(r);
    if (r.reply) void navigator.clipboard.writeText(r.reply).then(() => toast('A reply for the AI is on the clipboard — paste it into the same chat', 'info'));
    if (r.ok && !r.reply) {
      setPaste('');
      const nd = [...new Set([...done, i])];
      setDone(nd);
      if (i + 1 < parts) setPart(i + 1);
      else if (nd.length >= parts) onDone?.();
    }
  };
  const runLocal = async () => {
    stop.current = false;
    for (let i = part; i < parts && !stop.current; i++) {
      setBusy(`Part ${i + 1} of ${parts}…`);
      setPart(i);
      try {
        const m = (localMessage ?? message)(i);
        let reply = await chat([{ role: 'user', content: m }], { maxTokens: 7000, temperature: 0.6, timeoutMs: 600000 });
        let r = apply(i, reply);
        if (!r.ok && r.reply) {
          reply = await chat([{ role: 'user', content: m }, { role: 'assistant', content: reply }, { role: 'user', content: r.reply }], { maxTokens: 7000, temperature: 0.4, timeoutMs: 600000 });
          r = apply(i, reply);
        }
        setResult(r);
        if (r.ok) setDone((d) => [...new Set([...d, i])]);
      } catch (e) {
        setResult({ ok: false, lines: [`✗ ${(e as Error).message}`] });
        break;
      }
    }
    setBusy('');
    if (!stop.current) onDone?.();
  };

  return (
    <div className="handoff" data-tour="handoff" onPaste={(e) => {
      if ((e.target as HTMLElement).classList.contains('ho-drop')) return;
      const t = e.clipboardData.getData('text');
      if (t) (e.preventDefault(), setPaste(t), run(t));
    }}>
      {parts > 1 && (
        <div className="ho-progress">
          <b>Part {part + 1} of {parts}</b> · {what(part)}
          <span className="ho-dots">{Array.from({ length: parts }, (_, i) => <i key={i} className={done.includes(i) ? 'done' : i === part ? 'cur' : ''} onClick={() => setPart(i)} title={`Part ${i + 1}: ${what(i)}`} />)}</span>
        </div>
      )}
      <div className="ho-step" data-tour="ho-copy">
        <span className="ho-num">1</span>
        <div>
          <b>Copy the message</b>
          <button className={`btn big ${copied ? 'ok' : 'primary'}`} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied ✓' : `Copy message for ${what(part)}`}</button>
          <details><summary>See the message ({msg.length.toLocaleString()} characters)</summary><textarea readOnly rows={5} value={msg} onFocus={(e) => e.currentTarget.select()} /></details>
        </div>
      </div>
      <div className="ho-step" data-tour="ho-ai">
        <span className="ho-num">2</span>
        <div>
          <b>Paste it into the AI</b>
          <div className="ho-ais">
            {(['claude', 'chatgpt', 'gemini'] as Target[]).map((k) => (
              <button key={k} className={`ho-ai ${k === best ? 'best' : ''}`} onClick={() => (setCopied(true), void handOff(msg, k))}>
                <span className={`ho-logo ${k}`}>{TARGETS[k].label[0]}</span>{TARGETS[k].label}{k === best && <small>best</small>}
              </button>
            ))}
          </div>
          <p className="ho-rule">{part === 0 ? <>This is the <b>first</b> message → paste it into a <b>new chat</b>.</> : <>Paste it into the <b>same chat</b> as part 1.</>} Press <kbd>Ctrl</kbd>+<kbd>V</kbd>, then send.</p>
        </div>
      </div>
      <div className="ho-step">
        <span className="ho-num">3</span>
        <div>
          <b>Copy the AI’s answer</b>
          <div className="ho-pic" aria-hidden>
            <svg viewBox="0 0 260 70" width="260" height="70"><rect x="4" y="6" width="252" height="58" rx="12" fill="#20263a" /><rect x="18" y="18" width="150" height="8" rx="4" fill="#3a4360" /><rect x="18" y="32" width="190" height="8" rx="4" fill="#3a4360" /><rect x="18" y="46" width="120" height="8" rx="4" fill="#3a4360" /><circle cx="232" cy="50" r="12" fill="#7c6cff" /><rect x="226" y="44" width="9" height="11" rx="2" fill="none" stroke="#fff" strokeWidth="2" /><rect x="229" y="41" width="9" height="11" rx="2" fill="none" stroke="#fff" strokeWidth="2" /></svg>
            <span className="hint">Click the copy button under the AI’s answer (or select all of it and press <kbd>Ctrl</kbd>+<kbd>C</kbd>).{plainText ? '' : ' It starts with {'}</span>
          </div>
        </div>
      </div>
      <div className="ho-step" data-tour="ho-paste">
        <span className="ho-num">4</span>
        <div>
          <b>Paste it here</b>
          <textarea className={`ho-drop ${result ? (result.ok ? 'ok' : 'bad') : ''}`} rows={4} placeholder={`Paste the answer for ${what(part)} here (Ctrl+V)`} value={paste}
            onChange={(e) => setPaste(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) (e.preventDefault(), setPaste(t), run(t)); }} />
          {paste && !result?.ok && <button className="btn sm" onClick={() => run(paste)}>Use this answer</button>}
          {result && <div className={`mgfx-report ${result.ok ? 'ok' : 'bad'}`}>{result.lines.slice(0, 8).map((l) => <p key={l}>{l}</p>)}</div>}
        </div>
      </div>
      <div className="ho-or">
        <span>or</span>
        <button className="btn" disabled={!llmOk || !!busy} title={llmOk ? 'Runs every part with your connected AI assistant (faster, simpler designs)' : 'Connect an AI assistant first (Settings → AI connections)'} onClick={() => void runLocal()}><Icon name="wand" /> {busy || 'Do it for me (my AI assistant)'}</button>
        {busy && <button className="btn sm ghost" onClick={() => (stop.current = true)}>Stop</button>}
      </div>
    </div>
  );
}
