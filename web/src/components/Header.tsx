import { useState } from 'react';
import { useEngine } from '../lib/engine';
import { useLlm } from '../lib/llm';
import { EngineDialog } from './EngineDialog';
import { LlmDialog } from './LlmDialog';
import { Icon } from './icons';
import type { Route } from '../App';

export function Header({ route }: { route: Route }) {
  const status = useEngine((s) => s.status);
  const llm = useLlm((s) => s.status);
  const [open, setOpen] = useState<'engine' | 'llm' | null>(null);
  return (
    <header className="header">
      <a className="brand" href="#"><span className="logo"><Icon name="play" size={11} /></span> AutoStudio</a>
      <nav className="topnav">
        <a href="#" className={route.page === 'home' ? 'on' : ''}>Studio</a>
        <a href="#projects" className={route.page === 'projects' || route.page === 'editor' ? 'on' : ''}>Projects</a>
      </nav>
      <div className="grow" />
      <button className={`pill ${llm}`} onClick={() => setOpen('llm')} title="Local LLM assistant (LM Studio / Ollama)">
        <i /> {llm === 'ready' ? 'AI assistant' : 'Connect LLM'}
      </button>
      <button className={`pill ${status}`} onClick={() => setOpen('engine')}>
        <i /> {status === 'ready' ? 'Engine ready' : status === 'checking' ? 'Checking…' : 'Connect engine'}
      </button>
      {open === 'engine' && <EngineDialog onClose={() => setOpen(null)} />}
      {open === 'llm' && <LlmDialog onClose={() => setOpen(null)} />}
    </header>
  );
}
