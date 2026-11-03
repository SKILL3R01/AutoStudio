import { useState } from 'react';
import { useEngine } from '../lib/engine';
import { useLlm } from '../lib/llm';
import { EngineDialog } from './EngineDialog';
import { LlmDialog } from './LlmDialog';
import { SettingsDialog } from './SettingsDialog';
import { Icon } from './icons';
import type { Route } from '../App';

export function Header({ route }: { route: Route }) {
  const status = useEngine((s) => s.status);
  const kind = useEngine((s) => s.kind);
  const llm = useLlm((s) => s.status);
  const [open, setOpen] = useState<'engine' | 'llm' | 'settings' | null>(null);
  return (
    <header className="header">
      <a className="brand" href="#" title={`AutoStudio v${__APP_VERSION__}`}><span className="logo"><Icon name="play" size={11} /></span> AutoStudio <em className="version">v{__APP_VERSION__}</em></a>
      <nav className="topnav">
        <a href="#" className={route.page === 'home' ? 'on' : ''}>Studio</a>
        <a href="#projects" className={route.page === 'projects' || route.page === 'editor' ? 'on' : ''}>Projects</a>
      </nav>
      <div className="grow" />
      <button className={`pill ${llm}`} onClick={() => setOpen('llm')} title="Local LLM assistant (LM Studio / Ollama)">
        <i /> {llm === 'ready' ? 'AI assistant' : 'Connect LLM'}
      </button>
      <button className={`pill ${status}`} onClick={() => setOpen('engine')}>
        <i /> {status === 'ready' ? (kind === 'tryai' ? 'TryAIToday engine' : 'Engine ready') : status === 'checking' ? 'Checking…' : 'Connect engine'}
      </button>
      <button className="icon-btn" onClick={() => setOpen('settings')} title="Settings (performance, layout, version)"><Icon name="settings" /></button>
      {open === 'engine' && <EngineDialog onClose={() => setOpen(null)} />}
      {open === 'llm' && <LlmDialog onClose={() => setOpen(null)} />}
      {open === 'settings' && <SettingsDialog onClose={() => setOpen(null)} />}
    </header>
  );
}
