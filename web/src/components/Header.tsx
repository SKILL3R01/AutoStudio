import { useEffect, useState } from 'react';
import { useUi } from '../lib/uimode';
import { useEngine } from '../lib/engine';
import { useLlm } from '../lib/llm';
import { EngineDialog } from './EngineDialog';
import { LlmDialog } from './LlmDialog';
import { SettingsDialog } from './SettingsDialog';
import { useUpdates } from '../lib/updates';
import { Icon } from './icons';
import type { Route } from '../App';

export function Header({ route }: { route: Route }) {
  const status = useEngine((s) => s.status);
  const kind = useEngine((s) => s.kind);
  const update = useUpdates((s) => s.phase);
  const llm = useLlm((s) => s.status);
  const [open, setOpen] = useState<'engine' | 'llm' | 'settings' | null>(null);
  const { mode, setMode } = useUi();
  const engineUrl = useEngine((s) => s.url);
  const llmUrl = useLlm((s) => s.status !== 'offline');
  // Settings → "AI connections" can open these dialogs too (they are hidden from the bar in Simple mode).
  useEffect(() => {
    const h = (e: Event) => setOpen((e as CustomEvent<'engine' | 'llm'>).detail);
    window.addEventListener('autostudio:open', h);
    return () => window.removeEventListener('autostudio:open', h);
  }, []);
  return (
    <header className="header">
      <a className="brand" href="#" title={`AutoStudio v${__APP_VERSION__}`}><span className="logo"><Icon name="play" size={11} /></span> AutoStudio <em className="version">v{__APP_VERSION__}</em></a>
      <nav className="topnav">
        <a href="#" className={route.page === 'home' ? 'on' : ''}>Studio</a>
        <a href="#projects" className={route.page === 'projects' || route.page === 'editor' ? 'on' : ''}>Projects</a>
        <a href="#growth" className={route.page === 'growth' ? 'on' : ''}>Growth</a>
      </nav>
      <div className="grow" />
      <div className="seg mode-switch" title="Simple shows 5 areas and folds advanced settings; Pro shows everything">
        <button className={mode === 'simple' ? 'on' : ''} onClick={() => setMode('simple')}>Simple</button>
        <button className={mode === 'pro' ? 'on' : ''} onClick={() => setMode('pro')}>Pro</button>
      </div>
      {(mode === 'pro' || llm === 'ready' || llmUrl) && (
        <button className={`pill ${llm}`} onClick={() => setOpen('llm')} title="Local LLM assistant (LM Studio / Ollama)">
          <i /> {llm === 'ready' ? 'AI assistant' : 'Connect LLM'}
        </button>
      )}
      {(mode === 'pro' || status !== 'offline' || engineUrl) && (
        <button className={`pill ${status}`} onClick={() => setOpen('engine')} title="Optional GPU engine (Colab)">
          <i /> {status === 'ready' ? (kind === 'tryai' ? 'TryAIToday engine' : 'Engine ready') : status === 'checking' ? 'Checking…' : 'Connect engine'}
        </button>
      )}
      {(update === 'available' || update === 'ready') && <button className="pill ready" onClick={() => setOpen('settings')} title="A new version of AutoStudio is available"><i /> Update</button>}
      <button className="icon-btn" onClick={() => setOpen('settings')} title="Settings (performance, layout, version)"><Icon name="settings" /></button>
      {open === 'engine' && <EngineDialog onClose={() => setOpen(null)} />}
      {open === 'llm' && <LlmDialog onClose={() => setOpen(null)} />}
      {open === 'settings' && <SettingsDialog onClose={() => setOpen(null)} />}
    </header>
  );
}
