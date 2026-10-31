import { create } from 'zustand';

export type EngineTool = 'tts' | 'transcribe' | 'upscale' | 'imagegen' | 'video_upscale' | 'prompts' | 'script' | 'chat';

/** Absolute URL for a file served by the engine. */
export const engineFileUrl = (u: string) => (u.startsWith('http') ? u : `${useEngine.getState().url}${u}`);

export interface JobState {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  logs: string[];
  files: { name: string; url: string }[];
  data?: any;
  error?: string;
}

interface EngineStore {
  url: string;
  status: 'offline' | 'checking' | 'ready';
  info?: { gpu: string; tools: string[]; drive: boolean };
  setUrl: (u: string) => void;
  check: () => Promise<boolean>;
}

const clean = (u: string) => u.trim().replace(/\/+$/, '');

export const useEngine = create<EngineStore>((set, get) => ({
  url: localStorage.getItem('engineUrl') ?? '',
  status: 'offline',
  setUrl: (u) => {
    localStorage.setItem('engineUrl', clean(u));
    set({ url: clean(u) });
  },
  check: async () => {
    const { url } = get();
    if (!url) return set({ status: 'offline' }), false;
    set({ status: 'checking' });
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
      const info = await r.json();
      set({ status: info.ok ? 'ready' : 'offline', info });
      return !!info.ok;
    } catch {
      set({ status: 'offline', info: undefined });
      return false;
    }
  },
}));

const base = () => {
  const { url, status } = useEngine.getState();
  if (!url || status !== 'ready') throw new Error('Colab engine is not connected. Click "Connect engine" first.');
  return url;
};

/** Submit a job and stream its state until it finishes. */
export async function runJob(tool: EngineTool, form: FormData, onUpdate: (j: JobState) => void, signal?: AbortSignal): Promise<JobState> {
  const url = base();
  const r = await fetch(`${url}/jobs/${tool}`, { method: 'POST', body: form, signal });
  if (!r.ok) throw new Error(`Engine error ${r.status}: ${await r.text()}`);
  const { id } = await r.json();
  for (;;) {
    if (signal?.aborted) {
      void fetch(`${url}/jobs/${id}/cancel`, { method: 'POST' }).catch(() => {});
      throw new DOMException('Cancelled', 'AbortError');
    }
    await new Promise((res) => setTimeout(res, 1200));
    const s: JobState = await (await fetch(`${url}/jobs/${id}`)).json();
    onUpdate(s);
    if (s.status === 'done') return s;
    if (s.status === 'error') throw new Error(s.error || 'Job failed');
  }
}

export async function fetchResult(fileUrl: string): Promise<Blob> {
  const u = fileUrl.startsWith('http') ? fileUrl : `${base()}${fileUrl}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  return r.blob();
}
