import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Toasts, toast } from './components/Toast';
import { Home } from './pages/Home';
import { Projects } from './pages/Projects';
import { Editor } from './pages/Editor';
import { Voiceover } from './tools/Voiceover';
import { Transcript } from './tools/Transcript';
import { ImageGen } from './tools/ImageGen';
import { Upscale } from './tools/Upscale';
import { AutoVideo } from './tools/AutoVideo';
import { FlowBridge } from './tools/FlowBridge';
import { PromptStudio } from './tools/PromptStudio';
import { Growth, type GrowthTab } from './growth/Growth';
import { useEngine } from './lib/engine';
import { useLlm } from './lib/llm';

export type ToolId = 'voiceover' | 'transcript' | 'images' | 'upscale' | 'auto' | 'flow' | 'prompts';
export type Route = { page: 'home' } | { page: 'projects' } | { page: 'editor'; id: string } | { page: 'tool'; tool: ToolId } | { page: 'growth'; tab?: GrowthTab };

const parse = (): Route => {
  const [a, b] = location.hash.slice(1).split('/');
  if (a === 'editor' && b) return { page: 'editor', id: b };
  if (a === 'tools' && b) return { page: 'tool', tool: b as ToolId };
  if (a === 'projects') return { page: 'projects' };
  if (a === 'growth') return { page: 'growth', tab: (b || undefined) as GrowthTab | undefined };
  return { page: 'home' };
};

export const navigate = (r: Route) => {
  location.hash = r.page === 'home' ? '' : r.page === 'projects' ? 'projects' : r.page === 'editor' ? `editor/${r.id}` : r.page === 'growth' ? `growth${r.tab ? `/${r.tab}` : ''}` : `tools/${r.tool}`;
};

const TOOL_PAGES: Record<ToolId, () => React.JSX.Element> = {
  voiceover: Voiceover, transcript: Transcript, images: ImageGen, upscale: Upscale, auto: AutoVideo, flow: FlowBridge, prompts: PromptStudio,
};

export function App() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const demo = () => location.hash === '#demo' && void import('./lib/demo').then((m) => m.createDemoProject()).then((p) => navigate({ page: 'editor', id: p.id }));
    // `#engine=<url>` comes from the Colab notebook's "Connect" link (or the desktop app's autostudio:// handler).
    let lastHash = location.hash.startsWith('#engine=') ? '' : location.hash;
    const connect = () => {
      if (!location.hash.startsWith('#engine=')) return false;
      const url = decodeURIComponent(location.hash.slice(8));
      location.hash = lastHash;
      useEngine.getState().setUrl(url);
      void useEngine.getState().check().then((ok) => toast(ok ? `Engine connected · ${useEngine.getState().info?.gpu ?? 'GPU'}` : `Could not reach ${url}`, ok ? 'ok' : 'error'));
      return true;
    };
    const on = () => {
      if (connect()) return;
      lastHash = location.hash;
      setRoute(parse());
      demo();
    };
    window.addEventListener('hashchange', on);
    if (!connect()) demo();
    void useEngine.getState().check();
    // Reconnect the AI assistant silently when one was set up before (otherwise every AI button stays disabled).
    if (localStorage.getItem('llm')) void useLlm.getState().check();
    const iv = setInterval(() => {
      if (useEngine.getState().url) void useEngine.getState().check();
      if (localStorage.getItem('llm') && useLlm.getState().status === 'offline') void useLlm.getState().check();
    }, 60000);
    return () => (window.removeEventListener('hashchange', on), clearInterval(iv));
  }, []);
  const Tool = route.page === 'tool' ? TOOL_PAGES[route.tool] : null;
  return (
    <div className={`app ${route.page === 'editor' ? 'in-editor' : ''}`}>
      <Header route={route} />
      {route.page === 'home' && <Home />}
      {route.page === 'projects' && <Projects />}
      {route.page === 'editor' && <Editor key={route.id} id={route.id} />}
      {Tool && <Tool />}
      {route.page === 'growth' && <Growth tab={route.tab} />}
      <Toasts />
    </div>
  );
}
