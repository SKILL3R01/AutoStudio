import { create } from 'zustand';
import { runTryAiJob, TRYAI_TOOLS } from './tryai';

export type EngineTool = 'tts' | 'transcribe' | 'upscale' | 'imagegen' | 'video_upscale' | 'prompts' | 'script' | 'chat' | 'videogen';

/** Which Colab notebook is on the other end of the URL. */
export type EngineKind = 'autostudio' | 'tryai';

export const ENGINE_LABELS: Record<EngineKind, string> = { autostudio: 'AutoStudio engine', tryai: 'TryAIToday engine' };

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
  kind: EngineKind;
  info?: { gpu: string; tools: string[]; drive: boolean };
  setUrl: (u: string) => void;
  check: () => Promise<boolean>;
}

const clean = (u: string) => u.trim().replace(/\/+$/, '');

export const useEngine = create<EngineStore>((set, get) => ({
  url: globalThis.localStorage?.getItem('engineUrl') ?? '',
  status: 'offline',
  kind: 'autostudio',
  setUrl: (u) => {
    localStorage.setItem('engineUrl', clean(u));
    set({ url: clean(u) });
  },
  check: async () => {
    const { url } = get();
    if (!url) return set({ status: 'offline' }), false;
    set({ status: 'checking' });
    // A brand-new trycloudflare address can take a few seconds to resolve; retry instead of failing once
    // (the desktop app also drops its cached "not found" DNS answer between tries).
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) {
        await window.autostudio?.flushDns?.().catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (await probeOnce()) return true;
    }
    set({ status: 'offline', info: undefined });
    return false;
  },
}));

async function probeOnce(): Promise<boolean> {
  {
    const { url } = useEngine.getState();
    const set = useEngine.setState;
    const json = (path: string) => fetch(`${url}${path}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    try {
      const info = await json('/health');
      if (info.ok) return set({ status: 'ready', kind: 'autostudio', info }), true;
    } catch {
      /* not ours — try the TryAIToday notebook */
    }
    try {
      // TryAIToday Studio notebook: GET /api/health → { runners: { chatterbox: { ready }, whisper, upscaler, vupscaler } }
      const h = await json('/api/health');
      if (h.runners) {
        const tools = Object.entries(TRYAI_TOOLS).filter(([, runner]) => h.runners[runner]?.ready).map(([tool]) => tool);
        set({ status: 'ready', kind: 'tryai', info: { gpu: 'TryAIToday Studio', tools, drive: true } });
        return true;
      }
    } catch {
      /* offline */
    }
    return false;
  }
}

export interface Diagnostics {
  checks: { name: string; ok: boolean; detail: string }[];
  jobs: { id: string; tool: string; status: string; error: string | null; log: string[] }[];
}

/** Self-test of the AutoStudio engine (GPU, Chatterbox venv, whisper, diffusers, weights, ffmpeg) + recent job errors. */
export async function engineDiagnostics(): Promise<Diagnostics> {
  const { url, kind } = useEngine.getState();
  if (!url) throw new Error('No engine URL yet');
  if (kind === 'tryai') throw new Error('The self-check is part of the AutoStudio engine notebook.');
  const r = await fetch(`${url}/diagnostics`, { signal: AbortSignal.timeout(240000) });
  if (r.status === 404) throw new Error('This engine is an older notebook without the self-check — open the notebook again from “Open in Colab” and Run all.');
  if (!r.ok) throw new Error(`Engine error ${r.status}`);
  return r.json();
}

/** Can the connected engine run this tool? */
export const engineHas = (tool: EngineTool) => {
  const { status, info } = useEngine.getState();
  return status === 'ready' && !!info?.tools.includes(tool);
};

const base = () => {
  const { url, status } = useEngine.getState();
  if (!url || status !== 'ready') throw new Error('Colab engine is not connected. Click "Connect engine" first.');
  return url;
};

/** Submit a job and stream its state until it finishes (works with both engines). */
export async function runJob(tool: EngineTool, form: FormData, onUpdate: (j: JobState) => void, signal?: AbortSignal): Promise<JobState> {
  const url = base();
  const { kind, info } = useEngine.getState();
  if (kind === 'tryai') return runTryAiJob(url, tool, form, onUpdate, signal);
  if (info && !info.tools.includes(tool)) throw new Error(`This engine has no "${tool}" tool — re-run the latest AutoStudio notebook in Colab.`);
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
